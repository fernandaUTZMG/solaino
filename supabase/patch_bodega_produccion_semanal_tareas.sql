-- Avance de cada línea del plan de producción semanal.
-- El texto de la celda se conserva. Aquí se guarda el proyecto vinculado
-- o la marca manual (pendiente, en proceso, lista).

alter table public.bodega_produccion_semanal_dias
  add column if not exists disenadora_tareas jsonb not null default '[]'::jsonb,
  add column if not exists programacion_tareas jsonb not null default '[]'::jsonb,
  add column if not exists maquinado_tareas jsonb not null default '[]'::jsonb;

comment on column public.bodega_produccion_semanal_dias.disenadora_tareas is
  'Por línea de diseño: texto, project_id y marca manual.';
comment on column public.bodega_produccion_semanal_dias.programacion_tareas is
  'Por línea de programación: texto, project_id y marca manual.';
comment on column public.bodega_produccion_semanal_dias.maquinado_tareas is
  'Por línea de maquinado: texto, project_id y marca manual.';

notify pgrst, 'reload schema';
