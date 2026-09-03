-- Partidas / descripciones de línea leídas del PDF de la OC (Coupa, etc.)
-- Ejecuta en Supabase → SQL Editor si la tabla ya existía sin esta columna.

alter table public.bodega_ordenes_compra
  add column if not exists cotizacion_lineas text[] not null default '{}';

comment on column public.bodega_ordenes_compra.cotizacion_lineas is
  'Descripciones de línea de la cotización (PDF); ref. proyectos creados en la app.';
