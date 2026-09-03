-- Permite a diseñadora subir fotos de piezas (misma ruta evidencias/ que programadora).
-- Ejecutar en SQL Editor si ya tenías can_upload_piece_photos solo con programadora + admin.

create or replace function public.can_upload_piece_photos()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select public.my_role() in ('admin', 'disenadora', 'programadora_maquinaria');
$$;
