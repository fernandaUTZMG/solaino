-- =============================================================================
-- BODEGA: Proyectos + captura de tiempos (MVP)
-- Ejecuta en Supabase → SQL Editor.
-- =============================================================================

-- 0) Extender roles permitidos en profiles
-- Nota: en este repo, `profiles.role` traía check(role in ('admin','user')).
-- Aquí lo ampliamos a los roles nuevos del sistema.
do $$
begin
  -- quitar constraint anterior si existe
  if exists (
    select 1
    from pg_constraint
    where conname = 'profiles_role_check'
  ) then
    alter table public.profiles drop constraint profiles_role_check;
  end if;
exception when others then
  -- ignore (por si el nombre difiere)
  null;
end $$;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'user', 'encargado', 'disenadora', 'programadora_maquinaria'));

comment on constraint profiles_role_check on public.profiles is 'Roles permitidos en el sistema.';

-- Helper: rol actual
create or replace function public.my_role()
returns text
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select coalesce((select p.role from public.profiles p where p.id = auth.uid()), 'user');
$$;

-- Helper: es rol de bodega (incluye admin)
create or replace function public.is_bodega()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select public.my_role() in ('admin', 'encargado', 'disenadora', 'programadora_maquinaria');
$$;

-- Supervisor de bodega: mismo alcance operativo que admin en catálogos, proyectos y adjuntos (no es “admin global”).
create or replace function public.is_bodega_supervisor()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select public.my_role() in ('admin', 'encargado');
$$;

-- 1) Proyectos Bodega
create table if not exists public.bodega_projects (
  id uuid primary key default gen_random_uuid(),

  folio text not null,
  orden text,
  cliente text not null,          -- nombre del cliente/requisitor (texto por ahora)
  empresa text,                   -- empresa (texto por ahora)
  nombre text not null,           -- nombre del proyecto

  status text not null default 'pendiente'
    check (status in ('pendiente', 'en_diseno', 'produccion', 'terminado')),

  avance_pct int not null default 0 check (avance_pct >= 0 and avance_pct <= 100),

  fecha_inicio date not null default current_date,
  fecha_termino date,

  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.bodega_projects is 'Proyectos internos (diseño / CNC / producción).';
comment on column public.bodega_projects.folio is 'Identificador interno (folio).';
comment on column public.bodega_projects.orden is 'Orden asociada (texto).';
comment on column public.bodega_projects.cliente is 'Cliente/requisitor (texto).';
comment on column public.bodega_projects.empresa is 'Empresa (texto).';
comment on column public.bodega_projects.status is 'pendiente|en_diseno|produccion|terminado';

create unique index if not exists bodega_projects_folio_uidx on public.bodega_projects (folio);
create index if not exists bodega_projects_status_idx on public.bodega_projects (status);
create index if not exists bodega_projects_cliente_idx on public.bodega_projects (cliente);
create index if not exists bodega_projects_empresa_idx on public.bodega_projects (empresa);
create index if not exists bodega_projects_created_at_idx on public.bodega_projects (created_at desc);

create or replace function public.bodega_projects_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists bodega_projects_set_updated_at on public.bodega_projects;
create trigger bodega_projects_set_updated_at
  before update on public.bodega_projects
  for each row
  execute function public.bodega_projects_touch_updated_at();

-- 2) Captura de tiempos (por usuario y proyecto)
create table if not exists public.bodega_time_entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.bodega_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,

  area text not null
    check (area in ('diseno', 'programacion_cnc', 'produccion', 'ajustes', 'ensamble')),

  metodo text not null
    check (metodo in ('manual', 'cronometro', 'inicio_fin')),

  started_at timestamptz not null,
  ended_at timestamptz,
  seconds int,
  note text,
  evidence jsonb,

  created_at timestamptz not null default now()
);

comment on table public.bodega_time_entries is 'Registro de tiempos por proyecto/usuario/área.';

create index if not exists bodega_time_entries_project_idx on public.bodega_time_entries (project_id, created_at desc);
create index if not exists bodega_time_entries_user_idx on public.bodega_time_entries (user_id, created_at desc);
create index if not exists bodega_time_entries_area_idx on public.bodega_time_entries (area);

-- Calcula seconds al cerrar (ended_at) si no viene
create or replace function public.bodega_time_entries_compute_seconds()
returns trigger
language plpgsql
as $$
begin
  if new.ended_at is not null then
    new.seconds := coalesce(new.seconds, greatest(0, floor(extract(epoch from (new.ended_at - new.started_at)))::int));
  end if;
  return new;
end;
$$;

drop trigger if exists bodega_time_entries_compute_seconds_trg on public.bodega_time_entries;
create trigger bodega_time_entries_compute_seconds_trg
  before insert or update on public.bodega_time_entries
  for each row
  execute function public.bodega_time_entries_compute_seconds();

-- 3) Auditoría básica para Bodega (reusa audit_write)
create or replace function public.audit_bodega_projects_trg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    perform public.audit_write('bodega_proyecto_creado', 'bodega_projects', new.id, jsonb_build_object('folio', new.folio, 'status', new.status));
    return new;
  elsif (tg_op = 'UPDATE') then
    perform public.audit_write('bodega_proyecto_actualizado', 'bodega_projects', new.id, jsonb_build_object('status', new.status, 'avance_pct', new.avance_pct));
    return new;
  end if;
  return new;
end;
$$;

drop trigger if exists bodega_projects_audit_trg on public.bodega_projects;
create trigger bodega_projects_audit_trg
  after insert or update on public.bodega_projects
  for each row
  execute function public.audit_bodega_projects_trg();

create or replace function public.audit_bodega_time_entries_trg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    perform public.audit_write('bodega_tiempo_creado', 'bodega_time_entries', new.id, jsonb_build_object('project_id', new.project_id, 'area', new.area, 'metodo', new.metodo));
    return new;
  elsif (tg_op = 'UPDATE') then
    perform public.audit_write('bodega_tiempo_actualizado', 'bodega_time_entries', new.id, jsonb_build_object('ended_at', new.ended_at, 'seconds', new.seconds));
    return new;
  end if;
  return new;
end;
$$;

drop trigger if exists bodega_time_entries_audit_trg on public.bodega_time_entries;
create trigger bodega_time_entries_audit_trg
  after insert or update on public.bodega_time_entries
  for each row
  execute function public.audit_bodega_time_entries_trg();

