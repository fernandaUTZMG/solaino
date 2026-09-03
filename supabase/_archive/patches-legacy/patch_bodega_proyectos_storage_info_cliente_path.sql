-- Permite subir ZIP bajo .../info_cliente/... (referencia del supervisor para la diseñadora).
-- Sin esto, Storage responde 400 al POST porque la policy solo permitía /diseno/, /programacion/, /evidencias/.

drop policy if exists "bodega_proyectos_insert_paths" on storage.objects;

create policy "bodega_proyectos_insert_paths"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'bodega-proyectos'
    and (
      (public.can_upload_design() and (name like '%/diseno/%' or name like '%/info_cliente/%'))
      or (public.can_upload_machine() and name like '%/programacion/%')
      or (public.can_upload_piece_photos() and name like '%/evidencias/%')
    )
  );
