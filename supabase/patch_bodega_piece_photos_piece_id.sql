-- Paso 10: fotos por pieza + permisos de subida (encargado / diseñadora / programadora).
-- Ejecutar en SQL Editor → luego Settings → API → Reload schema.

alter table public.project_piece_photos
  add column if not exists piece_id uuid references public.bodega_project_pieces (id) on delete cascade;

create index if not exists project_piece_photos_piece_idx
  on public.project_piece_photos (piece_id, created_at desc);

comment on column public.project_piece_photos.piece_id is
  'Pieza a la que pertenece la evidencia fotográfica (paso 10).';

create or replace function public.can_upload_piece_photos()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select public.my_role() in ('admin', 'encargado', 'disenadora', 'programadora_maquinaria');
$$;

notify pgrst, 'reload schema';
