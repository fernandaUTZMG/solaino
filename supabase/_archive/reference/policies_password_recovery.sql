-- RLS para password_recovery_requests
-- Ejecuta después de schema_password_recovery.sql

alter table public.password_recovery_requests enable row level security;

drop policy if exists "password_recovery_select_admin" on public.password_recovery_requests;

create policy "password_recovery_select_admin"
  on public.password_recovery_requests for select
  to authenticated
  using (public.is_admin());

-- Sin políticas de insert/update: denegado por defecto; las inserciones van por RPC (security definer).
