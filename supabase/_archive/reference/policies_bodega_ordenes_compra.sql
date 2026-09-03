-- RLS órdenes de compra Bodega. Ejecutar después de schema_bodega_ordenes_compra.sql

-- Quién puede registrar/editar OC: admin o encargado
create or replace function public.can_manage_bodega_ordenes()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select public.my_role() in ('admin', 'encargado');
$$;

alter table public.bodega_ordenes_compra enable row level security;

drop policy if exists "bodega_oc_select_bodega" on public.bodega_ordenes_compra;
drop policy if exists "bodega_oc_insert_managers" on public.bodega_ordenes_compra;
drop policy if exists "bodega_oc_update_managers" on public.bodega_ordenes_compra;
drop policy if exists "bodega_oc_delete_admin" on public.bodega_ordenes_compra;

create policy "bodega_oc_select_bodega"
  on public.bodega_ordenes_compra for select
  to authenticated
  using (public.is_bodega());

create policy "bodega_oc_insert_managers"
  on public.bodega_ordenes_compra for insert
  to authenticated
  with check (public.can_manage_bodega_ordenes());

create policy "bodega_oc_update_managers"
  on public.bodega_ordenes_compra for update
  to authenticated
  using (public.can_manage_bodega_ordenes())
  with check (public.can_manage_bodega_ordenes());

create policy "bodega_oc_delete_admin"
  on public.bodega_ordenes_compra for delete
  to authenticated
  using (public.is_bodega_supervisor());
