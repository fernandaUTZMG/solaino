-- Archivo adjunto de factura en filas del plan de trabajo semanal.
-- Ejecutar en SQL Editor → Settings → API → Reload schema.

alter table public.bodega_weekly_plan_items
  add column if not exists factura_archivo_path text,
  add column if not exists factura_archivo_nombre text;

comment on column public.bodega_weekly_plan_items.factura_archivo_path is
  'Ruta en bucket bodega-proyectos del PDF/XML/imagen de factura (plan-trabajo/facturas/...).';

comment on column public.bodega_weekly_plan_items.factura_archivo_nombre is
  'Nombre original del archivo de factura para descarga.';
