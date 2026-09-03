-- =============================================================================
-- Seed empresas desde Cliente.csv (columna: CLIENTE)
-- 1) Ejecuta `schema_empresas.sql` y `policies_empresas.sql` primero.
-- 2) Luego corre este script.
-- =============================================================================

insert into public.empresas (nombre)
values
  ('JABIL'),
  ('FLEX'),
  ('FLEX SUR')
on conflict (nombre) do nothing;

