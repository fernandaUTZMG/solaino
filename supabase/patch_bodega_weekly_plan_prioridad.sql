-- Plan semanal: columna prioridad_nivel en filas (si ya existía la tabla sin ella).
-- Ejecutar en SQL Editor → Settings → API → Reload schema.

alter table public.bodega_weekly_plan_items
  add column if not exists prioridad_nivel smallint not null default 0;

alter table public.bodega_weekly_plan_items
  drop constraint if exists bodega_weekly_plan_items_prioridad_nivel_check;

alter table public.bodega_weekly_plan_items
  add constraint bodega_weekly_plan_items_prioridad_nivel_check
  check (prioridad_nivel >= 0 and prioridad_nivel <= 4);

comment on column public.bodega_weekly_plan_items.prioridad_nivel is
  'Prioridad del proyecto al sincronizar el plan (0=normal, 4=urgente). Orden de la fila.';

notify pgrst, 'reload schema';
