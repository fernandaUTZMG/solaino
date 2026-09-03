-- Ensamblaje .x_T (contenedor) vs piezas sueltas que la programadora asigna a CNC/Torno.

alter table public.bodega_project_pieces
  add column if not exists assembly_xt_path text;

comment on column public.bodega_project_pieces.assembly_xt_path is
  'Ruta del archivo .x_T ensamblaje que contiene esta pieza (la programadora abre ese archivo en CAD).';

create index if not exists bodega_project_pieces_assembly_xt_idx
  on public.bodega_project_pieces (project_id, assembly_xt_path);
