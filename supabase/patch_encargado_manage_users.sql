-- Permite al supervisor de bodega (encargado) listar y gestionar usuarios operativos:
-- diseñadora, programadora, operador, encargado y usuario inventario.
-- No puede ver ni modificar cuentas admin.
-- Ejecutar en Supabase → SQL Editor y luego Settings → API → Reload schema.

create or replace function public.can_manage_users()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select public.my_role() in ('admin', 'encargado');
$$;

comment on function public.can_manage_users() is
  'Admin global o encargado: gestión de usuarios operativos.';

-- Roles de bodega/inventario que el encargado puede ver y gestionar (no admin).
create or replace function public.encargado_manageable_profile_role(p_role text)
returns boolean
language sql
immutable
as $$
  select p_role in (
    'user',
    'encargado',
    'disenadora',
    'programadora_maquinaria',
    'operador_bodega'
  );
$$;

create or replace function public.can_view_profile_row(p_profile_id uuid, p_profile_role text)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select
    p_profile_id = auth.uid()
    or public.my_role() = 'admin'
    or (
      public.my_role() = 'encargado'
      and public.encargado_manageable_profile_role(p_profile_role)
    );
$$;

create or replace function public.can_update_profile_row(p_profile_id uuid, p_profile_role text)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select
    (p_profile_id = auth.uid())
    or public.my_role() = 'admin'
    or (
      public.my_role() = 'encargado'
      and public.encargado_manageable_profile_role(p_profile_role)
    );
$$;

-- Listado explícito vía RPC (evita límites de RLS en el cliente).
create or replace function public.list_profiles_for_user_manager()
returns table (
  id uuid,
  username text,
  email text,
  role text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
set row_security = off
as $$
  select p.id, p.username, p.email, p.role, p.created_at
  from public.profiles p
  where public.can_view_profile_row(p.id, p.role)
  order by p.created_at desc;
$$;

grant execute on function public.list_profiles_for_user_manager() to authenticated;

-- profiles: lectura
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
drop policy if exists "profiles_select_own_or_user_manager" on public.profiles;
create policy "profiles_select_own_or_user_manager"
  on public.profiles for select
  to authenticated
  using (public.can_view_profile_row(id, role));

-- profiles: actualización (encargado no puede asignar rol admin)
drop policy if exists "profiles_update_own_or_admin" on public.profiles;
drop policy if exists "profiles_update_own_or_user_manager" on public.profiles;
create policy "profiles_update_own_or_user_manager"
  on public.profiles for update
  to authenticated
  using (public.can_update_profile_row(id, role))
  with check (
    (id = auth.uid())
    or public.my_role() = 'admin'
    or (
      public.my_role() = 'encargado'
      and public.encargado_manageable_profile_role(role)
    )
  );

-- Recuperación de contraseña: encargado puede marcar atendida
create or replace function public.admin_mark_password_recovery_atendida(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_manage_users() then
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

-- Renombrar usuario / sincronizar email Auth (encargado no toca cuentas admin)
create or replace function public.admin_sync_auth_email_for_username(p_user_id uuid, p_username text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v text;
  v_email text;
  v_target_role text;
begin
  if not public.can_manage_users() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  select p.role into v_target_role from public.profiles p where p.id = p_user_id;
  if v_target_role is null then
    raise exception 'Usuario no encontrado' using errcode = '22023';
  end if;
  if public.my_role() = 'encargado' and not public.encargado_manageable_profile_role(v_target_role) then
    raise exception 'No autorizado para modificar este usuario' using errcode = '42501';
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

-- password_recovery_requests: lectura para encargado
alter table public.password_recovery_requests enable row level security;

drop policy if exists "password_recovery_select_admin" on public.password_recovery_requests;
drop policy if exists "password_recovery_select_user_manager" on public.password_recovery_requests;
create policy "password_recovery_select_user_manager"
  on public.password_recovery_requests for select
  to authenticated
  using (public.can_manage_users());

notify pgrst, 'reload schema';
