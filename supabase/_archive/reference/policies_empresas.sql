-- =============================================================================
-- EMPRESAS: Políticas RLS
-- Ejecuta después de `schema_empresas.sql`.
-- =============================================================================

alter table public.empresas enable row level security;

drop policy if exists "empresas_select_bodega" on public.empresas;
drop policy if exists "empresas_insert_admin" on public.empresas;
drop policy if exists "empresas_update_admin" on public.empresas;
drop policy if exists "empresas_delete_admin" on public.empresas;

-- Cualquier rol de bodega (incluye admin) puede ver el catálogo
create policy "empresas_select_bodega"
  on public.empresas for select
  to authenticated
  using (public.is_bodega());

-- Admin o supervisor de bodega (encargado) pueden modificar catálogo
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

