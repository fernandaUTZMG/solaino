-- =============================================================================
-- Flujo por PIEZA (nuevo): rutas CNC/Torno/Perfilado, acabado por pieza,
-- tiempos por etapa por pieza, notas de contratiempo diseño, cierre proyecto supervisor.
-- Documentación breve en comentarios de tabla/columnas.
-- Requiere is_bodega() existente (schema_bodega.sql).
-- =============================================================================

-- 1) Rol operador de taller (perfilado / maquinado / futuros views por rol)
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'profiles_role_check') then
    alter table public.profiles drop constraint profiles_role_check;
  end if;
exception when others then
  null;
end $$;

alter table public.profiles
  add constraint profiles_role_check
  check (
    role in (
      'admin',
      'user',
      'encargado',
      'disenadora',
      'programadora_maquinaria',
      'operador_bodega'
    )
  );

create or replace function public.is_bodega()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select public.my_role()
    in (
      'admin',
      'encargado',
      'disenadora',
      'programadora_maquinaria',
      'operador_bodega'
    );
$$;

create or replace function public.is_operador_bodega()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select public.my_role() in ('admin', 'encargado', 'operador_bodega');
$$;

comment on function public.is_operador_bodega() is
  'Operador de taller (perfilado/maquinado); admin y encargado pueden operar por soporte.';

-- 2) Columnas proyecto (contratiempos diseño, confirmación rutas programadora, cierre formal)
alter table public.bodega_projects
  add column if not exists design_contratiempo_notes text;

alter table public.bodega_projects
  add column if not exists programming_routes_confirmed_at timestamptz;

comment on column public.bodega_projects.design_contratiempo_notes is
  'Notas de la diseñadora cuando hay retraso sin ZIP final de diseño.';

comment on column public.bodega_projects.programming_routes_confirmed_at is
  'Cuándo la programadora cerró la fase “arrastrar piezas” a CNC/Torno/Perfilado.';

alter table public.bodega_projects
  add column if not exists project_finalized_at timestamptz;

alter table public.bodega_projects
  add column if not exists project_finalized_by uuid references auth.users (id) on delete set null;

comment on column public.bodega_projects.project_finalized_at is
  'Solo supervisor: marca proyecto cerrado tras fotos y botón «Finalizar proyecto».';

-- 3) Piezas por proyecto
create or replace function public.bodega_generic_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create table if not exists public.bodega_project_pieces (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.bodega_projects (id) on delete cascade,
  label text not null,
  source_path text,
  sort_order int not null default 0,
  programmer_bucket text check (
    programmer_bucket is null
    or programmer_bucket in ('cnc', 'torno', 'perfilado')
  ),
  finish_spec text check (
    finish_spec is null
    or finish_spec in ('anodizado', 'pavonado', 'otro')
  ),
  programming_finished_at timestamptz,
  programming_exit_kind text check (
    programming_exit_kind is null
    or programming_exit_kind in ('archivo_adjunto', 'a_perfilado')
  ),
  supervisor_design_feedback text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.bodega_project_pieces.label is
  'Nombre visible / etiqueta de la pieza (ej. archivo dentro del ZIP de diseño).';

comment on column public.bodega_project_pieces.source_path is
  'Ruta relativa dentro del ZIP de diseño (drag-drop / enlaces futuros).';

comment on column public.bodega_project_pieces.programmer_bucket is
  'Asignación programadora: carpeta CNC, Torno o Perfilado.';

comment on column public.bodega_project_pieces.finish_spec is
  'Tras aprobación supervisor: anodizado / pavonado / otro por pieza.';

comment on column public.bodega_project_pieces.programming_exit_kind is
  'Cierre programación CNC/Torno: archivo adjunto vs envío a cola perfilado.';

comment on table public.bodega_project_pieces is
  'Piezas del proyecto: rutas, acabado por pieza, salidas de programación CNC/Torno.';

create index if not exists bodega_project_pieces_project_idx
  on public.bodega_project_pieces (project_id);

create index if not exists bodega_project_pieces_bucket_idx
  on public.bodega_project_pieces (project_id, programmer_bucket);

drop trigger if exists bodega_project_pieces_touch on public.bodega_project_pieces;
create trigger bodega_project_pieces_touch
  before update on public.bodega_project_pieces
  for each row execute function public.bodega_generic_touch_updated_at();

-- 4) Intervalos de tiempo por pieza y por etapa (timestamps; minutos hábiles en cliente)
create table if not exists public.bodega_piece_work_intervals (
  id uuid primary key default gen_random_uuid(),
  piece_id uuid not null references public.bodega_project_pieces (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  lane text not null check (
    lane in (
      'programacion_cnc',
      'programacion_torno',
      'perfilado_operador',
      'maquinado',
      'armado',
      'detallado'
    )
  ),
  started_at timestamptz not null,
  ended_at timestamptz,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.bodega_piece_work_intervals is
  'Reloj por pieza: programación CNC/Torno, perfilado operador, maquinado, armado, detallado.';

create index if not exists bodega_piece_intervals_piece_lane_idx
  on public.bodega_piece_work_intervals (piece_id, lane);

create index if not exists bodega_piece_intervals_open_idx
  on public.bodega_piece_work_intervals (piece_id)
  where ended_at is null;

-- 5) RLS piezas
alter table public.bodega_project_pieces enable row level security;

drop policy if exists "bodega_pieces_select" on public.bodega_project_pieces;
drop policy if exists "bodega_pieces_insert" on public.bodega_project_pieces;
drop policy if exists "bodega_pieces_update" on public.bodega_project_pieces;
drop policy if exists "bodega_pieces_delete" on public.bodega_project_pieces;

create policy "bodega_pieces_select"
  on public.bodega_project_pieces for select
  to authenticated
  using (public.is_bodega());

create policy "bodega_pieces_insert"
  on public.bodega_project_pieces for insert
  to authenticated
  with check (
    public.my_role() in ('admin', 'encargado', 'programadora_maquinaria')
  );

create policy "bodega_pieces_update"
  on public.bodega_project_pieces for update
  to authenticated
  using (public.is_bodega())
  with check (public.is_bodega());

create policy "bodega_pieces_delete"
  on public.bodega_project_pieces for delete
  to authenticated
  using (public.is_bodega_supervisor());

-- 6) RLS intervalos pieza
alter table public.bodega_piece_work_intervals enable row level security;

drop policy if exists "bodega_piece_intervals_select" on public.bodega_piece_work_intervals;
drop policy if exists "bodega_piece_intervals_insert" on public.bodega_piece_work_intervals;
drop policy if exists "bodega_piece_intervals_update" on public.bodega_piece_work_intervals;

create policy "bodega_piece_intervals_select"
  on public.bodega_piece_work_intervals for select
  to authenticated
  using (public.is_bodega());

create policy "bodega_piece_intervals_insert"
  on public.bodega_piece_work_intervals for insert
  to authenticated
  with check (public.is_bodega());

create policy "bodega_piece_intervals_update"
  on public.bodega_piece_work_intervals for update
  to authenticated
  using (public.is_bodega())
  with check (public.is_bodega());

-- 7) RPC iniciar / cerrar intervalo por pieza (control fino por rol en app; aquí validación mínima)
create or replace function public.bodega_piece_interval_close_open(
  p_piece_id uuid,
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
  update public.bodega_piece_work_intervals
  set
    ended_at = p_end,
    meta = coalesce(meta, '{}'::jsonb) || coalesce(p_meta, '{}'::jsonb)
  where piece_id = p_piece_id
    and lane = p_lane
    and ended_at is null;
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.bodega_piece_interval_start(
  p_piece_id uuid,
  p_lane text
)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  r text := public.my_role();
  v_id uuid;
begin
  if not public.is_bodega() then
    raise exception 'Solo cuentas de bodega';
  end if;

  if p_lane not in (
    'programacion_cnc',
    'programacion_torno',
    'perfilado_operador',
    'maquinado',
    'armado',
    'detallado'
  ) then
    raise exception 'lane inválida: %', p_lane;
  end if;

  if not exists (select 1 from public.bodega_project_pieces bp where bp.id = p_piece_id) then
    raise exception 'Pieza no encontrada';
  end if;

  -- Roles sugeridos (supervisor puede todo)
  if p_lane in ('programacion_cnc', 'programacion_torno') then
    if r not in ('admin', 'encargado', 'programadora_maquinaria') then
      raise exception 'Solo programadora o supervisor puede iniciar programación';
    end if;
  elsif p_lane = 'perfilado_operador' then
    if r not in ('admin', 'encargado', 'operador_bodega') then
      raise exception 'Solo operador o supervisor puede iniciar perfilado';
    end if;
  elsif p_lane = 'maquinado' then
    if r not in ('admin', 'encargado', 'operador_bodega', 'programadora_maquinaria') then
      raise exception 'Rol no autorizado para maquinado';
    end if;
  elsif p_lane in ('armado', 'detallado') then
    if r not in ('admin', 'encargado', 'operador_bodega', 'programadora_maquinaria', 'disenadora') then
      raise exception 'Rol no autorizado para armado/detallado';
    end if;
  end if;

  if exists (
    select 1
    from public.bodega_piece_work_intervals w
    where w.piece_id = p_piece_id
      and w.lane = p_lane
      and w.actor_id = auth.uid()
      and w.ended_at is null
  ) then
    return (
      select w.id
      from public.bodega_piece_work_intervals w
      where w.piece_id = p_piece_id
        and w.lane = p_lane
        and w.actor_id = auth.uid()
        and w.ended_at is null
      limit 1
    );
  end if;

  insert into public.bodega_piece_work_intervals (piece_id, actor_id, lane, started_at)
  values (p_piece_id, auth.uid(), p_lane, now())
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.bodega_piece_interval_end(p_piece_id uuid, p_lane text)
returns int
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  r text := public.my_role();
  n int;
begin
  if not public.is_bodega() then
    raise exception 'Solo cuentas de bodega';
  end if;

  if r in ('admin', 'encargado') then
    update public.bodega_piece_work_intervals
    set
      ended_at = now(),
      meta = coalesce(meta, '{}'::jsonb) || '{"closed_manual":true}'::jsonb
    where piece_id = p_piece_id
      and lane = p_lane
      and ended_at is null;
  else
    update public.bodega_piece_work_intervals
    set
      ended_at = now(),
      meta = coalesce(meta, '{}'::jsonb) || '{"closed_manual":true}'::jsonb
    where piece_id = p_piece_id
      and lane = p_lane
      and ended_at is null
      and actor_id = auth.uid();
  end if;

  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on function public.bodega_piece_interval_start(uuid, text) to authenticated;
grant execute on function public.bodega_piece_interval_end(uuid, text) to authenticated;

-- 8) Supervisor: marcar proyecto finalizado (tras fotos)
create or replace function public.bodega_supervisor_finalize_project(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if public.my_role() not in ('admin', 'encargado') then
    raise exception 'Solo supervisor puede finalizar el proyecto';
  end if;

  update public.bodega_projects
  set
    project_finalized_at = now(),
    project_finalized_by = auth.uid(),
    status = 'terminado',
    fecha_termino = coalesce(fecha_termino, current_date)
  where id = p_project_id;

  if not found then
    raise exception 'Proyecto no encontrado';
  end if;
end;
$$;

grant execute on function public.bodega_supervisor_finalize_project(uuid) to authenticated;

notify pgrst, 'reload schema';
