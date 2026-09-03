-- Políticas RLS para roles (admin/user), auditoría y solicitudes.
-- Ejecuta después de `schema_roles_audit_solicitudes.sql`.

-- PROFILES
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
drop policy if exists "profiles_update_own_or_admin" on public.profiles;

create policy "profiles_select_own_or_admin"
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.is_admin());

create policy "profiles_update_own_or_admin"
  on public.profiles for update
  to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- AUDIT LOG (solo admin lee; nadie escribe directo)
alter table public.audit_log enable row level security;

drop policy if exists "audit_log_select_admin" on public.audit_log;

create policy "audit_log_select_admin"
  on public.audit_log for select
  to authenticated
  using (public.is_admin());

-- SOLICITUDES
alter table public.solicitudes enable row level security;

drop policy if exists "solicitudes_select_admin_or_owner" on public.solicitudes;
drop policy if exists "solicitudes_insert_owner" on public.solicitudes;
drop policy if exists "solicitudes_update_admin" on public.solicitudes;
drop policy if exists "solicitudes_delete_admin" on public.solicitudes;
drop policy if exists "solicitudes_delete_owner_pending" on public.solicitudes;

create policy "solicitudes_select_admin_or_owner"
  on public.solicitudes for select
  to authenticated
  using (public.is_admin() or requested_by = auth.uid());

create policy "solicitudes_insert_owner"
  on public.solicitudes for insert
  to authenticated
  with check (requested_by = auth.uid());

create policy "solicitudes_update_admin"
  on public.solicitudes for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "solicitudes_delete_admin"
  on public.solicitudes for delete
  to authenticated
  using (public.is_admin());

-- Permite que el usuario elimine sus solicitudes pendientes (opcional)
create policy "solicitudes_delete_owner_pending"
  on public.solicitudes for delete
  to authenticated
  using (requested_by = auth.uid() and status in ('pendiente', 'aprobada'));

-- PRODUCTOS
alter table public.productos enable row level security;

drop policy if exists "productos_select_auth" on public.productos;
drop policy if exists "productos_insert_admin" on public.productos;
drop policy if exists "productos_update_auth" on public.productos;
drop policy if exists "productos_delete_admin" on public.productos;

create policy "productos_select_auth"
  on public.productos for select
  to authenticated
  using (true);

-- Solo admin crea y elimina productos
create policy "productos_insert_admin"
  on public.productos for insert
  to authenticated
  with check (public.is_admin());

create policy "productos_delete_admin"
  on public.productos for delete
  to authenticated
  using (public.is_admin());

-- Usuario puede editar stock (y demás campos si los deja el front); admin también.
create policy "productos_update_auth"
  on public.productos for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- MOVIMIENTOS
alter table public.movimientos enable row level security;

drop policy if exists "movimientos_select_auth" on public.movimientos;
drop policy if exists "movimientos_insert_auth" on public.movimientos;
drop policy if exists "movimientos_delete_admin" on public.movimientos;

create policy "movimientos_select_auth"
  on public.movimientos for select
  to authenticated
  using (true);

create policy "movimientos_insert_auth"
  on public.movimientos for insert
  to authenticated
  with check (true);

create policy "movimientos_delete_admin"
  on public.movimientos for delete
  to authenticated
  using (public.is_admin());

-- NOTA:
-- Si hoy tenías políticas para `anon`, puedes quitarlas si ya usarás Auth.

