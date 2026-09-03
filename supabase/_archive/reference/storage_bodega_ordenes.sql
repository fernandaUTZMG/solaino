-- Storage: PDFs de órdenes de compra
-- Ejecuta este script completo en SQL Editor (crea el bucket si no existe + policies + GRANT).
-- Opcional: también puedes crear el bucket en Dashboard → Storage → New bucket con el mismo nombre.
--
-- Requiere antes: supabase/schema_bodega.sql (funciones my_role(), is_admin()).
-- La misma función vive también en policies_bodega_ordenes_compra.sql; aquí se
-- define para poder correr solo este archivo sin error 42883.

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

-- Bucket: sin esta fila, la API devuelve 400 al subir ("Bucket not found").
insert into storage.buckets (id, name, public)
select 'bodega-ordenes-compra', 'bodega-ordenes-compra', false
where not exists (select 1 from storage.buckets where id = 'bodega-ordenes-compra');

grant usage on schema storage to authenticated;
-- Sin esto, el cliente recibe 400 al subir aunque exista la policy (falta privilegio en la tabla).
grant select, insert, update, delete on storage.objects to authenticated;

drop policy if exists "bodega_ordenes_select_auth" on storage.objects;
drop policy if exists "bodega_ordenes_insert_bodega" on storage.objects;
drop policy if exists "bodega_ordenes_update_managers" on storage.objects;
drop policy if exists "bodega_ordenes_delete_admin" on storage.objects;

create policy "bodega_ordenes_select_auth"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'bodega-ordenes-compra');

-- Subir: mismo criterio que filas en bodega_ordenes_compra (admin o encargado)
create policy "bodega_ordenes_insert_bodega"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'bodega-ordenes-compra'
    and public.can_manage_bodega_ordenes()
  );

create policy "bodega_ordenes_update_managers"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'bodega-ordenes-compra'
    and public.can_manage_bodega_ordenes()
  )
  with check (bucket_id = 'bodega-ordenes-compra');

create policy "bodega_ordenes_delete_admin"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'bodega-ordenes-compra' and public.is_bodega_supervisor());
