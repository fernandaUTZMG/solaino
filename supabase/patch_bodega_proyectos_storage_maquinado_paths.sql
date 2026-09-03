-- Permite subir capturas de tiempo en maquinado (programadora_maquinaria, encargado, admin).
-- Rutas: .../maquinado/tiempos-reales/... y .../programacion/tiempos-maquina/...
-- Ejecutar en SQL Editor completo. Luego: Settings → API → Reload schema (opcional).

drop policy if exists "bodega_proyectos_insert_paths" on storage.objects;

create policy "bodega_proyectos_insert_paths"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'bodega-proyectos'
    and (
      (public.can_upload_design() and (name like '%/diseno/%' or name like '%/info_cliente/%'))
      or (
        public.can_upload_machine()
        and (name like '%/programacion/%' or name like '%/maquinado/%')
      )
      or (public.can_upload_piece_photos() and name like '%/evidencias/%')
    )
  );

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
          or (
            public.can_upload_machine()
            and (name like '%/programacion/%' or name like '%/maquinado/%')
          )
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
          or (
            public.can_upload_machine()
            and (name like '%/programacion/%' or name like '%/maquinado/%')
          )
          or (public.can_upload_piece_photos() and name like '%/evidencias/%')
        )
      )
    )
  );

drop policy if exists "bodega_proyectos_delete_admin" on storage.objects;

create policy "bodega_proyectos_delete_admin"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'bodega-proyectos'
    and (
      public.is_bodega_supervisor()
      or (
        public.is_bodega()
        and (
          (public.can_upload_design() and (name like '%/diseno/%' or name like '%/info_cliente/%'))
          or (
            public.can_upload_machine()
            and (name like '%/programacion/%' or name like '%/maquinado/%')
          )
          or (public.can_upload_piece_photos() and name like '%/evidencias/%')
        )
      )
    )
  );

notify pgrst, 'reload schema';
