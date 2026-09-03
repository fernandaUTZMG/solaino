-- Renombrar archivos en bodega-proyectos (move + actualización en tablas) desde la app.
-- 1) Storage.move requiere SELECT + UPDATE sobre storage.objects (documentación Supabase).
--    Sin UPDATE para diseñadora/programadora, el API suele responder 400 / «Object not found».
-- 2) DELETE en rutas del flujo: útil si el motor usa borrado como paso interno o para limpieza.
-- 3) UPDATE en tablas de versiones / fotos a quien subió o a supervisor (revisor).

-- --- Storage: UPDATE (mismo criterio de rutas que insert/delete para quien renombra) ---
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

-- --- Storage: delete (antes solo is_bodega_supervisor en patch supervisor) ---
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
          or (public.can_upload_machine() and name like '%/programacion/%')
          or (public.can_upload_piece_photos() and name like '%/evidencias/%')
        )
      )
    )
  );

-- --- Tablas: permitir actualizar ruta/nombre de archivo (además de la policy de revisor existente) ---

drop policy if exists "design_versions_update_zip_paths" on public.project_design_versions;
create policy "design_versions_update_zip_paths"
  on public.project_design_versions for update
  to authenticated
  using (
    public.can_review_design()
    or (public.can_upload_design() and uploaded_by = auth.uid())
  )
  with check (
    public.can_review_design()
    or (public.can_upload_design() and uploaded_by = auth.uid())
  );

drop policy if exists "design_versions_update_info_cliente_paths" on public.project_design_versions;
create policy "design_versions_update_info_cliente_paths"
  on public.project_design_versions for update
  to authenticated
  using (public.can_upload_design() and package_category = 'info_cliente')
  with check (public.can_upload_design() and package_category = 'info_cliente');

drop policy if exists "machine_versions_update_zip_paths" on public.project_machine_versions;
create policy "machine_versions_update_zip_paths"
  on public.project_machine_versions for update
  to authenticated
  using (
    public.can_review_design()
    or (public.can_upload_machine() and uploaded_by = auth.uid())
  )
  with check (
    public.can_review_design()
    or (public.can_upload_machine() and uploaded_by = auth.uid())
  );

drop policy if exists "piece_photos_update_paths" on public.project_piece_photos;
create policy "piece_photos_update_paths"
  on public.project_piece_photos for update
  to authenticated
  using (
    public.can_review_design()
    or (public.can_upload_piece_photos() and uploaded_by = auth.uid())
  )
  with check (
    public.can_review_design()
    or (public.can_upload_piece_photos() and uploaded_by = auth.uid())
  );

notify pgrst, 'reload schema';
