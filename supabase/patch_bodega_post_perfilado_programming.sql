-- Ejecutar en SQL Editor si no usas migraciones. Luego: Settings → API → Reload schema.

alter table public.bodega_project_pieces
  add column if not exists post_perfilado_programming_bucket text;

alter table public.bodega_project_pieces
  drop constraint if exists bodega_project_pieces_post_perfilado_programming_bucket_check;

alter table public.bodega_project_pieces
  add constraint bodega_project_pieces_post_perfilado_programming_bucket_check
  check (
    post_perfilado_programming_bucket is null
    or post_perfilado_programming_bucket in ('cnc', 'torno')
  );

comment on column public.bodega_project_pieces.post_perfilado_programming_bucket is
  'Tras perfilado en taller: reabrir programación en CNC o Torno (opcional).';
