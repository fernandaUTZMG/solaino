-- Parche: reemplaza la función `admin_sync_auth_email_for_username` para que, al renombrar
-- usuario, también actualice `auth.identities` (proveedor `email`).
--
-- IMPORTANTE: esto NO repara cuentas ya rotas. Si el login sigue en 400 tras cambiar
-- contraseña, ejecuta además (una vez): `repair_auth_identities_email_from_users.sql`
-- y redespliega la Edge Function `admin-set-password` desde el repo actualizado.

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
