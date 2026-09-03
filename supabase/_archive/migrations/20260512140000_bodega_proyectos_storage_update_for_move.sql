-- storage.move requiere UPDATE (y SELECT) en storage.objects para usuarios que renombran.
-- Sin esta política, diseñadora/programadora suelen ver 400 / «Object not found».

drop policy if exists "bodega_proyectos_update_bodega_rename_paths" on storage.objects;

create policy "bodega_proyectos_update_bodega_rename_paths"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'bodega-proyectos'
    and (
      public.is_bodega_supervisor()
      or (
        public.is_bodega()
        and (
          (public.can_upload_design() and (name like '%/diseno/%' or name like '%/info_cliente/%'))
          or (public.can_upload_machine() and name like '%/programacion/%')
          or (public.can_upload_piece_photos() and name like '%/evidencias/%')
        )
      )
    )
  )
  with check (
    bucket_id = 'bodega-proyectos'
    and (
      public.is_bodega_supervisor()
      or (
        public.is_bodega()
        and (
          (public.can_upload_design() and (name like '%/diseno/%' or name like '%/info_cliente/%'))
          or (public.can_upload_machine() and name like '%/programacion/%')
          or (public.can_upload_piece_photos() and name like '%/evidencias/%')
        )
      )
    )
  );

notify pgrst, 'reload schema';
