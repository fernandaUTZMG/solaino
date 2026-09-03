-- =============================================================================
-- BODEGA: Políticas RLS (MVP)
-- Ejecuta después de `schema_bodega.sql`.
-- =============================================================================

-- PROYECTOS
alter table public.bodega_projects enable row level security;

drop policy if exists "bodega_projects_select_bodega" on public.bodega_projects;
drop policy if exists "bodega_projects_insert_admin" on public.bodega_projects;
drop policy if exists "bodega_projects_update_admin" on public.bodega_projects;
drop policy if exists "bodega_projects_delete_admin" on public.bodega_projects;

-- Ver proyectos: cualquier rol de bodega (incluye admin)
create policy "bodega_projects_select_bodega"
  on public.bodega_projects for select
  to authenticated
  using (public.is_bodega());

-- Crear / editar / borrar proyectos: admin o supervisor de bodega (encargado)
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

-- TIEMPOS
alter table public.bodega_time_entries enable row level security;

drop policy if exists "bodega_time_entries_select_admin_or_own" on public.bodega_time_entries;
drop policy if exists "bodega_time_entries_insert_own" on public.bodega_time_entries;
drop policy if exists "bodega_time_entries_update_admin_or_own_open" on public.bodega_time_entries;
drop policy if exists "bodega_time_entries_delete_admin" on public.bodega_time_entries;

-- Ver tiempos: admin ve todo; bodega ve solo los suyos
create policy "bodega_time_entries_select_admin_or_own"
  on public.bodega_time_entries for select
  to authenticated
  using (public.is_admin() or user_id = auth.uid());

-- Insertar: solo si es rol bodega y user_id = auth.uid()
create policy "bodega_time_entries_insert_own"
  on public.bodega_time_entries for insert
  to authenticated
  with check (public.is_bodega() and user_id = auth.uid());

-- Actualizar: admin todo; usuario solo sus registros (y típicamente el registro abierto)
create policy "bodega_time_entries_update_admin_or_own_open"
  on public.bodega_time_entries for update
  to authenticated
  using (public.is_admin() or (user_id = auth.uid()))
  with check (public.is_admin() or (user_id = auth.uid()));

create policy "bodega_time_entries_delete_admin"
  on public.bodega_time_entries for delete
  to authenticated
  using (public.is_admin());

