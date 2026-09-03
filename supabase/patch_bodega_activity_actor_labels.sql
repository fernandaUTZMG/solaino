-- Quién escribió cada nota / avance en project_activity (historial Bodega).
-- Ejecuta en Supabase → SQL Editor y recarga el esquema API si hace falta.

create or replace function public.bodega_role_display_label(p_role text, p_username text default null)
returns text
language sql
immutable
as $$
  select trim(
    case coalesce(nullif(trim(p_role), ''), 'user')
      when 'disenadora' then 'Diseñadora'
      when 'programadora_maquinaria' then 'Programadora'
      when 'encargado' then 'Encargado'
      when 'admin' then 'Administrador'
      when 'operador_bodega' then 'Operador taller'
      when 'user' then 'Usuario inventario'
      else coalesce(nullif(trim(p_role), ''), 'Usuario')
    end
    || case
      when coalesce(nullif(trim(p_username), ''), '') <> '' then ' · ' || trim(p_username)
      else ''
    end
  );
$$;

create or replace function public.bodega_activity_display_labels(p_user_ids uuid[])
returns table (id uuid, display_label text)
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select
    p.id,
    public.bodega_role_display_label(p.role, p.username) as display_label
  from public.profiles p
  where p.id = any (coalesce(p_user_ids, array[]::uuid[]));
$$;

grant execute on function public.bodega_role_display_label(text, text) to authenticated;
grant execute on function public.bodega_activity_display_labels(uuid[]) to authenticated;

comment on function public.bodega_activity_display_labels(uuid[]) is
  'Etiquetas legibles (rol + usuario) para el historial de actividad en Bodega.';

-- Notas y avances antiguos: copiar rol desde profiles al JSON (si faltaba actor_role).
update public.project_activity pa
set payload =
  coalesce(pa.payload, '{}'::jsonb)
  || jsonb_build_object(
    'actor_role', p.role,
    'actor_username', coalesce(
      nullif(trim(pa.payload->>'actor_username'), ''),
      nullif(trim(p.username), '')
    )
  )
from public.profiles p
where pa.actor_id = p.id
  and coalesce(nullif(trim(pa.payload->>'actor_role'), ''), '') = '';

-- Avance manual: guardar rol de quien registra (notas de diseñadora / programadora).
create or replace function public.bodega_set_avance_manual(
  p_project_id uuid,
  p_avance_pct int,
  p_comment text default null
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  r text;
  u text;
begin
  r := public.my_role();
  if r not in ('admin', 'encargado', 'disenadora', 'programadora_maquinaria') then
    raise exception 'Solo roles de bodega (diseñadora, programadora, encargado o admin) pueden registrar avance manual';
  end if;

  if p_avance_pct < 0 or p_avance_pct > 100 then
    raise exception 'El avance debe estar entre 0 y 100';
  end if;

  select nullif(trim(p.username), '')
  into u
  from public.profiles p
  where p.id = auth.uid();

  update public.bodega_projects
  set
    avance_pct = p_avance_pct,
    updated_at = now()
  where id = p_project_id;

  if not found then
    raise exception 'Proyecto no encontrado';
  end if;

  insert into public.project_activity(project_id, actor_id, type, payload)
  values (
    p_project_id,
    auth.uid(),
    'avance_manual',
    jsonb_build_object(
      'avance_pct', p_avance_pct,
      'comment', p_comment,
      'actor_role', r,
      'actor_username', u
    )
  );
end;
$$;

grant execute on function public.bodega_set_avance_manual(uuid, int, text) to authenticated;

notify pgrst, 'reload schema';
