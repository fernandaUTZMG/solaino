-- Proveedor distinto de Solaino: al entregar el diseño y cerrar el reloj de diseño,
-- el proyecto pasa a la foto (status en_foto). No se finaliza solo.
-- El encargado o el admin lo cierran a mano, con foto o sin foto.

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'bodega_projects_status_check') then
    alter table public.bodega_projects drop constraint bodega_projects_status_check;
  end if;
end $$;

alter table public.bodega_projects
  add constraint bodega_projects_status_check
  check (
    status in (
      'pendiente',
      'en_diseno',
      'revision_diseno',
      'modificacion_diseno',
      'diseno_parcial',
      'diseno_aprobado',
      'en_programacion',
      'revision_programacion',
      'en_foto',
      'terminado'
    )
  );

create or replace function public.bodega_proveedor_es_externo(p_nombre text)
returns boolean
language sql
immutable
as $$
  select length(btrim(coalesce(p_nombre, ''))) > 0
    and strpos(
      translate(lower(btrim(p_nombre)), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun'),
      'solaino'
    ) = 0;
$$;

create or replace function public.bodega_try_finalize_external_provider_project(p_project_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_nombre text;
  v_finalized timestamptz;
  v_status text;
begin
  if public.my_role() not in ('admin', 'encargado', 'disenadora') then
    return false;
  end if;

  select p.project_finalized_at, p.status
  into v_finalized, v_status
  from public.bodega_projects p
  where p.id = p_project_id;

  if not found then
    return false;
  end if;

  if v_finalized is not null then
    update public.bodega_projects
    set status = 'terminado'
    where id = p_project_id
      and status is distinct from 'terminado';
    return false;
  end if;

  select i.proveedor
  into v_nombre
  from public.bodega_weekly_plan_items i
  where i.project_id = p_project_id
  order by i.updated_at desc nulls last
  limit 1;

  if not public.bodega_proveedor_es_externo(v_nombre) then
    return false;
  end if;

  if not exists (
    select 1
    from public.project_design_versions d
    where d.project_id = p_project_id
      and coalesce(d.package_category, 'entrega_diseno') = 'entrega_diseno'
  ) then
    return false;
  end if;

  if not exists (
    select 1
    from public.bodega_project_work_intervals w
    where w.project_id = p_project_id
      and w.lane = 'diseno'
      and w.ended_at is not null
  ) then
    return false;
  end if;

  if exists (
    select 1
    from public.bodega_project_work_intervals w
    where w.project_id = p_project_id
      and w.lane = 'diseno'
      and w.ended_at is null
  ) then
    return false;
  end if;

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
      jsonb_build_object(
        'proveedor_externo', true,
        'proveedor', btrim(v_nombre)
      )
    );
  end if;

  return true;
end;
$$;

grant execute on function public.bodega_proveedor_es_externo(text) to authenticated;
grant execute on function public.bodega_try_finalize_external_provider_project(uuid) to authenticated;

notify pgrst, 'reload schema';
