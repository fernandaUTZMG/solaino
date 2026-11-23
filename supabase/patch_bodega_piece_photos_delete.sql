-- Quien subió la foto del armado puede quitarla o cambiarla.
-- El encargado y el admin ya podían borrarla.

drop policy if exists "piece_photos_delete_uploader" on public.project_piece_photos;

create policy "piece_photos_delete_uploader"
  on public.project_piece_photos for delete
  to authenticated
  using (
    public.can_upload_piece_photos()
    and uploaded_by = auth.uid()
  );

notify pgrst, 'reload schema';
