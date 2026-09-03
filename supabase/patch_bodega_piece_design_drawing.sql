-- Plano PDF por pieza (adjunto fuera del ZIP de diseño).

alter table public.bodega_project_pieces
  add column if not exists design_drawing_storage_path text,
  add column if not exists design_drawing_name text,
  add column if not exists design_drawing_uploaded_at timestamptz;

comment on column public.bodega_project_pieces.design_drawing_storage_path is
  'Ruta en bucket bodega-proyectos del plano PDF subido para esta pieza.';
comment on column public.bodega_project_pieces.design_drawing_name is
  'Nombre original del PDF de plano adjunto.';
comment on column public.bodega_project_pieces.design_drawing_uploaded_at is
  'Cuándo se adjuntó el plano a la pieza.';
