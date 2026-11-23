-- Si al reemplazar el .x_t queda una pieza sin destino, la diseñadora puede volver a asignarla.
-- Ejecutar en Supabase → SQL Editor → Run.

create or replace function public.bodega_reopen_programming_routes(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r text := public.my_role();
begin
  if r is null or r not in ('admin', 'encargado', 'disenadora', 'programadora_maquinaria') then
    raise exception 'Sin permiso para abrir los destinos';
  end if;

  if not exists (
    select 1
    from public.bodega_project_pieces bp
    where bp.project_id = p_project_id
      and (
        bp.programmer_bucket is null
        or bp.programmer_bucket not in ('cnc', 'torno', 'perfilado', 'accesorios')
      )
  ) then
    return;
  end if;

  update public.bodega_projects
  set programming_routes_confirmed_at = null
  where id = p_project_id
    and programming_routes_confirmed_at is not null;
end;
$$;

grant execute on function public.bodega_reopen_programming_routes(uuid) to authenticated;

notify pgrst, 'reload schema';
