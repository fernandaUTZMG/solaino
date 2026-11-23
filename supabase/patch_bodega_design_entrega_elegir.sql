-- Elegir qué .x_t se revisa y se usa para separar piezas, o quitar uno subido por error.
-- Una corrección (REV02 del mismo ensamble) no deja viva la entrega anterior.
-- También el reloj del servidor, para que deje de responder 404.

create or replace function public.bodega_server_now()
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select now();
$$;

grant execute on function public.bodega_server_now() to authenticated, anon;

create or replace function public.bodega_xt_family_key(p_name text)
returns text
language sql
immutable
as $$
  select trim(both '_' from regexp_replace(
    lower(
      regexp_replace(
        regexp_replace(coalesce(p_name, ''), '\.(x_t|xt)$', '', 'i'),
        '[[:space:]._-]*rev(ision)?[[:space:]._-]*[0-9]+[[:space:]]*$',
        '',
        'i'
      )
    ),
    '[^a-z0-9]+',
    '_',
    'g'
  ));
$$;

create or replace function public.bodega_design_entrega_accion(
  p_version_id uuid,
  p_accion text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r text := public.my_role();
  v record;
  family text;
begin
  if r is null or r not in ('admin', 'encargado', 'disenadora') then
    raise exception 'Sin permiso para cambiar entregas de diseño';
  end if;

  if p_accion not in ('quitar', 'usar') then
    raise exception 'Acción no válida';
  end if;

  select dv.id, dv.project_id, dv.status, dv.version, dv.zip_filename, dv.package_category, dv.manifest
  into v
  from public.project_design_versions dv
  where dv.id = p_version_id
    and coalesce(dv.package_category, 'entrega_diseno') = 'entrega_diseno';

  if not found then
    raise exception 'Entrega de diseño no encontrada';
  end if;

  if p_accion = 'quitar' then
    update public.project_design_versions
    set status = 'subida',
        comentarios = 'Reemplazada: se quitó porque se subió por error'
    where id = p_version_id;
    return;
  end if;

  family := public.bodega_xt_family_key(v.zip_filename);

  update public.project_design_versions
  set status = 'subida',
      comentarios = 'Reemplazada: se usará otra revisión'
  where project_id = v.project_id
    and id <> p_version_id
    and coalesce(package_category, 'entrega_diseno') = 'entrega_diseno'
    and status in ('en_revision', 'aprobada', 'aprobada_parcial')
    and public.bodega_xt_family_key(zip_filename) = family;

  if v.status in ('subida', 'requiere_cambios') then
    update public.project_design_versions
    set status = 'en_revision',
        comentarios = null
    where id = p_version_id;

    update public.bodega_projects
    set status = 'revision_diseno'
    where id = v.project_id
      and status in ('modificacion_diseno', 'diseno_parcial', 'en_diseno', 'pendiente');
  end if;
end;
$$;

grant execute on function public.bodega_design_entrega_accion(uuid, text) to authenticated;

notify pgrst, 'reload schema';
