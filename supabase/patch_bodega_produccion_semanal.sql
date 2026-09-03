-- Plan de producción semanal (tablero por día: diseño, programación, maquinado, comentarios).
-- Ejecutar en Supabase → SQL Editor y recargar el esquema API.

create table if not exists public.bodega_produccion_semanal (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  disenadora_label text not null default 'Diseño',
  programacion_label text not null default 'Programación',
  maquinado_label text not null default 'Maquinado',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bodega_produccion_semanal_week_start_unique unique (week_start)
);

comment on table public.bodega_produccion_semanal is
  'Encabezado del plan de producción semanal; week_start = lunes de la semana.';

create table if not exists public.bodega_produccion_semanal_dias (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.bodega_produccion_semanal (id) on delete cascade,
  day_index smallint not null,
  disenadora text not null default '',
  programacion text not null default '',
  maquinado text not null default '',
  comentarios text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bodega_produccion_semanal_dias_day_index_check check (day_index between 0 and 4),
  constraint bodega_produccion_semanal_dias_plan_day_unique unique (plan_id, day_index)
);

comment on table public.bodega_produccion_semanal_dias is
  'Fila por día laboral (0=lunes … 4=viernes) con tareas por área y comentarios.';

create index if not exists bodega_produccion_semanal_dias_plan_idx
  on public.bodega_produccion_semanal_dias (plan_id, day_index asc);

alter table public.bodega_produccion_semanal enable row level security;
alter table public.bodega_produccion_semanal_dias enable row level security;

drop policy if exists bodega_produccion_semanal_select on public.bodega_produccion_semanal;
drop policy if exists bodega_produccion_semanal_write on public.bodega_produccion_semanal;
drop policy if exists bodega_produccion_semanal_dias_select on public.bodega_produccion_semanal_dias;
drop policy if exists bodega_produccion_semanal_dias_write on public.bodega_produccion_semanal_dias;

create policy bodega_produccion_semanal_select on public.bodega_produccion_semanal
  for select using (
    public.my_role() in ('admin', 'encargado', 'disenadora', 'programadora_maquinaria', 'operador_bodega')
  );

create policy bodega_produccion_semanal_write on public.bodega_produccion_semanal
  for all using (public.my_role() in ('admin', 'encargado'))
  with check (public.my_role() in ('admin', 'encargado'));

create policy bodega_produccion_semanal_dias_select on public.bodega_produccion_semanal_dias
  for select using (
    public.my_role() in ('admin', 'encargado', 'disenadora', 'programadora_maquinaria', 'operador_bodega')
  );

create policy bodega_produccion_semanal_dias_write on public.bodega_produccion_semanal_dias
  for all using (public.my_role() in ('admin', 'encargado'))
  with check (public.my_role() in ('admin', 'encargado'));

notify pgrst, 'reload schema';
