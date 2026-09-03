-- DEPRECADO (2026-05): ya usamos Auth + policies en `policies_roles_audit_solicitudes.sql`.
-- Este archivo se deja solo para limpiar políticas antiguas de `anon` si existieran.
-- NO crea nuevas políticas (por seguridad).

alter table public.movimientos enable row level security;

-- Limpia cualquier policy histórica para `anon` (frontend no debe escribir sin Auth).
drop policy if exists "movimientos_select_anon" on public.movimientos;
drop policy if exists "movimientos_insert_anon" on public.movimientos;
