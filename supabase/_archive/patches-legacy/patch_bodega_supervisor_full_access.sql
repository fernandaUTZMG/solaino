-- =============================================================================
-- Supervisor de bodega (rol encargado): mismos permisos operativos que admin
-- en catálogos, proyectos, OC, Storage bodega y entregas (ZIP/fotos).
-- Ejecutar en Supabase → SQL Editor (una sola vez por proyecto).
-- Requiere haber corrido antes schema_bodega.sql (my_role, is_bodega) o que
-- existan las tablas/políticas indicadas.
-- =============================================================================

-- Helper: admin o encargado (supervisor de bodega)
create or replace function public.is_bodega_supervisor()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select public.my_role() in ('admin', 'encargado');
$$;

-- Catálogos
drop policy if exists "empresas_insert_admin" on public.empresas;
drop policy if exists "empresas_update_admin" on public.empresas;
drop policy if exists "empresas_delete_admin" on public.empresas;

create policy "empresas_insert_admin"
  on public.empresas for insert
  to authenticated
  with check (public.is_bodega_supervisor());

create policy "empresas_update_admin"
  on public.empresas for update
  to authenticated
  using (public.is_bodega_supervisor())
  with check (public.is_bodega_supervisor());

create policy "empresas_delete_admin"
  on public.empresas for delete
  to authenticated
  using (public.is_bodega_supervisor());

drop policy if exists "requisitores_insert_admin" on public.requisitores;
drop policy if exists "requisitores_update_admin" on public.requisitores;
drop policy if exists "requisitores_delete_admin" on public.requisitores;

create policy "requisitores_insert_admin"
  on public.requisitores for insert
  to authenticated
  with check (public.is_bodega_supervisor());

create policy "requisitores_update_admin"
  on public.requisitores for update
  to authenticated
  using (public.is_bodega_supervisor())
  with check (public.is_bodega_supervisor());

create policy "requisitores_delete_admin"
  on public.requisitores for delete
  to authenticated
  using (public.is_bodega_supervisor());

-- Proyectos bodega (crear / editar / borrar manual)
drop policy if exists "bodega_projects_insert_admin" on public.bodega_projects;
drop policy if exists "bodega_projects_update_admin" on public.bodega_projects;
drop policy if exists "bodega_projects_delete_admin" on public.bodega_projects;

create policy "bodega_projects_insert_admin"
  on public.bodega_projects for insert
  to authenticated
  with check (public.is_bodega_supervisor());

create policy "bodega_projects_update_admin"
  on public.bodega_projects for update
  to authenticated
  using (public.is_bodega_supervisor())
  with check (public.is_bodega_supervisor());

create policy "bodega_projects_delete_admin"
  on public.bodega_projects for delete
  to authenticated
  using (public.is_bodega_supervisor());

-- Órdenes de compra: borrar fila + PDF en Storage
drop policy if exists "bodega_oc_delete_admin" on public.bodega_ordenes_compra;
create policy "bodega_oc_delete_admin"
  on public.bodega_ordenes_compra for delete
  to authenticated
  using (public.is_bodega_supervisor());

drop policy if exists "bodega_ordenes_delete_admin" on storage.objects;
create policy "bodega_ordenes_delete_admin"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'bodega-ordenes-compra' and public.is_bodega_supervisor());

-- Entregas: funciones de subida (alineadas con cliente) + borrado Storage proyectos
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

drop policy if exists "bodega_proyectos_delete_admin" on storage.objects;
create policy "bodega_proyectos_delete_admin"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'bodega-proyectos' and public.is_bodega_supervisor());

-- Tablas de versiones / evidencia (si existen)
drop policy if exists "design_versions_delete_admin" on public.project_design_versions;
create policy "design_versions_delete_admin"
  on public.project_design_versions for delete
  to authenticated
  using (public.is_bodega_supervisor());

drop policy if exists "project_activity_delete_admin" on public.project_activity;
create policy "project_activity_delete_admin"
  on public.project_activity for delete
  to authenticated
  using (public.is_bodega_supervisor());

drop policy if exists "machine_versions_delete_admin" on public.project_machine_versions;
create policy "machine_versions_delete_admin"
  on public.project_machine_versions for delete
  to authenticated
  using (public.is_bodega_supervisor());

drop policy if exists "piece_photos_delete_admin" on public.project_piece_photos;
create policy "piece_photos_delete_admin"
  on public.project_piece_photos for delete
  to authenticated
  using (public.is_bodega_supervisor());
