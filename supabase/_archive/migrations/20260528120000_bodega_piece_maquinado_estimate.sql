-- Tiempo estimado en máquina (CAM) por pieza + captura de hoja de operaciones.

alter table public.bodega_project_pieces
  add column if not exists maquinado_estimated_seconds integer,
  add column if not exists maquinado_estimated_label text,
  add column if not exists maquinado_time_sheet_storage_path text,
  add column if not exists maquinado_time_sheet_name text,
  add column if not exists maquinado_time_sheet_uploaded_at timestamptz,
  add column if not exists maquinado_time_variance_notes text;

comment on column public.bodega_project_pieces.maquinado_estimated_seconds is
  'Segundos estimados en máquina (Overall Cycle Time del CAM, p. ej. 1:21:4).';
comment on column public.bodega_project_pieces.maquinado_estimated_label is
  'Etiqueta H:M:S tal como en el programa (SURFCAM, etc.).';
comment on column public.bodega_project_pieces.maquinado_time_sheet_storage_path is
  'Captura/listado de operaciones con tiempo estimado (storage bodega-proyectos).';
comment on column public.bodega_project_pieces.maquinado_time_variance_notes is
  'Notas de programación si el tiempo real en máquina difiere del estimado.';
