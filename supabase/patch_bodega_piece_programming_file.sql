-- Ejecutar en SQL Editor: adjunto de programación por pieza.

alter table public.bodega_project_pieces
  add column if not exists programming_file_storage_path text,
  add column if not exists programming_file_name text,
  add column if not exists programming_file_uploaded_at timestamptz;
