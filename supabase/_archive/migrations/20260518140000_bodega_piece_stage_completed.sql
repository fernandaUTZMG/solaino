-- Marcadores explícitos de cierre de etapa por pieza (colas operador / armado).

alter table public.bodega_project_pieces
  add column if not exists perfilado_completed_at timestamptz;

alter table public.bodega_project_pieces
  add column if not exists maquinado_completed_at timestamptz;

alter table public.bodega_project_pieces
  add column if not exists armado_completed_at timestamptz;

alter table public.bodega_project_pieces
  add column if not exists detallado_completed_at timestamptz;

comment on column public.bodega_project_pieces.perfilado_completed_at is
  'Operador perfilado terminó la pieza (cola perfilado vacía para esa pieza).';

comment on column public.bodega_project_pieces.maquinado_completed_at is
  'Maquinado CNC/Torno terminado.';

comment on column public.bodega_project_pieces.armado_completed_at is 'Etapa armado completada.';
comment on column public.bodega_project_pieces.detallado_completed_at is 'Etapa detallado completada.';

notify pgrst, 'reload schema';
