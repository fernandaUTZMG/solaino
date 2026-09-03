-- Ejecutar en SQL Editor. Luego: Settings → API → Reload schema.

alter table public.bodega_project_pieces
  add column if not exists maquinado_estimated_seconds integer,
  add column if not exists maquinado_estimated_label text,
  add column if not exists maquinado_time_sheet_storage_path text,
  add column if not exists maquinado_time_sheet_name text,
  add column if not exists maquinado_time_sheet_uploaded_at timestamptz,
  add column if not exists maquinado_time_variance_notes text;

comment on column public.bodega_project_pieces.maquinado_estimated_seconds is
  'Segundos estimados en máquina (Overall del CAM).';
comment on column public.bodega_project_pieces.maquinado_estimated_label is
  'Tiempo estimado H:M:S (ej. 1:21:4).';
comment on column public.bodega_project_pieces.maquinado_time_sheet_storage_path is
  'Imagen del listado de operaciones con tiempo estimado.';
comment on column public.bodega_project_pieces.maquinado_time_variance_notes is
  'Notas si el tiempo real difiere del estimado.';
