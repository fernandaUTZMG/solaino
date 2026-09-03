-- Revisión de diseño por pieza + estado diseno_parcial + reloj de diseño en rondas.
-- Ejecuta en Supabase → SQL Editor después de schema_bodega_versions y work_intervals.

-- 1) Estados extendidos
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'bodega_projects_status_check') then
    alter table public.bodega_projects drop constraint bodega_projects_status_check;
  end if;
exception when others then null;
end $$;

alter table public.bodega_projects
  add constraint bodega_projects_status_check
  check (
    status in (
      'pendiente',
      'en_diseno',
      'revision_diseno',
      'modificacion_diseno',
      'diseno_parcial',
      'diseno_aprobado',
      'en_programacion',
      'revision_programacion',
      'terminado'
    )
  );

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'project_design_versions_status_check'
  ) then
    alter table public.project_design_versions drop constraint project_design_versions_status_check;
  end if;
exception when others then null;
end $$;

alter table public.project_design_versions
  add constraint project_design_versions_status_check
  check (
    status in ('subida', 'en_revision', 'requiere_cambios', 'aprobada', 'aprobada_parcial')
  );

-- 2) Piezas: estado de diseño individual
alter table public.bodega_project_pieces
  add column if not exists design_status text
    check (design_status is null or design_status in ('en_revision', 'aprobada', 'requiere_cambios')),
  add column if not exists design_approved_at timestamptz,
  add column if not exists design_approved_from_version int,
  add column if not exists design_correction_round int not null default 0;

comment on column public.bodega_project_pieces.design_status is
  'Estado de revisión de diseño por pieza: aprobada | requiere_cambios | en_revision.';
comment on column public.bodega_project_pieces.design_correction_round is
  'Número de ronda de corrección en la que se aprobó o rechazó por última vez.';

-- 3) Historial de revisión por pieza / versión
create table if not exists public.design_version_piece_reviews (
  id uuid primary key default gen_random_uuid(),
  design_version_id uuid not null references public.project_design_versions(id) on delete cascade,
  project_id uuid not null references public.bodega_projects(id) on delete cascade,
  source_path text not null,
  piece_id uuid references public.bodega_project_pieces(id) on delete set null,
  status text not null check (status in ('aprobada', 'requiere_cambios')),
  feedback text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz not null default now(),
  correction_round int not null default 1
);

create index if not exists design_version_piece_reviews_version_idx
  on public.design_version_piece_reviews (design_version_id);
create index if not exists design_version_piece_reviews_project_idx
  on public.design_version_piece_reviews (project_id, reviewed_at desc);

alter table public.design_version_piece_reviews enable row level security;

drop policy if exists "design_piece_reviews_select" on public.design_version_piece_reviews;
create policy "design_piece_reviews_select"
  on public.design_version_piece_reviews for select
  to authenticated
  using (public.is_bodega());

-- 4) Avance automático con diseño parcial
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
    when 'modificacion_diseno' then 55
    when 'diseno_parcial' then 65
    when 'diseno_aprobado' then 70
    when 'en_programacion' then 85
    when 'revision_programacion' then 95
    when 'terminado' then 100
    else 0
  end;
$$;

-- 5) Helpers de reloj de diseño
create or replace function public.bodega_design_correction_round(p_project_id uuid)
returns int
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select coalesce(
    (
      select max(v.version)
      from public.project_design_versions v
      where v.project_id = p_project_id
        and v.package_category = 'entrega_diseno'
    ),
    0
  )::int;
$$;

create or replace function public.bodega_work_interval_open_design(
  p_project_id uuid,
  p_started_at timestamptz,
  p_meta jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  oc_id uuid;
  new_id uuid;
begin
  select p.orden_compra_id into oc_id
  from public.bodega_projects p
  where p.id = p_project_id;

  insert into public.bodega_project_work_intervals (
    project_id, orden_compra_id, actor_id, lane, started_at, meta
  ) values (
    p_project_id,
    oc_id,
    auth.uid(),
    'diseno',
    p_started_at,
    coalesce(p_meta, '{}'::jsonb)
  )
  returning id into new_id;

  return new_id;
end;
$$;

-- 6) Entrega ZIP: cierra reloj diseño con fase (inicial o corrección)
create or replace function public.bodega_tw_after_design_version_insert()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  rnd int;
  st text;
  is_correction boolean := false;
begin
  if new.package_category <> 'entrega_diseno' then
    return new;
  end if;

  select p.status into st from public.bodega_projects p where p.id = new.project_id;
  rnd := public.bodega_design_correction_round(new.project_id);
  is_correction := rnd > 1 or st in ('modificacion_diseno', 'diseno_parcial');

  perform public.bodega_work_interval_close_open(
    new.project_id,
    'diseno',
    new.created_at,
    jsonb_build_object(
      'closed_by', case when is_correction then 'design_zip_correction_upload' else 'design_zip_upload' end,
      'design_version_id', new.id,
      'design_version', new.version,
      'phase', case when is_correction then 'correccion' else 'inicial' end,
      'correction_round', rnd
    )
  );

  return new;
end;
$$;

drop trigger if exists bodega_tw_design_version_insert_trg on public.project_design_versions;
create trigger bodega_tw_design_version_insert_trg
  after insert on public.project_design_versions
  for each row
  execute function public.bodega_tw_after_design_version_insert();

-- 7) RPC: resolver revisión pieza a pieza
create or replace function public.bodega_resolve_design_piece_review(
  p_design_version_id uuid,
  p_reviews jsonb,
  p_comment text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  r text;
  v record;
  rev record;
  n_approved int := 0;
  n_rejected int := 0;
  n_total int := 0;
  n_proj_approved int := 0;
  n_proj_rejected int := 0;
  new_version_status text;
  new_project_status text;
  piece_id uuid;
  piece_label text;
  rnd int;
  path_norm text;
  st text;
begin
  r := public.my_role();
  if r not in ('admin', 'encargado') then
    raise exception 'Solo supervisor (admin o encargado) puede resolver la revisión de diseño';
  end if;

  if p_reviews is null or jsonb_typeof(p_reviews) <> 'array' or jsonb_array_length(p_reviews) < 1 then
    raise exception 'Indica el resultado de revisión para al menos una pieza';
  end if;

  select d.*, p.status as project_status
  into v
  from public.project_design_versions d
  join public.bodega_projects p on p.id = d.project_id
  where d.id = p_design_version_id
    and d.package_category = 'entrega_diseno';

  if not found then
    raise exception 'Versión de diseño no encontrada';
  end if;

  if v.status <> 'en_revision' then
    raise exception 'Esta versión ya fue revisada (estado: %)', v.status;
  end if;

  rnd := v.version;
  st := v.project_status;

  for rev in
    select *
    from jsonb_to_recordset(p_reviews) as x(
      source_path text,
      status text,
      feedback text
    )
  loop
    path_norm := trim(replace(coalesce(rev.source_path, ''), E'\\', '/'));
    if path_norm = '' then
      raise exception 'Ruta de pieza vacía en la revisión';
    end if;
    if rev.status not in ('aprobada', 'requiere_cambios') then
      raise exception 'Estado inválido para %: %', path_norm, rev.status;
    end if;
    if rev.status = 'requiere_cambios' and nullif(trim(coalesce(rev.feedback, '')), '') is null then
      raise exception 'Indica el motivo de corrección para: %', path_norm;
    end if;

    n_total := n_total + 1;
    if rev.status = 'aprobada' then
      n_approved := n_approved + 1;
    else
      n_rejected := n_rejected + 1;
    end if;

    piece_label := regexp_replace(path_norm, '^.*/', '');
    if piece_label = '' then
      piece_label := path_norm;
    end if;
    piece_label := regexp_replace(piece_label, '\.[^.]+$', '');

    select bp.id into piece_id
    from public.bodega_project_pieces bp
    where bp.project_id = v.project_id
      and bp.source_path = path_norm;

    if piece_id is null then
      insert into public.bodega_project_pieces (
        project_id, label, source_path, design_status,
        design_approved_at, design_approved_from_version, design_correction_round,
        supervisor_design_feedback
      ) values (
        v.project_id,
        piece_label,
        path_norm,
        rev.status,
        case when rev.status = 'aprobada' then now() else null end,
        case when rev.status = 'aprobada' then v.version else null end,
        rnd,
        case when rev.status = 'requiere_cambios' then nullif(trim(rev.feedback), '') else null end
      )
      returning id into piece_id;
    else
      update public.bodega_project_pieces
      set
        design_status = rev.status,
        design_approved_at = case when rev.status = 'aprobada' then now() else null end,
        design_approved_from_version = case when rev.status = 'aprobada' then v.version else design_approved_from_version end,
        design_correction_round = rnd,
        supervisor_design_feedback = case
          when rev.status = 'requiere_cambios' then nullif(trim(rev.feedback), '')
          else supervisor_design_feedback
        end,
        updated_at = now()
      where id = piece_id;
    end if;

    insert into public.design_version_piece_reviews (
      design_version_id, project_id, source_path, piece_id,
      status, feedback, reviewed_by, correction_round
    ) values (
      p_design_version_id, v.project_id, path_norm, piece_id,
      rev.status, nullif(trim(coalesce(rev.feedback, '')), ''), auth.uid(), rnd
    );
  end loop;

  if n_approved = n_total then
    new_version_status := 'aprobada';
  elsif n_rejected = n_total then
    new_version_status := 'requiere_cambios';
  else
    new_version_status := 'aprobada_parcial';
  end if;

  select count(*) into n_proj_rejected
  from public.bodega_project_pieces bp
  where bp.project_id = v.project_id
    and bp.design_status = 'requiere_cambios';

  select count(*) into n_proj_approved
  from public.bodega_project_pieces bp
  where bp.project_id = v.project_id
    and bp.design_status = 'aprobada';

  if n_proj_rejected > 0 and n_proj_approved > 0 then
    new_project_status := 'diseno_parcial';
  elsif n_proj_rejected > 0 then
    new_project_status := 'modificacion_diseno';
  else
    new_project_status := 'diseno_aprobado';
  end if;

  if new_project_status = 'diseno_aprobado' then
    new_version_status := 'aprobada';
  elsif new_project_status = 'diseno_parcial' and new_version_status = 'aprobada' then
    new_version_status := 'aprobada_parcial';
  end if;

  update public.project_design_versions
  set
    status = new_version_status,
    comentarios = coalesce(nullif(trim(p_comment), ''), comentarios)
  where id = p_design_version_id;

  update public.bodega_projects
  set status = new_project_status, updated_at = now()
  where id = v.project_id;

  -- Cierra otras versiones en revisión del mismo proyecto
  update public.project_design_versions
  set
    status = 'subida',
    comentarios = coalesce(comentarios, '') || case
      when comentarios is null or trim(comentarios) = '' then 'Cerrada al resolver versión ' || v.version::text
      else ' · Cerrada al resolver versión ' || v.version::text
    end
  where project_id = v.project_id
    and package_category = 'entrega_diseno'
    and status = 'en_revision'
    and id <> p_design_version_id;

  if n_proj_rejected > 0 then
    perform public.bodega_work_interval_open_design(
      v.project_id,
      now(),
      jsonb_build_object(
        'opened_by', 'design_partial_review',
        'phase', 'correccion',
        'correction_round', rnd,
        'pieces_pending', n_proj_rejected,
        'pieces_approved', n_proj_approved,
        'design_version_id', p_design_version_id
      )
    );
  elsif new_project_status = 'diseno_aprobado' then
    perform public.bodega_work_interval_close_open(
      v.project_id,
      'diseno',
      now(),
      jsonb_build_object(
        'closed_by', 'design_fully_approved',
        'design_version_id', p_design_version_id
      )
    );
  end if;

  insert into public.project_activity (project_id, actor_id, type, payload)
  values (
    v.project_id,
    auth.uid(),
    case
      when new_version_status = 'aprobada' then 'design_approved'
      when new_version_status = 'requiere_cambios' then 'design_revision_requested'
      else 'design_partial_review'
    end,
    jsonb_build_object(
      'version', v.version,
      'design_version_id', p_design_version_id,
      'approved_count', n_approved,
      'rejected_count', n_rejected,
      'total_count', n_total,
      'version_status', new_version_status,
      'project_status', new_project_status,
      'comment', nullif(trim(coalesce(p_comment, '')), '')
    )
  );

  insert into public.project_activity (project_id, actor_id, type, payload)
  values (
    v.project_id,
    auth.uid(),
    'status_changed',
    jsonb_build_object(
      'status', new_project_status,
      'comment', nullif(trim(coalesce(p_comment, '')), ''),
      'design_version_id', p_design_version_id
    )
  );

  return jsonb_build_object(
    'approved_count', n_approved,
    'rejected_count', n_rejected,
    'version_status', new_version_status,
    'project_status', new_project_status
  );
end;
$$;

grant execute on function public.bodega_resolve_design_piece_review(uuid, jsonb, text) to authenticated;

-- 8) Programadora puede iniciar programación con diseño parcial (piezas ya aprobadas)
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
    update public.bodega_projects set status = p_status where id = p_project_id;
    if not found then raise exception 'Proyecto no encontrado'; end if;
  elsif r = 'disenadora' then
    if p_status is distinct from 'revision_diseno' then
      raise exception 'La diseñadora solo puede enviar el proyecto a «revisión diseño» (revision_diseno)';
    end if;
    if cur not in ('en_diseno', 'modificacion_diseno', 'diseno_parcial') then
      raise exception 'No se puede enviar a revisión de diseño desde el estado actual (%).', cur;
    end if;
    update public.bodega_projects
      set status = 'revision_diseno'
    where id = p_project_id and status in ('en_diseno', 'modificacion_diseno', 'diseno_parcial');
    if not found then raise exception 'No se pudo pasar a revisión de diseño (estado ya cambió).'; end if;
  elsif r = 'programadora_maquinaria' then
    if p_status is distinct from 'en_programacion' then
      raise exception 'La programadora solo puede registrar «en programación» (en_programacion)';
    end if;
    if cur not in ('diseno_aprobado', 'diseno_parcial') then
      raise exception 'Solo con diseño aprobado o parcial se puede pasar a programación (estado actual: %).', cur;
    end if;
    update public.bodega_projects
      set status = 'en_programacion'
    where id = p_project_id and status in ('diseno_aprobado', 'diseno_parcial');
    if not found then raise exception 'No se pudo pasar a programación.'; end if;
  else
    raise exception 'Solo supervisor puede fijar este estado; diseñadora/programadora tienen transiciones limitadas';
  end if;

  insert into public.project_activity(project_id, actor_id, type, payload)
  values(
    p_project_id, auth.uid(), 'status_changed',
    jsonb_build_object('status', p_status, 'comment', p_comment, 'design_version_id', p_design_version_id)
  );
end;
$$;

grant execute on function public.bodega_set_project_status(uuid, text, text, uuid) to authenticated;

notify pgrst, 'reload schema';
