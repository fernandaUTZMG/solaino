-- =============================================================================
-- Storage RLS + permisos — fotos de productos
-- =============================================================================
-- IMPORTANTE: no uses subconsultas a storage.buckets dentro de WITH CHECK/USING
-- si buckets tiene RLS: anon no ve filas → IN () vacío → siempre falla el INSERT.
-- Aquí solo comparamos bucket_id contra el id literal del bucket.
--
-- Diagnóstico: select id, name, "public" from storage.buckets;
-- Si tu id no es exactamente productos-fotos, sustituye las cuatro apariciones abajo.
-- =============================================================================

grant usage on schema storage to anon, authenticated;
grant select, insert, update, delete on storage.objects to anon, authenticated;
grant select on storage.buckets to anon, authenticated;

-- Quitar versiones anteriores del script
drop policy if exists "productos_fotos_select_public" on storage.objects;
drop policy if exists "productos_fotos_insert_anon" on storage.objects;
drop policy if exists "productos_fotos_update_anon" on storage.objects;
drop policy if exists "productos_fotos_delete_anon" on storage.objects;
drop policy if exists "productos_fotos_select_all" on storage.objects;
drop policy if exists "productos_fotos_insert_all" on storage.objects;
drop policy if exists "productos_fotos_update_all" on storage.objects;
drop policy if exists "productos_fotos_delete_all" on storage.objects;
drop policy if exists "productos_fotos_select_v2" on storage.objects;
drop policy if exists "productos_fotos_insert_v2" on storage.objects;
drop policy if exists "productos_fotos_update_v2" on storage.objects;
drop policy if exists "productos_fotos_delete_v2" on storage.objects;
drop policy if exists "productos_fotos_select_v3" on storage.objects;
drop policy if exists "productos_fotos_insert_v3" on storage.objects;
drop policy if exists "productos_fotos_update_v3" on storage.objects;
drop policy if exists "productos_fotos_delete_v3" on storage.objects;

-- Lectura de objetos (URL pública / listados)
create policy "productos_fotos_select_v3"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'productos-fotos');

-- Subida
create policy "productos_fotos_insert_v3"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'productos-fotos');

create policy "productos_fotos_update_v3"
  on storage.objects for update
  to anon, authenticated
  using (bucket_id = 'productos-fotos')
  with check (bucket_id = 'productos-fotos');

create policy "productos_fotos_delete_v3"
  on storage.objects for delete
  to anon, authenticated
  using (bucket_id = 'productos-fotos');
