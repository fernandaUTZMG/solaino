alter table public.bodega_project_pieces
  add column if not exists post_maquinado_route text check (
    post_maquinado_route is null or post_maquinado_route in ('armado', 'detallado')
  );
