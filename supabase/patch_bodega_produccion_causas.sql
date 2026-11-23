-- Causas reutilizables del plan de producción semanal y el tiempo de cada ocurrencia.
-- Ejecutar en Supabase → SQL Editor y recargar el esquema API.

create table if not exists public.bodega_produccion_causas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  created_at timestamptz not null default now(),
  constraint bodega_produccion_causas_nombre_not_blank check (length(btrim(nombre)) > 0)
);

create unique index if not exists bodega_produccion_causas_nombre_unique
  on public.bodega_produccion_causas (lower(btrim(nombre)));

comment on table public.bodega_produccion_causas is
  'Catálogo de causas que detienen la producción (luz, mantenimiento, falta de piezas, etc.).';

create table if not exists public.bodega_produccion_causa_eventos (
  id uuid primary key default gen_random_uuid(),
  day_id uuid not null references public.bodega_produccion_semanal_dias (id) on delete cascade,
  causa_id uuid not null references public.bodega_produccion_causas (id),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists bodega_produccion_causa_eventos_day_idx
  on public.bodega_produccion_causa_eventos (day_id, started_at);

comment on table public.bodega_produccion_causa_eventos is
  'Cada vez que una causa ocurre en un día del plan, con inicio y fin para medir la duración.';

alter table public.bodega_produccion_causas enable row level security;
alter table public.bodega_produccion_causa_eventos enable row level security;

drop policy if exists bodega_produccion_causas_select on public.bodega_produccion_causas;
drop policy if exists bodega_produccion_causas_write on public.bodega_produccion_causas;
drop policy if exists bodega_produccion_causa_eventos_select on public.bodega_produccion_causa_eventos;
drop policy if exists bodega_produccion_causa_eventos_write on public.bodega_produccion_causa_eventos;

create policy bodega_produccion_causas_select on public.bodega_produccion_causas
  for select using (
    public.my_role() in ('admin', 'encargado', 'disenadora', 'programadora_maquinaria', 'operador_bodega')
  );

create policy bodega_produccion_causas_write on public.bodega_produccion_causas
  for all using (public.my_role() in ('admin', 'encargado'))
  with check (public.my_role() in ('admin', 'encargado'));

create policy bodega_produccion_causa_eventos_select on public.bodega_produccion_causa_eventos
  for select using (
    public.my_role() in ('admin', 'encargado', 'disenadora', 'programadora_maquinaria', 'operador_bodega')
  );

create policy bodega_produccion_causa_eventos_write on public.bodega_produccion_causa_eventos
  for all using (public.my_role() in ('admin', 'encargado'))
  with check (public.my_role() in ('admin', 'encargado'));

grant select, insert, update, delete on public.bodega_produccion_causas to authenticated;
grant select, insert, update, delete on public.bodega_produccion_causa_eventos to authenticated;

notify pgrst, 'reload schema';
