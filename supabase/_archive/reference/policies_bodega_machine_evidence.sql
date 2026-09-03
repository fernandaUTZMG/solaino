-- =============================================================================
-- BODEGA: RLS para programación (ZIP) + fotos piezas
-- Ejecuta después de `schema_bodega_machine_evidence.sql` y `policies_bodega_versions.sql`.
-- =============================================================================

create or replace function public.can_upload_machine()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select public.my_role() in ('admin', 'encargado', 'programadora_maquinaria');
$$;

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

-- MACHINE VERSIONS
alter table public.project_machine_versions enable row level security;

drop policy if exists "machine_versions_select_bodega" on public.project_machine_versions;
drop policy if exists "machine_versions_insert_uploader" on public.project_machine_versions;
drop policy if exists "machine_versions_update_reviewer" on public.project_machine_versions;
drop policy if exists "machine_versions_delete_admin" on public.project_machine_versions;

create policy "machine_versions_select_bodega"
  on public.project_machine_versions for select
  to authenticated
  using (public.is_bodega());

create policy "machine_versions_insert_uploader"
  on public.project_machine_versions for insert
  to authenticated
  with check (public.can_upload_machine());

create policy "machine_versions_update_reviewer"
  on public.project_machine_versions for update
  to authenticated
  using (public.can_review_design())
  with check (public.can_review_design());

create policy "machine_versions_delete_admin"
  on public.project_machine_versions for delete
  to authenticated
  using (public.is_bodega_supervisor());

-- PIECE PHOTOS
alter table public.project_piece_photos enable row level security;

drop policy if exists "piece_photos_select_bodega" on public.project_piece_photos;
drop policy if exists "piece_photos_insert_uploader" on public.project_piece_photos;
drop policy if exists "piece_photos_delete_admin" on public.project_piece_photos;

create policy "piece_photos_select_bodega"
  on public.project_piece_photos for select
  to authenticated
  using (public.is_bodega());

create policy "piece_photos_insert_uploader"
  on public.project_piece_photos for insert
  to authenticated
  with check (public.can_upload_piece_photos());

create policy "piece_photos_delete_admin"
  on public.project_piece_photos for delete
  to authenticated
  using (public.is_bodega_supervisor());
