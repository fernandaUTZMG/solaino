-- Encargado (supervisor): inventario completo + gestión de solicitudes.
-- Ejecutar en Supabase → SQL Editor después de policies_roles_audit_solicitudes.sql

create or replace function public.is_inventory_manager()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select public.my_role() in ('admin', 'encargado');
$$;

comment on function public.is_inventory_manager() is
  'Admin global o encargado: gestión completa de inventario (productos y movimientos).';

-- PRODUCTOS
drop policy if exists "productos_insert_admin" on public.productos;
drop policy if exists "productos_update_auth" on public.productos;
drop policy if exists "productos_delete_admin" on public.productos;

create policy "productos_insert_admin"
  on public.productos for insert
  to authenticated
  with check (public.is_inventory_manager());

create policy "productos_update_auth"
  on public.productos for update
  to authenticated
  using (public.is_inventory_manager())
  with check (public.is_inventory_manager());

create policy "productos_delete_admin"
  on public.productos for delete
  to authenticated
  using (public.is_inventory_manager());

-- MOVIMIENTOS
drop policy if exists "movimientos_delete_admin" on public.movimientos;

create policy "movimientos_delete_admin"
  on public.movimientos for delete
  to authenticated
  using (public.is_inventory_manager());

-- RPC ajuste: antes solo is_admin()
create or replace function public.registrar_ajuste(
  p_codigo text,
  p_stock_contado numeric,
  p_motivo text default 'Corrección',
  p_nota text default null,
  p_responsable text default 'Admin'
)
returns table (
  producto_id uuid,
  delta numeric,
  stock_anterior numeric,
  stock_nuevo numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_producto public.productos%rowtype;
  v_delta numeric;
begin
  if not public.is_inventory_manager() then
    raise exception 'solo admin o encargado puede ajustar inventario';
  end if;

  if p_codigo is null or btrim(p_codigo) = '' then
    raise exception 'código requerido';
  end if;
  if p_stock_contado is null then
    raise exception 'stock_contado requerido';
  end if;
  if p_stock_contado < 0 then
    raise exception 'stock_contado no puede ser negativo';
  end if;

  select *
  into v_producto
  from public.productos
  where upper(codigo) = upper(btrim(p_codigo))
  limit 1;

  if v_producto.id is null then
    raise exception 'producto no encontrado: %', p_codigo;
  end if;

  v_delta := p_stock_contado - coalesce(v_producto.stock_actual, 0);

  if v_delta = 0 then
    return query
      select v_producto.id, 0::numeric, coalesce(v_producto.stock_actual, 0), coalesce(v_producto.stock_actual, 0);
    return;
  end if;

  update public.productos
  set stock_actual = p_stock_contado
  where id = v_producto.id;

  insert into public.movimientos (
    producto_id,
    tipo,
    motivo,
    cantidad,
    fecha,
    responsable,
    nota
  )
  values (
    v_producto.id,
    'Ajuste',
    coalesce(nullif(btrim(p_motivo), ''), 'Corrección'),
    abs(v_delta),
    now(),
    coalesce(nullif(btrim(p_responsable), ''), 'Admin'),
    case when p_nota is null or btrim(p_nota) = '' then null else btrim(p_nota) end
  );

  return query
    select v_producto.id, v_delta, coalesce(v_producto.stock_actual, 0), p_stock_contado;
end;
$$;
