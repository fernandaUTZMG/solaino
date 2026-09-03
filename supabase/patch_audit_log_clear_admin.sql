-- RPC: limpiar audit_log (solo administrador mayor / role admin).
-- Ejecuta en Supabase → SQL Editor.
-- p_actor_id NULL = borra toda la bitácora; UUID = solo registros de ese usuario.

create or replace function public.clear_audit_log(p_actor_id uuid default null)
returns bigint
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  deleted_count bigint;
begin
  if not public.is_admin() then
    raise exception 'Solo el administrador mayor puede limpiar el historial';
  end if;

  if p_actor_id is null then
    delete from public.audit_log;
  else
    delete from public.audit_log where actor_id = p_actor_id;
  end if;

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

comment on function public.clear_audit_log(uuid) is
  'Elimina filas de audit_log. Solo admin. p_actor_id opcional: historial de un usuario.';

grant execute on function public.clear_audit_log(uuid) to authenticated;
