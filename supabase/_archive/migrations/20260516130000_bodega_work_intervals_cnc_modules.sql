-- Reloj de taller por proyecto: orden (desde fecha OC), diseño, 3 CNC, 3 máquina, armado.
-- Minutos hábiles se calculan en cliente (lun–vie 8:00–17:30); aquí solo marcamos intervalos started_at/ended_at.

-- 1) Tres módulos CNC en paralelo por proyecto (versiones independientes por módulo)
alter table public.project_machine_versions
  add column if not exists cnc_module text not null default 'programacion'
    check (cnc_module in ('programacion', 'torno', 'perfilado'));

comment on column public.project_machine_versions.cnc_module is
  'Programación CNC | Torno | Perfilado — versiones y ZIP por módulo en paralelo.';

drop index if exists public.project_machine_versions_project_version_uidx;

create unique index if not exists project_machine_versions_project_module_version_uidx
  on public.project_machine_versions (project_id, cnc_module, version);

create index if not exists project_machine_versions_project_module_created_idx
  on public.project_machine_versions (project_id, cnc_module, created_at desc);

-- 2) Intervalos de trabajo (timestamps reales; recorte hábil en app)
create table if not exists public.bodega_project_work_intervals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.bodega_projects(id) on delete cascade,
  orden_compra_id uuid references public.bodega_ordenes_compra(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  lane text not null check (
    lane in (
      'orden',
      'diseno',
      'cnc_programacion',
      'cnc_torno',
      'cnc_perfilado',
      'maquina_programacion',
      'maquina_torno',
      'maquina_perfilado',
      'armado'
    )
  ),
  started_at timestamptz not null,
  ended_at timestamptz,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.bodega_project_work_intervals is
  'Intervalos por proyecto y carril (orden, diseño, CNC×3, máquina×3, armado). ended_at null = reloj abierto.';

create index if not exists bodega_work_intervals_project_lane_idx
  on public.bodega_project_work_intervals (project_id, lane);

create index if not exists bodega_work_intervals_project_open_idx
  on public.bodega_project_work_intervals (project_id)
  where ended_at is null;

alter table public.bodega_project_work_intervals enable row level security;

drop policy if exists "bodega_work_intervals_select" on public.bodega_project_work_intervals;
drop policy if exists "bodega_work_intervals_insert" on public.bodega_project_work_intervals;

create policy "bodega_work_intervals_select"
  on public.bodega_project_work_intervals for select
  to authenticated
  using (public.is_bodega());

create policy "bodega_work_intervals_insert"
  on public.bodega_project_work_intervals for insert
  to authenticated
  with check (public.is_bodega());

-- 3) Helpers y RPC (inicio manual: diseño, CNC, armado)
create or replace function public.bodega_lane_for_cnc_module(p text)
returns text
language sql
immutable
as $$
  select case trim(lower(coalesce(p, '')))
    when 'torno' then 'cnc_torno'
    when 'perfilado' then 'cnc_perfilado'
    else 'cnc_programacion'
  end;
$$;

create or replace function public.bodega_lane_for_maquina_module(p text)
returns text
language sql
immutable
as $$
  select case trim(lower(coalesce(p, '')))
    when 'torno' then 'maquina_torno'
    when 'perfilado' then 'maquina_perfilado'
    else 'maquina_programacion'
  end;
$$;

create or replace function public.bodega_work_interval_close_open(
  p_project_id uuid,
  p_lane text,
  p_end timestamptz,
  p_meta jsonb default '{}'::jsonb
)
returns int
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  n int;
begin
  update public.bodega_project_work_intervals
  set
    ended_at = p_end,
    meta = coalesce(meta, '{}'::jsonb) || coalesce(p_meta, '{}'::jsonb)
  where project_id = p_project_id
    and lane = p_lane
    and ended_at is null;
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.bodega_work_interval_start(p_project_id uuid, p_lane text)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  r text := public.my_role();
  oc_id uuid;
  v_id uuid;
begin
  if not public.is_bodega() then
    raise exception 'Solo cuentas de bodega pueden registrar intervalos';
  end if;

  if p_lane not in (
    'diseno',
    'cnc_programacion',
    'cnc_torno',
    'cnc_perfilado',
    'armado'
  ) then
    raise exception 'lane no permitida para inicio manual: %', p_lane;
  end if;

  if p_lane = 'diseno' and r not in ('admin', 'encargado', 'disenadora') then
    raise exception 'Solo diseñadora o supervisor puede iniciar reloj de diseño';
  end if;

  if p_lane like 'cnc_%' and r not in ('admin', 'encargado', 'programadora_maquinaria') then
    raise exception 'Solo programadora o supervisor puede iniciar reloj CNC';
  end if;

  if p_lane = 'armado' and r not in ('admin', 'encargado', 'disenadora', 'programadora_maquinaria') then
    raise exception 'Solo roles con subida de evidencias pueden iniciar armado';
  end if;

  if not exists (select 1 from public.bodega_projects p where p.id = p_project_id) then
    raise exception 'Proyecto no encontrado';
  end if;

  select p.orden_compra_id into oc_id
  from public.bodega_projects p
  where p.id = p_project_id;

  if exists (
    select 1
    from public.bodega_project_work_intervals w
    where w.project_id = p_project_id
      and w.lane = p_lane
      and w.actor_id = auth.uid()
      and w.ended_at is null
  ) then
    return (
      select w.id
      from public.bodega_project_work_intervals w
      where w.project_id = p_project_id
        and w.lane = p_lane
        and w.actor_id = auth.uid()
        and w.ended_at is null
      limit 1
    );
  end if;

  insert into public.bodega_project_work_intervals (
    project_id,
    orden_compra_id,
    actor_id,
    lane,
    started_at
  ) values (
    p_project_id,
    oc_id,
    auth.uid(),
    p_lane,
    now()
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.bodega_work_interval_start(uuid, text) to authenticated;
grant execute on function public.bodega_lane_for_cnc_module(text) to authenticated;
grant execute on function public.bodega_lane_for_maquina_module(text) to authenticated;

-- 4) Al crear proyecto: intervalo «orden» desde fecha OC 08:00 o created_at
create or replace function public.bodega_tw_after_project_insert()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  t0 timestamptz;
  oc_fecha date;
begin
  t0 := new.created_at;
  if new.orden_compra_id is not null then
    select o.fecha into oc_fecha
    from public.bodega_ordenes_compra o
    where o.id = new.orden_compra_id;
    if oc_fecha is not null then
      t0 := (oc_fecha::timestamp + time '08:00')::timestamptz;
      if t0 > new.created_at then
        t0 := new.created_at;
      end if;
    end if;
  end if;

  insert into public.bodega_project_work_intervals (
    project_id,
    orden_compra_id,
    actor_id,
    lane,
    started_at,
    meta
  ) values (
    new.id,
    new.orden_compra_id,
    null,
    'orden',
    t0,
    jsonb_build_object('source', 'project_created')
  );
  return new;
end;
$$;

drop trigger if exists bodega_tw_project_insert_trg on public.bodega_projects;
create trigger bodega_tw_project_insert_trg
  after insert on public.bodega_projects
  for each row
  execute function public.bodega_tw_after_project_insert();

-- 5) Entrega de diseño (ZIP entrega_diseno): cierra reloj diseño
create or replace function public.bodega_tw_after_design_version_insert()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if new.package_category = 'entrega_diseno' then
    perform public.bodega_work_interval_close_open(
      new.project_id,
      'diseno',
      new.created_at,
      jsonb_build_object('closed_by', 'design_zip_upload', 'design_version_id', new.id)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists bodega_tw_design_version_insert_trg on public.project_design_versions;
create trigger bodega_tw_design_version_insert_trg
  after insert on public.project_design_versions
  for each row
  execute function public.bodega_tw_after_design_version_insert();

-- 6) ZIP CNC: cierra carril CNC del módulo y abre «maquina» del mismo módulo
create or replace function public.bodega_tw_after_machine_version_insert()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  lane_cnc text := public.bodega_lane_for_cnc_module(new.cnc_module);
  lane_maq text := public.bodega_lane_for_maquina_module(new.cnc_module);
  oc_id uuid;
begin
  select p.orden_compra_id into oc_id
  from public.bodega_projects p
  where p.id = new.project_id;

  perform public.bodega_work_interval_close_open(
    new.project_id,
    lane_cnc,
    new.created_at,
    jsonb_build_object('closed_by', 'cnc_zip_upload', 'machine_version_id', new.id, 'cnc_module', new.cnc_module)
  );

  perform public.bodega_work_interval_close_open(
    new.project_id,
    lane_maq,
    new.created_at,
    jsonb_build_object('closed_by', 'superseded_new_cnc_upload')
  );

  insert into public.bodega_project_work_intervals (
    project_id,
    orden_compra_id,
    actor_id,
    lane,
    started_at,
    meta
  ) values (
    new.project_id,
    oc_id,
    new.uploaded_by,
    lane_maq,
    new.created_at,
    jsonb_build_object('opened_by', 'cnc_zip_upload', 'machine_version_id', new.id, 'cnc_module', new.cnc_module)
  );

  return new;
end;
$$;

drop trigger if exists bodega_tw_machine_version_insert_trg on public.project_machine_versions;
create trigger bodega_tw_machine_version_insert_trg
  after insert on public.project_machine_versions
  for each row
  execute function public.bodega_tw_after_machine_version_insert();

-- 7) CNC aprobado por supervisor: cierra «maquina» de ese módulo
create or replace function public.bodega_tw_after_machine_version_update()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  lane_maq text := public.bodega_lane_for_maquina_module(new.cnc_module);
begin
  if new.status is distinct from old.status and new.status = 'aprobada' then
    perform public.bodega_work_interval_close_open(
      new.project_id,
      lane_maq,
      now(),
      jsonb_build_object('closed_by', 'machine_zip_approved', 'machine_version_id', new.id, 'cnc_module', new.cnc_module)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists bodega_tw_machine_version_update_trg on public.project_machine_versions;
create trigger bodega_tw_machine_version_update_trg
  after update of status on public.project_machine_versions
  for each row
  execute function public.bodega_tw_after_machine_version_update();

-- 8) Fotos: cierra armado, máquinas abiertas y orden (fin de proyecto a nivel reloj)
create or replace function public.bodega_tw_after_piece_photo_insert()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  perform public.bodega_work_interval_close_open(
    new.project_id,
    'armado',
    new.created_at,
    jsonb_build_object('closed_by', 'piece_photo', 'photo_id', new.id)
  );

  perform public.bodega_work_interval_close_open(
    new.project_id,
    'maquina_programacion',
    new.created_at,
    jsonb_build_object('closed_by', 'piece_photo', 'photo_id', new.id)
  );
  perform public.bodega_work_interval_close_open(
    new.project_id,
    'maquina_torno',
    new.created_at,
    jsonb_build_object('closed_by', 'piece_photo', 'photo_id', new.id)
  );
  perform public.bodega_work_interval_close_open(
    new.project_id,
    'maquina_perfilado',
    new.created_at,
    jsonb_build_object('closed_by', 'piece_photo', 'photo_id', new.id)
  );

  perform public.bodega_work_interval_close_open(
    new.project_id,
    'orden',
    new.created_at,
    jsonb_build_object('closed_by', 'piece_photo_fin', 'photo_id', new.id)
  );

  return new;
end;
$$;

drop trigger if exists bodega_tw_piece_photo_insert_trg on public.project_piece_photos;
create trigger bodega_tw_piece_photo_insert_trg
  after insert on public.project_piece_photos
  for each row
  execute function public.bodega_tw_after_piece_photo_insert();

notify pgrst, 'reload schema';
