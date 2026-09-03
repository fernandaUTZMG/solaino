-- =============================================================================
-- BODEGA: Versiones de entregas (Diseño) + historial + estados extendidos + avance automático
-- Ejecuta en Supabase → SQL Editor DESPUÉS de `schema_bodega.sql`.
-- =============================================================================

-- 1) Extender estados permitidos en bodega_projects
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'bodega_projects_status_check'
  ) then
    alter table public.bodega_projects drop constraint bodega_projects_status_check;
  end if;
exception when others then
  null;
end $$;

alter table public.bodega_projects
  add constraint bodega_projects_status_check
  check (
    status in (
      'pendiente',
      'en_diseno',
      'revision_diseno',
      'modificacion_diseno',
      'diseno_aprobado',
      'en_programacion',
      'revision_programacion',
      'terminado'
    )
  );

comment on constraint bodega_projects_status_check on public.bodega_projects is
  'Estados del flujo PLM ligero (diseño → revisión → programación).';

-- 2) Avance automático por estado
create or replace function public.bodega_project_avance_for_status(p_status text)
returns int
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select case p_status
    when 'pendiente' then 0
    when 'en_diseno' then 20
    when 'revision_diseno' then 50
    when 'modificacion_diseno' then 60
    when 'diseno_aprobado' then 70
    when 'en_programacion' then 85
    when 'revision_programacion' then 95
    when 'terminado' then 100
    else 0
  end;
$$;

create or replace function public.bodega_projects_apply_avance_trg()
returns trigger
language plpgsql
as $$
begin
  -- Solo recalculamos si cambió el status o si avance_pct viene nulo/0 en inserción.
  if tg_op = 'INSERT' then
    new.avance_pct := public.bodega_project_avance_for_status(new.status);
  elsif tg_op = 'UPDATE' then
    if new.status is distinct from old.status then
      new.avance_pct := public.bodega_project_avance_for_status(new.status);
    end if;
  end if;

  -- Si el status llega a terminado, aseguramos fecha_termino si está vacía.
  if new.status = 'terminado' and new.fecha_termino is null then
    new.fecha_termino := current_date;
  end if;

  return new;
end;
$$;

drop trigger if exists bodega_projects_set_avance_from_status on public.bodega_projects;
create trigger bodega_projects_set_avance_from_status
  before insert or update of status on public.bodega_projects
  for each row
  execute function public.bodega_projects_apply_avance_trg();

-- 3) Versiones de diseño (ZIP por entrega completa)
create table if not exists public.project_design_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.bodega_projects(id) on delete cascade,
  version int not null check (version >= 1),

  package_category text not null default 'entrega_diseno'
    check (package_category in ('entrega_diseno', 'info_cliente')),

  zip_storage_path text not null,
  zip_filename text not null,

  status text not null default 'subida'
    check (status in ('subida', 'en_revision', 'requiere_cambios', 'aprobada')),

  entry_html_path text,
  manifest jsonb,
  comentarios text,

  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

comment on table public.project_design_versions is
  'Entregas de diseño por proyecto: 1 ZIP por versión. package_category info_cliente = referencia del supervisor para la diseñadora (no cuenta como entrega formal).';

create unique index if not exists project_design_versions_project_cat_version_uidx
  on public.project_design_versions (project_id, package_category, version);

create index if not exists project_design_versions_project_created_idx
  on public.project_design_versions (project_id, created_at desc);

-- 4) Historial de actividad (trazabilidad)
create table if not exists public.project_activity (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.bodega_projects(id) on delete cascade,
  actor_id uuid references auth.users(id),
  type text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);

comment on table public.project_activity is
  'Historial de eventos: subidas, revisiones, cambios de estado, aprobaciones.';

create index if not exists project_activity_project_created_idx
  on public.project_activity (project_id, created_at desc);

-- 5) RPC para que Supervisor (admin/encargado) pueda cambiar estado sin abrir update general en RLS
create or replace function public.bodega_set_project_status(
  p_project_id uuid,
  p_status text,
  p_comment text default null,
  p_design_version_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  r text;
  cur text;
begin
  r := public.my_role();

  select p.status into strict cur
  from public.bodega_projects p
  where p.id = p_project_id;

  if r in ('admin', 'encargado') then
    update public.bodega_projects
      set status = p_status
    where id = p_project_id;
    if not found then
      raise exception 'Proyecto no encontrado';
    end if;
  elsif r = 'disenadora' then
    if p_status is distinct from 'revision_diseno' then
      raise exception 'La diseñadora solo puede enviar el proyecto a «revisión diseño» (revision_diseno)';
    end if;
    if cur not in ('en_diseno', 'modificacion_diseno') then
      raise exception 'No se puede enviar a revisión de diseño desde el estado actual (%).', cur;
    end if;
    update public.bodega_projects
      set status = 'revision_diseno'
    where id = p_project_id and status in ('en_diseno', 'modificacion_diseno');
    if not found then
      raise exception 'No se pudo pasar a revisión de diseño (estado ya cambió).';
    end if;
  elsif r = 'programadora_maquinaria' then
    if p_status is distinct from 'en_programacion' then
      raise exception 'La programadora solo puede registrar «en programación» (en_programacion) desde diseño aprobado';
    end if;
    if cur is distinct from 'diseno_aprobado' then
      raise exception 'Solo con diseño aprobado se puede pasar a programación desde aquí (estado actual: %).', cur;
    end if;
    update public.bodega_projects
      set status = 'en_programacion'
    where id = p_project_id and status = 'diseno_aprobado';
    if not found then
      raise exception 'No se pudo pasar a programación (¿diseño aún no aprobado o etapa ya avanzó?).';
    end if;
  else
    raise exception 'Solo supervisor (admin/encargado) puede fijar este estado; diseñadora/programadora tienen transiciones limitadas';
  end if;

  insert into public.project_activity(project_id, actor_id, type, payload)
  values(
    p_project_id,
    auth.uid(),
    'status_changed',
    jsonb_build_object('status', p_status, 'comment', p_comment, 'design_version_id', p_design_version_id)
  );
end;
$$;

grant execute on function public.bodega_set_project_status(uuid, text, text, uuid) to authenticated;

notify pgrst, 'reload schema';

-- Avance manual (registrado por diseño/programación/supervisor sin subir ZIP)
create or replace function public.bodega_set_avance_manual(
  p_project_id uuid,
  p_avance_pct int,
  p_comment text default null
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  r text;
begin
  r := public.my_role();
  if r not in ('admin', 'encargado', 'disenadora', 'programadora_maquinaria') then
    raise exception 'Solo roles de bodega (diseñadora, programadora, encargado o admin) pueden registrar avance manual';
  end if;

  if p_avance_pct < 0 or p_avance_pct > 100 then
    raise exception 'El avance debe estar entre 0 y 100';
  end if;

  update public.bodega_projects
  set
    avance_pct = p_avance_pct,
    updated_at = now()
  where id = p_project_id;

  if not found then
    raise exception 'Proyecto no encontrado';
  end if;

  insert into public.project_activity(project_id, actor_id, type, payload)
  values (
    p_project_id,
    auth.uid(),
    'avance_manual',
    jsonb_build_object('avance_pct', p_avance_pct, 'comment', p_comment)
  );
end;
$$;

grant execute on function public.bodega_set_avance_manual(uuid, int, text) to authenticated;

notify pgrst, 'reload schema';
