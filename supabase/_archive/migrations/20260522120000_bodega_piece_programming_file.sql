-- Archivo de programación por pieza (CNC/Torno), independiente del ZIP del módulo.

alter table public.bodega_project_pieces
  add column if not exists programming_file_storage_path text,
  add column if not exists programming_file_name text,
  add column if not exists programming_file_uploaded_at timestamptz;

comment on column public.bodega_project_pieces.programming_file_storage_path is
  'Ruta en bucket bodega-proyectos (debe contener /programacion/).';
comment on column public.bodega_project_pieces.programming_file_name is
  'Nombre original del archivo de programación de la pieza.';
comment on column public.bodega_project_pieces.programming_file_uploaded_at is
  'Cuándo se subió o reemplazó el archivo de programación.';
