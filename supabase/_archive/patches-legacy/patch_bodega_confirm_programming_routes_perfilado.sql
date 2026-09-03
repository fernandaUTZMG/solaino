-- Confirmar asignación CNC / Torno / Perfilado (piezas Perfilado van directo a maquinado).

create or replace function public.bodega_confirm_programming_routes(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r text := public.my_role();
begin
  if r is null or r not in ('admin', 'encargado', 'programadora_maquinaria') then
    raise exception 'Sin permiso para confirmar la asignación de programación';
  end if;

  if not exists (
    select 1
    from public.bodega_project_pieces bp
    where bp.project_id = p_project_id
      and bp.programmer_bucket in ('cnc', 'torno', 'perfilado')
  ) then
    raise exception 'Asigna al menos una pieza a CNC, Torno o Perfilado antes de confirmar';
  end if;

  update public.bodega_projects
  set programming_routes_confirmed_at = coalesce(programming_routes_confirmed_at, now())
  where id = p_project_id;

  if not found then
    raise exception 'Proyecto no encontrado';
  end if;
end;
$$;

comment on function public.bodega_confirm_programming_routes(uuid) is
  'Marca programming_routes_confirmed_at tras asignar piezas a CNC, Torno o Perfilado.';
