-- Notificaciones in-app (prioridad de proyecto, etc.)
-- Ejecutar en Supabase → SQL Editor y recargar esquema API.

create table if not exists public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists app_notifications_user_unread_idx
  on public.app_notifications (user_id, created_at desc)
  where read_at is null;

comment on table public.app_notifications is
  'Avisos por usuario (prioridad de proyecto, etc.).';

alter table public.app_notifications enable row level security;

drop policy if exists "app_notifications_select_own" on public.app_notifications;
create policy "app_notifications_select_own"
  on public.app_notifications for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "app_notifications_update_own" on public.app_notifications;
create policy "app_notifications_update_own"
  on public.app_notifications for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Inserción solo vía RPC (security definer).
revoke insert on public.app_notifications from authenticated;
revoke insert on public.app_notifications from anon;

create or replace function public.notify_bodega_project_prioridad_change(
  p_project_id uuid,
  p_old_nivel smallint,
  p_new_nivel smallint
)
returns int
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  r text := public.my_role();
  p public.bodega_projects%rowtype;
  actor_name text;
  old_l text;
  new_l text;
  n int := 0;
begin
  if not public.is_bodega() then
    raise exception 'Solo cuentas de bodega';
  end if;

  if r not in ('admin', 'encargado') then
    raise exception 'Solo supervisor puede notificar cambio de prioridad';
  end if;

  select * into p from public.bodega_projects where id = p_project_id;
  if not found then
    raise exception 'Proyecto no encontrado';
  end if;

  p_old_nivel := coalesce(p_old_nivel, 0);
  p_new_nivel := coalesce(p_new_nivel, 0);
  if p_old_nivel < 0 then p_old_nivel := 0; end if;
  if p_old_nivel > 4 then p_old_nivel := 4; end if;
  if p_new_nivel < 0 then p_new_nivel := 0; end if;
  if p_new_nivel > 4 then p_new_nivel := 4; end if;

  if p_old_nivel = p_new_nivel then
    return 0;
  end if;

  select coalesce(nullif(trim(pr.username), ''), 'Supervisor')
  into actor_name
  from public.profiles pr
  where pr.id = auth.uid();

  old_l := case p_old_nivel
    when 0 then 'Normal'
    when 1 then 'Baja'
    when 2 then 'Media'
    when 3 then 'Alta'
    else 'Urgente'
  end;

  new_l := case p_new_nivel
    when 0 then 'Normal'
    when 1 then 'Baja'
    when 2 then 'Media'
    when 3 then 'Alta'
    else 'Urgente'
  end;

  insert into public.app_notifications (user_id, kind, title, body, payload)
  select
    pr.id,
    'bodega_prioridad',
    'Prioridad actualizada',
  format(
    '%s cambió la prioridad de %s (%s): %s → %s',
    actor_name,
    coalesce(nullif(trim(p.folio), ''), 'proyecto'),
    coalesce(nullif(trim(p.nombre), ''), '—'),
    old_l,
    new_l
  ),
  jsonb_build_object(
    'project_id', p.id,
    'folio', p.folio,
    'proyecto_nombre', p.nombre,
    'old_nivel', p_old_nivel,
    'new_nivel', p_new_nivel,
    'actor_username', actor_name
  )
  from public.profiles pr
  where pr.role in ('disenadora', 'programadora_maquinaria', 'operador_bodega')
    and pr.id is distinct from auth.uid();

  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on function public.notify_bodega_project_prioridad_change(uuid, smallint, smallint) to authenticated;

notify pgrst, 'reload schema';
