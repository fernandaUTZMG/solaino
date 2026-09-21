-- Permite a diseñadora (y encargado/admin/programadora) confirmar destinos.
-- Antes solo admin/encargado/programadora → 400 al confirmar desde Diseño.
-- Ejecutar en Supabase → SQL Editor → Run.

create or replace function public.bodega_confirm_programming_routes(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r text := public.my_role();
begin
  if r is null or r not in ('admin', 'encargado', 'disenadora', 'programadora_maquinaria') then
    raise exception 'Sin permiso para confirmar los destinos de las piezas';
  end if;

  if not exists (
    select 1
    from public.bodega_project_pieces bp
    where bp.project_id = p_project_id
      and bp.programmer_bucket in ('cnc', 'torno', 'perfilado', 'accesorios')
  ) then
    raise exception 'Asigna destino a al menos una pieza (CNC, torno, perfiladora o accesorio) antes de confirmar';
  end if;

  update public.bodega_projects
  set programming_routes_confirmed_at = coalesce(programming_routes_confirmed_at, now())
  where id = p_project_id;

  if not found then
    raise exception 'Proyecto no encontrado';
  end if;
end;
$$;

grant execute on function public.bodega_confirm_programming_routes(uuid) to authenticated;

notify pgrst, 'reload schema';
