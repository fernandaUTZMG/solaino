-- Avisos a programadora de maquinaria cuando la diseñadora sube un ensamble .x_t.
-- Requiere: patch_app_notifications.sql
-- Ejecutar en Supabase → SQL Editor.

create or replace function public.notify_bodega_design_xt_uploaded(
  p_project_id uuid,
  p_filename text,
  p_piece_count int default 0
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
begin
  if not public.is_bodega() then
    raise exception 'Solo cuentas de bodega';
  end if;

  select * into p from public.bodega_projects where id = p_project_id;
  if not found then
    raise exception 'Proyecto no encontrado';
  end if;

  select coalesce(nullif(trim(pr.username), ''), 'Diseño')
  into actor_name
  from public.profiles pr
  where pr.id = auth.uid();

  fname := coalesce(nullif(trim(p_filename), ''), 'ensamble.x_t');

  insert into public.app_notifications (user_id, kind, title, body, payload)
  select
    pr.id,
    'bodega_design_xt',
    'Nuevo ensamble .x_t',
    format(
      '%s subió %s en %s (%s)%s. Ábrelo en Programación para descargar las piezas y asignar CNC, torno o perfilado.',
      actor_name,
      fname,
      coalesce(nullif(trim(p.folio), ''), 'proyecto'),
      coalesce(nullif(trim(p.nombre), ''), '—'),
      case when coalesce(p_piece_count, 0) > 0 then format(' · %s pieza(s)', p_piece_count) else '' end
    ),
    jsonb_build_object(
      'project_id', p.id,
      'folio', p.folio,
      'proyecto_nombre', p.nombre,
      'filename', fname,
      'piece_count', coalesce(p_piece_count, 0),
      'tab', 'cnc',
      'actor_username', actor_name
    )
  from public.profiles pr
  where pr.role = 'programadora_maquinaria'
    and pr.id is distinct from auth.uid();

  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on function public.notify_bodega_design_xt_uploaded(uuid, text, int) to authenticated;

notify pgrst, 'reload schema';
