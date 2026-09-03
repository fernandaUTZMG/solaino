-- Parche: bodega_set_project_status permite transiciones de diseñadora/programadora (además de admin/encargado).
-- Ejecuta en Supabase → SQL Editor. Luego: NOTIFY pgrst, 'reload schema'; o Dashboard → API → Reload schema.

create or replace function public.bodega_set_project_status(
  p_project_id uuid,
  p_status text,
  p_comment text default null,
  p_design_version_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  r text;
  cur text;
begin
  r := public.my_role();

  select p.status into strict cur
  from public.bodega_projects p
  where p.id = p_project_id;

  if r in ('admin', 'encargado') then
    update public.bodega_projects
      set status = p_status
    where id = p_project_id;
    if not found then
      raise exception 'Proyecto no encontrado';
    end if;
  elsif r = 'disenadora' then
    if p_status is distinct from 'revision_diseno' then
      raise exception 'La diseñadora solo puede enviar el proyecto a «revisión diseño» (revision_diseno)';
    end if;
    if cur not in ('en_diseno', 'modificacion_diseno') then
      raise exception 'No se puede enviar a revisión de diseño desde el estado actual (%).', cur;
    end if;
    update public.bodega_projects
      set status = 'revision_diseno'
    where id = p_project_id and status in ('en_diseno', 'modificacion_diseno');
    if not found then
      raise exception 'No se pudo pasar a revisión de diseño (estado ya cambió).';
    end if;
  elsif r = 'programadora_maquinaria' then
    if p_status is distinct from 'en_programacion' then
      raise exception 'La programadora solo puede registrar «en programación» (en_programacion) desde diseño aprobado';
    end if;
    if cur is distinct from 'diseno_aprobado' then
      raise exception 'Solo con diseño aprobado se puede pasar a programación desde aquí (estado actual: %).', cur;
    end if;
    update public.bodega_projects
      set status = 'en_programacion'
    where id = p_project_id and status = 'diseno_aprobado';
    if not found then
      raise exception 'No se pudo pasar a programación (¿diseño aún no aprobado o etapa ya avanzó?).';
    end if;
  else
    raise exception 'Solo supervisor (admin/encargado) puede fijar este estado; diseñadora/programadora tienen transiciones limitadas';
  end if;

  insert into public.project_activity(project_id, actor_id, type, payload)
  values(
    p_project_id,
    auth.uid(),
    'status_changed',
    jsonb_build_object('status', p_status, 'comment', p_comment, 'design_version_id', p_design_version_id)
  );
end;
$$;

grant execute on function public.bodega_set_project_status(uuid, text, text, uuid) to authenticated;

notify pgrst, 'reload schema';
