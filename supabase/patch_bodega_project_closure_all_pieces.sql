-- Cierre de proyecto: torno, perfilado y accesorios no pasan por detallado.
-- CNC por maquinado: programación, maquinado, detallado y armado.
-- CNC que salió a perfilado: perfilado, detallado y armado (sin maquinado).
-- El supervisor además exige foto de cada pieza.
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
        and not (
          p.programmer_bucket in ('torno', 'perfilado', 'accesorios')
          or (
            p.programmer_bucket = 'cnc'
            and p.programming_finished_at is not null
            and p.detallado_completed_at is not null
            and p.armado_completed_at is not null
            and (
              p.maquinado_completed_at is not null
              or (
                p.programming_exit_kind = 'a_perfilado'
                and p.perfilado_completed_at is not null
                and p.post_perfilado_programming_bucket is null
              )
            )
          )
        )
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
  select exists (
    select 1
    from public.project_piece_photos ph
    where ph.project_id = p_project_id
      and ph.piece_id is null
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
    raise exception 'Faltan piezas CNC por terminar (programación, maquinado, detallado y armado). Torno, perfilado y accesorios no bloquean el cierre';
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

drop function if exists public.bodega_supervisor_finalize_project(uuid);
drop function if exists public.bodega_supervisor_finalize_project(uuid, boolean);

create or replace function public.bodega_supervisor_finalize_project(
  p_project_id uuid,
  p_sin_foto boolean default false,
  p_nota text default ''
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_status text;
begin
  if public.my_role() not in ('admin', 'encargado') then
    raise exception 'Solo supervisor puede finalizar el proyecto';
  end if;

  select p.status into v_status
  from public.bodega_projects p
  where p.id = p_project_id;

  -- Otro proveedor: el diseño ya se entregó y el proyecto está en foto.
  -- No pide programación, maquinado, detallado ni armado.
  if v_status is distinct from 'en_foto'
     and not public.bodega_project_all_pieces_detallado_complete(p_project_id) then
    raise exception 'Faltan piezas CNC por terminar (programación, maquinado, detallado y armado) antes de finalizar el proyecto';
  end if;

  if not coalesce(p_sin_foto, false) and not public.bodega_project_all_pieces_have_photos(p_project_id) then
    raise exception 'Sube la foto del armado antes de finalizar el proyecto';
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

  insert into public.project_activity(project_id, actor_id, type, payload)
  values (
    p_project_id,
    auth.uid(),
    'project_finalized',
    jsonb_strip_nulls(jsonb_build_object(
      'sin_foto', coalesce(p_sin_foto, false),
      'comment', nullif(btrim(coalesce(p_nota, '')), '')
    ))
  );
end;
$$;

grant execute on function public.bodega_project_all_pieces_detallado_complete(uuid) to authenticated;
grant execute on function public.bodega_project_all_pieces_have_photos(uuid) to authenticated;
grant execute on function public.bodega_programadora_solicita_cierre(uuid) to authenticated;
grant execute on function public.bodega_supervisor_finalize_project(uuid, boolean, text) to authenticated;

notify pgrst, 'reload schema';
