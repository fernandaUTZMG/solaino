-- Archivo (PDF u otro) por factura de crédito.
-- Subida en bodega-proyectos bajo facturas-credito/{id}/...
-- Solo encargado y admin (is_bodega_supervisor).

alter table public.facturas_credito
  add column if not exists archivo_path text,
  add column if not exists archivo_nombre text;

drop policy if exists "facturas_credito_archivo_select" on storage.objects;
create policy "facturas_credito_archivo_select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'bodega-proyectos'
    and name like 'facturas-credito/%'
    and public.is_bodega_supervisor()
  );

drop policy if exists "facturas_credito_archivo_insert" on storage.objects;
create policy "facturas_credito_archivo_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'bodega-proyectos'
    and name like 'facturas-credito/%'
    and public.is_bodega_supervisor()
  );

drop policy if exists "facturas_credito_archivo_update" on storage.objects;
create policy "facturas_credito_archivo_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'bodega-proyectos'
    and name like 'facturas-credito/%'
    and public.is_bodega_supervisor()
  )
  with check (
    bucket_id = 'bodega-proyectos'
    and name like 'facturas-credito/%'
    and public.is_bodega_supervisor()
  );

drop policy if exists "facturas_credito_archivo_delete" on storage.objects;
create policy "facturas_credito_archivo_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'bodega-proyectos'
    and name like 'facturas-credito/%'
    and public.is_bodega_supervisor()
  );

notify pgrst, 'reload schema';
