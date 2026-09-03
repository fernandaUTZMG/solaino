-- =============================================================================
-- BODEGA: RLS para versionado de entregas (diseño) + historial
-- Ejecuta después de `schema_bodega_versions.sql`.
-- =============================================================================

-- Helper: quién puede revisar/aprobar diseño (Supervisor)
create or replace function public.can_review_design()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select public.my_role() in ('admin', 'encargado');
$$;

-- Helper: quién puede subir entregas de diseño (diseñadora, supervisor/encargado y admin)
create or replace function public.can_upload_design()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select public.my_role() in ('admin', 'encargado', 'disenadora');
$$;

-- DESIGN VERSIONS
alter table public.project_design_versions enable row level security;

drop policy if exists "design_versions_select_bodega" on public.project_design_versions;
drop policy if exists "design_versions_insert_uploader" on public.project_design_versions;
drop policy if exists "design_versions_update_reviewer" on public.project_design_versions;
drop policy if exists "design_versions_delete_admin" on public.project_design_versions;

create policy "design_versions_select_bodega"
  on public.project_design_versions for select
  to authenticated
  using (public.is_bodega());

create policy "design_versions_insert_uploader"
  on public.project_design_versions for insert
  to authenticated
  with check (public.can_upload_design());

create policy "design_versions_update_reviewer"
  on public.project_design_versions for update
  to authenticated
  using (public.can_review_design())
  with check (public.can_review_design());

create policy "design_versions_delete_admin"
  on public.project_design_versions for delete
  to authenticated
  using (public.is_bodega_supervisor());

-- ACTIVITY
alter table public.project_activity enable row level security;

drop policy if exists "project_activity_select_bodega" on public.project_activity;
drop policy if exists "project_activity_insert_bodega" on public.project_activity;
drop policy if exists "project_activity_delete_admin" on public.project_activity;

create policy "project_activity_select_bodega"
  on public.project_activity for select
  to authenticated
  using (public.is_bodega());

create policy "project_activity_insert_bodega"
  on public.project_activity for insert
  to authenticated
  with check (public.is_bodega());

create policy "project_activity_delete_admin"
  on public.project_activity for delete
  to authenticated
  using (public.is_bodega_supervisor());

