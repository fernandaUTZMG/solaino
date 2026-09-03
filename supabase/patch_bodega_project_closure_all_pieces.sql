-- Cierre de proyecto: exige TODAS las piezas con detallado (y fotos para supervisor).
-- Ejecutar en SQL Editor → Settings → API → Reload schema.

create or replace function public.bodega_project_all_pieces_detallado_complete(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
      select 1
      from public.bodega_project_pieces p
      where p.project_id = p_project_id
    )
    and not exists (
      select 1
      from public.bodega_project_pieces p
      where p.project_id = p_project_id
        and p.detallado_completed_at is null
    );
$$;

create or replace function public.bodega_project_all_pieces_have_photos(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select not exists (
    select 1
    from public.bodega_project_pieces p
    where p.project_id = p_project_id
      and not exists (
        select 1
        from public.project_piece_photos ph
        where ph.project_id = p_project_id
          and ph.piece_id = p.id
      )
  );
$$;

create or replace function public.bodega_programadora_solicita_cierre(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  r text := public.my_role();
  st text;
begin
  if r not in ('admin', 'programadora_maquinaria') then
    raise exception 'Solo programadora o admin puede solicitar revisión de cierre';
  end if;

  select p.status into st from public.bodega_projects p where p.id = p_project_id;
  if not found then raise exception 'Proyecto no encontrado'; end if;

  if st not in ('en_programacion', 'diseno_aprobado') then
    raise exception 'El proyecto debe estar en diseño aprobado o en programación para solicitar cierre';
  end if;

  if not public.bodega_project_all_pieces_detallado_complete(p_project_id) then
    raise exception 'Todas las piezas del proyecto deben tener detallado terminado antes de solicitar cierre';
  end if;

  update public.bodega_projects
    set status = 'revision_programacion'
  where id = p_project_id;

  insert into public.project_activity(project_id, actor_id, type, payload)
  values (
    p_project_id,
    auth.uid(),
    'closure_review_requested',
    jsonb_build_object('from_status', st)
  );
end;
$$;

create or replace function public.bodega_supervisor_finalize_project(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if public.my_role() not in ('admin', 'encargado') then
    raise exception 'Solo supervisor puede finalizar el proyecto';
  end if;

  if not public.bodega_project_all_pieces_detallado_complete(p_project_id) then
    raise exception 'Todas las piezas deben tener detallado terminado antes de finalizar el proyecto';
  end if;

  if not public.bodega_project_all_pieces_have_photos(p_project_id) then
    raise exception 'Cada pieza del proyecto debe tener al menos una foto antes de finalizar';
  end if;

  update public.bodega_projects
  set
    project_finalized_at = now(),
    project_finalized_by = auth.uid(),
    status = 'terminado',
    fecha_termino = coalesce(fecha_termino, current_date)
  where id = p_project_id;

  if not found then
    raise exception 'Proyecto no encontrado';
  end if;
end;
$$;

grant execute on function public.bodega_project_all_pieces_detallado_complete(uuid) to authenticated;
grant execute on function public.bodega_project_all_pieces_have_photos(uuid) to authenticated;
grant execute on function public.bodega_programadora_solicita_cierre(uuid) to authenticated;
grant execute on function public.bodega_supervisor_finalize_project(uuid) to authenticated;

notify pgrst, 'reload schema';
