-- Botón «Predeterminar todo a fotos»: el proyecto no se hace en este taller.
-- Pasa a en_foto. No se finaliza. El encargado o el admin lo cierran a mano.

create or replace function public.bodega_send_project_to_photo(p_project_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_finalized timestamptz;
  v_status text;
begin
  if public.my_role() not in ('admin', 'encargado') then
    raise exception 'Sin permiso para pasar el proyecto a la foto';
  end if;

  select p.project_finalized_at, p.status
  into v_finalized, v_status
  from public.bodega_projects p
  where p.id = p_project_id;

  if not found then
    raise exception 'Proyecto no encontrado';
  end if;

  if v_finalized is not null then
    raise exception 'El proyecto ya está finalizado';
  end if;

  if not exists (
    select 1
    from public.project_design_versions d
    where d.project_id = p_project_id
      and coalesce(d.package_category, 'entrega_diseno') = 'entrega_diseno'
  ) then
    raise exception 'Sube el diseño antes de pasarlo a la foto';
  end if;

  update public.bodega_project_work_intervals
  set ended_at = now()
  where project_id = p_project_id
    and lane = 'diseno'
    and ended_at is null;

  if v_status is distinct from 'en_foto' then
    update public.bodega_projects
    set status = 'en_foto'
    where id = p_project_id
      and project_finalized_at is null;

    insert into public.project_activity(project_id, actor_id, type, payload)
    values (
      p_project_id,
      auth.uid(),
      'external_ready_for_photo',
      jsonb_build_object('origen', 'predeterminar_foto')
    );
  end if;

  return true;
end;
$$;

grant execute on function public.bodega_send_project_to_photo(uuid) to authenticated;

notify pgrst, 'reload schema';
