-- Tras crear o reemplazar funciones expuestas al API, PostgREST puede seguir usando la caché vieja (errores 400).
-- Ejecuta esta línea en SQL Editor y espera ~1 min, o usa Dashboard → Project Settings → API → «Reload schema».

notify pgrst, 'reload schema';
