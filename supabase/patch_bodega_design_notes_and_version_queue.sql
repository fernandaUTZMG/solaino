-- Notas de diseño (contratiempo) + cola de revisiones por versión.
-- Ejecutar en SQL Editor → Settings → API → Reload schema.

-- Diseñadora puede guardar nota de contratiempo sin pasar por RLS de supervisor.
create or replace function public.bodega_update_design_contratiempo_notes(
  p_project_id uuid,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  r text;
begin
  r := public.my_role();
  if r not in ('admin', 'encargado', 'disenadora') then
    raise exception 'Solo diseñadora o supervisión puede guardar la nota de contratiempo';
  end if;

  update public.bodega_projects
  set design_contratiempo_notes = nullif(trim(p_notes), ''), updated_at = now()
  where id = p_project_id;

  if not found then
    raise exception 'Proyecto no encontrado';
  end if;
end;
$$;

grant execute on function public.bodega_update_design_contratiempo_notes(uuid, text) to authenticated;

-- Marca versiones anteriores en revisión como reemplazadas (estado subida).
create or replace function public.bodega_supersede_older_design_revisions(
  p_project_id uuid,
  p_keep_version int
)
returns int
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  n int;
begin
  if not public.is_bodega() then
    raise exception 'Sin permiso';
  end if;

  update public.project_design_versions
  set
    status = 'subida',
    comentarios = coalesce(
      nullif(trim(comentarios), ''),
      'Reemplazada por versión ' || p_keep_version::text
    )
  where project_id = p_project_id
    and coalesce(package_category, 'entrega_diseno') = 'entrega_diseno'
    and status = 'en_revision'
    and version < p_keep_version;

  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on function public.bodega_supersede_older_design_revisions(uuid, int) to authenticated;

notify pgrst, 'reload schema';
