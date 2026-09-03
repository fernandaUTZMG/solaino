-- Solicitudes de "olvidé mi contraseña" (notificación al admin) + helpers.
-- Ejecuta en Supabase → SQL Editor después de policies_roles_audit_solicitudes.sql

create table if not exists public.password_recovery_requests (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  created_at timestamptz not null default now(),
  status text not null default 'pendiente' check (status in ('pendiente', 'atendida')),
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id)
);

comment on table public.password_recovery_requests is
  'Usuario anónimo solicita ayuda por contraseña olvidada; el admin ve el listado y atiende en Auth.';

create index if not exists password_recovery_pending_idx
  on public.password_recovery_requests (created_at desc)
  where status = 'pendiente';

-- Llamada desde login sin sesión (anon) o con sesión.
create or replace function public.request_password_recovery(p_username text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v text;
begin
  v := lower(trim(p_username));
  if length(v) < 2 or length(v) > 80 then
    raise exception 'Usuario inválido' using errcode = '22023';
  end if;
  if v !~ '^[a-z0-9@._+\-]+$' then
    raise exception 'Usuario inválido' using errcode = '22023';
  end if;
  insert into public.password_recovery_requests (username) values (v);
end;
$$;

grant execute on function public.request_password_recovery(text) to anon;
grant execute on function public.request_password_recovery(text) to authenticated;

create or replace function public.admin_mark_password_recovery_atendida(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  update public.password_recovery_requests
  set
    status = 'atendida',
    resolved_at = now(),
    resolved_by = auth.uid()
  where id = p_id and status = 'pendiente';
end;
$$;

grant execute on function public.admin_mark_password_recovery_atendida(uuid) to authenticated;

-- Sincroniza email en Auth con usuario@solaino.local (solo admin).
create or replace function public.admin_sync_auth_email_for_username(p_user_id uuid, p_username text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v text;
  v_email text;
begin
  if not public.is_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  v := lower(trim(p_username));
  if length(v) < 3 or length(v) > 50 then
    raise exception 'Usuario inválido' using errcode = '22023';
  end if;
  if v !~ '^[a-z0-9._+\-]+$' then
    raise exception 'Usuario inválido' using errcode = '22023';
  end if;
  v_email := v || '@solaino.local';

  update public.profiles
  set username = v, email = v_email
  where id = p_user_id;

  update auth.users
  set email = v_email
  where id = p_user_id;

  -- GoTrue usa `auth.identities` (proveedor email) para `signInWithPassword`; si solo se
  -- actualiza `auth.users`, el login puede responder "invalid credentials" aunque la contraseña sea correcta.
  update auth.identities
  set
    identity_data = jsonb_set(
      coalesce(identity_data, '{}'::jsonb),
      '{email}',
      to_jsonb(v_email),
      true
    ),
    updated_at = now()
  where user_id = p_user_id
    and provider = 'email';
end;
$$;

grant execute on function public.admin_sync_auth_email_for_username(uuid, text) to authenticated;
