-- Avisa a diseñadoras cuando el encargado confirma su entrega de diseño.
-- Requiere: patch_app_notifications.sql
-- Ejecutar en Supabase → SQL Editor.

create or replace function public.notify_bodega_design_entrega_confirmada(
  p_project_id uuid,
  p_design_version_id uuid default null,
  p_filename text default null,
  p_version int default null
)
returns int
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  p public.bodega_projects%rowtype;
  actor_name text;
  n int := 0;
  fname text;
  ver int;
begin
  if public.my_role() is null or public.my_role() not in ('admin', 'encargado') then
    raise exception 'Solo el encargado puede avisar confirmación de diseño';
  end if;

  select * into p from public.bodega_projects where id = p_project_id;
  if not found then
    raise exception 'Proyecto no encontrado';
  end if;

  select coalesce(nullif(trim(pr.username), ''), 'Encargado')
  into actor_name
  from public.profiles pr
  where pr.id = auth.uid();

  fname := coalesce(nullif(trim(p_filename), ''), 'entrega de diseño');
  ver := p_version;

  if p_design_version_id is not null then
    select
      coalesce(ver, dv.version),
      coalesce(nullif(trim(fname), ''), nullif(trim(dv.zip_filename), ''), 'entrega de diseño')
    into ver, fname
    from public.project_design_versions dv
    where dv.id = p_design_version_id;
  end if;

  insert into public.app_notifications (user_id, kind, title, body, payload)
  select
    pr.id,
    'bodega_design_confirmada',
    format(
      'Entrega confirmada — %s',
      coalesce(nullif(trim(p.folio), ''), 'proyecto')
    ),
    format(
      '%s confirmó tu entrega%s de «%s» (%s). Ya puedes separar destinos (torno / perfiladora / CNC / accesorio) en Diseño.',
      actor_name,
      case when ver is not null then format(' V%s', ver) else '' end,
      coalesce(nullif(trim(p.nombre), ''), nullif(trim(p.folio), ''), 'proyecto'),
      fname
    ),
    jsonb_build_object(
      'project_id', p.id,
      'folio', p.folio,
      'proyecto_nombre', p.nombre,
      'design_version_id', p_design_version_id,
      'design_version', ver,
      'filename', fname,
      'actor_username', actor_name,
      'tab', 'diseno'
    )
  from public.profiles pr
  where pr.role = 'disenadora'
    and pr.id is distinct from auth.uid();

  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on function public.notify_bodega_design_entrega_confirmada(uuid, uuid, text, int) to authenticated;

notify pgrst, 'reload schema';
