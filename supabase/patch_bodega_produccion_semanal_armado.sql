-- Columna Armado del plan de producción semanal.
-- El texto se conserva. armado_tareas guarda el proyecto vinculado,
-- la marca manual y quién ayudó en el armado.

alter table public.bodega_produccion_semanal_dias
  add column if not exists armado text not null default '',
  add column if not exists armado_tareas jsonb not null default '[]'::jsonb;

comment on column public.bodega_produccion_semanal_dias.armado is
  'Texto del día en armado, una tarea por línea.';
comment on column public.bodega_produccion_semanal_dias.armado_tareas is
  'Por línea de armado: texto, project_id, marca manual y quién ayudó.';

notify pgrst, 'reload schema';
