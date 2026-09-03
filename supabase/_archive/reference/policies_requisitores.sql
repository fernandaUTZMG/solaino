-- =============================================================================
-- REQUISITORES: Políticas RLS
-- Ejecuta después de `schema_requisitores.sql`.
-- =============================================================================

alter table public.requisitores enable row level security;

drop policy if exists "requisitores_select_bodega" on public.requisitores;
drop policy if exists "requisitores_insert_admin" on public.requisitores;
drop policy if exists "requisitores_update_admin" on public.requisitores;
drop policy if exists "requisitores_delete_admin" on public.requisitores;

-- Cualquier rol de bodega (incluye admin) puede ver el catálogo
create policy "requisitores_select_bodega"
  on public.requisitores for select
  to authenticated
  using (public.is_bodega());

-- Admin o supervisor de bodega (encargado) pueden modificar catálogo
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

