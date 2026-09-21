-- Planos PDF por pieza + permisos RLS (corrige 403 en bodega_project_pieces).
-- Ejecutar TODO este archivo en Supabase → SQL Editor → Run.
-- Luego recarga la app (Ctrl+Shift+R).

-- 1) Columnas del plano adjunto
alter table public.bodega_project_pieces
  add column if not exists design_drawing_storage_path text,
  add column if not exists design_drawing_name text,
  add column if not exists design_drawing_uploaded_at timestamptz;

comment on column public.bodega_project_pieces.design_drawing_storage_path is
  'Ruta en bucket bodega-proyectos del plano PDF subido para esta pieza.';
comment on column public.bodega_project_pieces.design_drawing_name is
  'Nombre original del PDF de plano adjunto.';
comment on column public.bodega_project_pieces.design_drawing_uploaded_at is
  'Cuándo se adjuntó el plano a la pieza.';

-- 2) RLS: roles de bodega pueden leer/crear/editar piezas (incluye diseñadora)
alter table public.bodega_project_pieces enable row level security;

drop policy if exists "bodega_pieces_select_bodega" on public.bodega_project_pieces;
create policy "bodega_pieces_select_bodega"
  on public.bodega_project_pieces for select
  to authenticated
  using (public.is_bodega());

drop policy if exists "bodega_pieces_insert_bodega" on public.bodega_project_pieces;
create policy "bodega_pieces_insert_bodega"
  on public.bodega_project_pieces for insert
  to authenticated
  with check (public.is_bodega());

drop policy if exists "bodega_pieces_update_bodega" on public.bodega_project_pieces;
create policy "bodega_pieces_update_bodega"
  on public.bodega_project_pieces for update
  to authenticated
  using (public.is_bodega())
  with check (public.is_bodega());

drop policy if exists "bodega_pieces_delete_supervisor" on public.bodega_project_pieces;
create policy "bodega_pieces_delete_supervisor"
  on public.bodega_project_pieces for delete
  to authenticated
  using (public.is_bodega_supervisor());

notify pgrst, 'reload schema';
