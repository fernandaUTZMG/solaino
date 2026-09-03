-- =============================================================================
-- Seed requisitores desde Requisitor.csv (columna: Requisitor)
-- 1) Ejecuta `schema_requisitores.sql` y `policies_requisitores.sql` primero.
-- 2) Luego corre este script.
-- =============================================================================

insert into public.requisitores (nombre)
values
  ('CARLOS URIBE'),
  ('RONALD ANASTACIO'),
  ('MARIA PRIETO'),
  ('EDUARDO MAYORAL'),
  ('CRISTIAN ESPINOZA')
on conflict (nombre) do nothing;

