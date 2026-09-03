-- Ejecutar en SQL Editor. Luego: Settings → API → Reload schema.

alter table public.bodega_project_pieces
  add column if not exists maquinado_real_seconds integer,
  add column if not exists maquinado_real_label text,
  add column if not exists maquinado_real_sheet_storage_path text,
  add column if not exists maquinado_real_sheet_name text,
  add column if not exists maquinado_real_sheet_uploaded_at timestamptz;

comment on column public.bodega_project_pieces.maquinado_real_seconds is
  'Segundos leídos de captura (Overall / pantalla máquina).';
comment on column public.bodega_project_pieces.maquinado_real_label is
  'Tiempo real H:M:S desde captura (ej. 1:21:4).';
comment on column public.bodega_project_pieces.maquinado_real_sheet_storage_path is
  'Imagen de captura del tiempo en máquina o listado SURFCAM.';
