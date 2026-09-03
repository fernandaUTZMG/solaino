-- Añade piezas por fila de serie (mismo número de serie puede representar varias unidades).
-- Ejecutar en Supabase → SQL Editor después de schema_series.sql.

alter table public.series
  add column if not exists cantidad numeric not null default 1
  check (cantidad >= 0);

comment on column public.series.cantidad is 'Unidades disponibles asociadas a este número de serie (mismo texto de serie = mismo lote).';
