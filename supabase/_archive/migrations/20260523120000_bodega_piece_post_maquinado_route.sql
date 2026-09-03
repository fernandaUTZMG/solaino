-- Tras maquinado: la pieza va a cola de armado o directo a detallado.

alter table public.bodega_project_pieces
  add column if not exists post_maquinado_route text check (
    post_maquinado_route is null or post_maquinado_route in ('armado', 'detallado')
  );

comment on column public.bodega_project_pieces.post_maquinado_route is
  'Destino al terminar maquinado: armado (default) o detallado (salta armado).';
