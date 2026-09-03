-- Reinicia piezas y asignación de programación de UN proyecto (por folio).
-- No borra ZIPs de diseño ni carpetas confirmadas por el encargado.
--
-- 1) Cambia el folio abajo si aplica.
-- 2) Ejecuta en SQL Editor de Supabase.
-- 3) Recarga la app (F5).

do $$
declare
  v_folio text := 'C-10003619604-I3';  -- ← tu proyecto
  v_project_id uuid;
  v_deleted int;
begin
  select id into v_project_id
  from public.bodega_projects
  where folio = v_folio;

  if v_project_id is null then
    raise exception 'Proyecto no encontrado con folio %', v_folio;
  end if;

  -- Intervalos por pieza (por si no hay CASCADE en tu BD)
  delete from public.bodega_piece_work_intervals
  where piece_id in (
    select id from public.bodega_project_pieces where project_id = v_project_id
  );

  delete from public.bodega_project_pieces
  where project_id = v_project_id;

  get diagnostics v_deleted = row_count;

  update public.bodega_projects
  set programming_routes_confirmed_at = null
  where id = v_project_id;

  -- Entregas ZIP de programación (opcional: quita el comentario si quieres conservar historial)
  delete from public.project_machine_versions
  where project_id = v_project_id
    and cnc_module = 'programacion';

  raise notice 'Proyecto % (id %): eliminadas % pieza(s). Asignación CNC reiniciada.',
    v_folio, v_project_id, v_deleted;
end $$;

-- Comprobar:
select
  p.folio,
  (select count(*) from public.bodega_project_pieces bp where bp.project_id = p.id) as piezas,
  p.programming_routes_confirmed_at,
  p.status
from public.bodega_projects p
where p.folio = 'C-10003619604-I3';
