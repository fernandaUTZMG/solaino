-- Proveedor distinto de Solaino: el proyecto pasa a la foto (status en_foto)
-- en cuanto el encargado guarda ese nombre. No se finaliza solo.
-- El encargado o el admin lo cierran a mano, con foto o sin foto.
-- Vacío o Solaino no lo manda a la foto. Si estaba en foto solo por el proveedor
-- y todavía no hay entrega de diseño, vuelve a diseño.

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

create or replace function public.bodega_text_within_one_edit(a text, b text)
returns boolean
language plpgsql
immutable
as $$
declare
  i int := 1;
  j int := 1;
  edits int := 0;
  la int := length(a);
  lb int := length(b);
begin
  if a = b then
    return true;
  end if;
  if abs(la - lb) > 1 then
    return false;
  end if;
  while i <= la and j <= lb loop
    if substr(a, i, 1) = substr(b, j, 1) then
      i := i + 1;
      j := j + 1;
    else
      edits := edits + 1;
      if edits > 1 then
        return false;
      end if;
      if la > lb then
        i := i + 1;
      elsif lb > la then
        j := j + 1;
      else
        i := i + 1;
        j := j + 1;
      end if;
    end if;
  end loop;
  if i <= la or j <= lb then
    edits := edits + 1;
  end if;
  return edits <= 1;
end;
$$;

create or replace function public.bodega_proveedor_es_externo(p_nombre text)
returns boolean
language plpgsql
immutable
as $$
declare
  v text;
  token text;
begin
  v := translate(lower(btrim(coalesce(p_nombre, ''))), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun');
  if v = '' then
    return false;
  end if;
  if strpos(v, 'solaino') > 0 then
    return false;
  end if;
  foreach token in array regexp_split_to_array(v, '[^a-z0-9]+') loop
    if token <> '' and public.bodega_text_within_one_edit(token, 'solaino') then
      return false;
    end if;
  end loop;
  return true;
end;
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

  if public.bodega_proveedor_es_externo(v_nombre) then
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

      if auth.uid() is not null then
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
    end if;

    return true;
  end if;

  if v_status = 'en_foto'
    and not exists (
      select 1
      from public.project_design_versions d
      where d.project_id = p_project_id
        and coalesce(d.package_category, 'entrega_diseno') = 'entrega_diseno'
    )
  then
    update public.bodega_projects
    set status = 'en_diseno'
    where id = p_project_id
      and project_finalized_at is null
      and status = 'en_foto';
  end if;

  return false;
end;
$$;

-- Los que el encargado ya dejó con otro proveedor pasan a la foto ahora.
update public.bodega_project_work_intervals w
set ended_at = now()
from public.bodega_projects p
where w.project_id = p.id
  and w.lane = 'diseno'
  and w.ended_at is null
  and p.project_finalized_at is null
  and p.status is distinct from 'terminado'
  and public.bodega_proveedor_es_externo((
    select i.proveedor
    from public.bodega_weekly_plan_items i
    where i.project_id = p.id
    order by i.updated_at desc nulls last
    limit 1
  ));

update public.bodega_projects p
set status = 'en_foto'
where p.project_finalized_at is null
  and p.status is distinct from 'en_foto'
  and p.status is distinct from 'terminado'
  and public.bodega_proveedor_es_externo((
    select i.proveedor
    from public.bodega_weekly_plan_items i
    where i.project_id = p.id
    order by i.updated_at desc nulls last
    limit 1
  ));

-- «soliaino» es Solaino mal escrito. Ese proyecto sigue en diseño.
update public.bodega_projects
set status = 'en_diseno'
where folio = '30C167752-I2'
  and status = 'en_foto'
  and project_finalized_at is null
  and not public.bodega_proveedor_es_externo((
    select i.proveedor
    from public.bodega_weekly_plan_items i
    where i.project_id = bodega_projects.id
    order by i.updated_at desc nulls last
    limit 1
  ));

grant execute on function public.bodega_text_within_one_edit(text, text) to authenticated;
grant execute on function public.bodega_proveedor_es_externo(text) to authenticated;
grant execute on function public.bodega_try_finalize_external_provider_project(uuid) to authenticated;

notify pgrst, 'reload schema';
