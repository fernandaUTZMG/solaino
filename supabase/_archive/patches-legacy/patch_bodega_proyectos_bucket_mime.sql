-- Parche: quita restricción de MIME en el bucket de proyectos (si quedó solo imágenes/PDF, el ZIP falla con 400).
-- Ejecuta en Supabase → SQL Editor. Luego: NOTIFY pgrst, 'reload schema';

update storage.buckets
set allowed_mime_types = null
where id = 'bodega-proyectos';

notify pgrst, 'reload schema';
