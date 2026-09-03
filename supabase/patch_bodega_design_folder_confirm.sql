-- Confirmación de carpetas por encargado (sin crear piezas) + flujo de entrega de programación.
-- Ejecutar en SQL Editor de Supabase y recargar esquema API.

create table if not exists public.design_confirmed_folders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.bodega_projects(id) on delete cascade,
  design_version_id uuid not null references public.project_design_versions(id) on delete cascade,
  folder_key text not null,
  confirmed_at timestamptz not null default now(),
  confirmed_by uuid references auth.users(id),
  unique (design_version_id, folder_key)
);

create index if not exists design_confirmed_folders_project_idx
  on public.design_confirmed_folders (project_id, design_version_id);

alter table public.design_confirmed_folders enable row level security;

drop policy if exists design_confirmed_folders_select on public.design_confirmed_folders;
create policy design_confirmed_folders_select on public.design_confirmed_folders
  for select to authenticated using (true);

drop policy if exists design_confirmed_folders_insert on public.design_confirmed_folders;
create policy design_confirmed_folders_insert on public.design_confirmed_folders
  for insert to authenticated
  with check (public.my_role() in ('admin', 'encargado'));

comment on table public.design_confirmed_folders is
  'Carpetas del ZIP de diseño confirmadas por encargado; no crea piezas de producción.';

create or replace function public.bodega_confirm_design_folders(
  p_design_version_id uuid,
  p_folder_keys text[],
  p_comment text default null,
  p_reject boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r text := public.my_role();
  v record;
  fk text;
  folder_count int := 0;
begin
  if r is null or r not in ('admin', 'encargado') then
    raise exception 'Sin permiso para confirmar carpetas de diseño';
  end if;

  select dv.id, dv.project_id, dv.status, dv.version, p.status as project_status
  into v
  from public.project_design_versions dv
  join public.bodega_projects p on p.id = dv.project_id
  where dv.id = p_design_version_id
    and dv.package_category = 'entrega_diseno';

  if not found then
    raise exception 'Versión de diseño no encontrada';
  end if;

  if p_reject then
    if coalesce(trim(p_comment), '') = '' then
      raise exception 'Indica el motivo del rechazo';
    end if;

    update public.project_design_versions
    set status = 'requiere_cambios',
        comentarios = coalesce(trim(p_comment), comentarios)
    where id = p_design_version_id;

    update public.bodega_projects
    set status = 'modificacion_diseno'
    where id = v.project_id;

    perform public.bodega_work_interval_open_design(v.project_id);

    insert into public.project_activity (project_id, actor_id, type, payload)
    values (
      v.project_id,
      auth.uid(),
      'design_version_rejected',
      jsonb_build_object(
        'design_version_id', p_design_version_id,
        'version', v.version,
        'comment', trim(p_comment)
      )
    );

    return jsonb_build_object(
      'version_status', 'requiere_cambios',
      'project_status', 'modificacion_diseno',
      'confirmed_count', 0
    );
  end if;

  if p_folder_keys is null or array_length(p_folder_keys, 1) is null then
    raise exception 'Selecciona al menos una carpeta';
  end if;

  foreach fk in array p_folder_keys loop
    if coalesce(trim(fk), '') = '' then
      continue;
    end if;
    insert into public.design_confirmed_folders (
      project_id, design_version_id, folder_key, confirmed_by
    ) values (
      v.project_id, p_design_version_id, trim(fk), auth.uid()
    )
    on conflict (design_version_id, folder_key) do update
      set confirmed_at = now(), confirmed_by = auth.uid();
    folder_count := folder_count + 1;
  end loop;

  if folder_count = 0 then
    raise exception 'Ninguna carpeta válida para confirmar';
  end if;

  if v.status = 'en_revision' then
    update public.project_design_versions
    set status = 'aprobada',
        comentarios = case when trim(coalesce(p_comment, '')) <> '' then trim(p_comment) else comentarios end
    where id = p_design_version_id;
  elsif trim(coalesce(p_comment, '')) <> '' then
    update public.project_design_versions
    set comentarios = trim(p_comment)
    where id = p_design_version_id;
  end if;

  update public.bodega_projects
  set status = case
    when status in ('revision_diseno', 'modificacion_diseno', 'diseno_parcial') then 'diseno_aprobado'
    else status
  end
  where id = v.project_id;

  insert into public.project_activity (project_id, actor_id, type, payload)
  values (
    v.project_id,
    auth.uid(),
    'design_folders_confirmed',
    jsonb_build_object(
      'design_version_id', p_design_version_id,
      'version', v.version,
      'folder_keys', p_folder_keys,
      'confirmed_count', folder_count
    )
  );

  return jsonb_build_object(
    'version_status', 'aprobada',
    'project_status', 'diseno_aprobado',
    'confirmed_count', folder_count
  );
end;
$$;

grant execute on function public.bodega_confirm_design_folders(uuid, text[], text, boolean) to authenticated;

create or replace function public.bodega_close_programming_delivery_clock(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.bodega_work_interval_close_open(p_project_id, 'cnc_programacion', now());
end;
$$;

grant execute on function public.bodega_close_programming_delivery_clock(uuid) to authenticated;
