-- Programadora: mismo acceso que operador a relojes de Taller (perfilado en piso).
-- Ejecuta en Supabase → SQL Editor y recarga el esquema API si hace falta.

create or replace function public.bodega_piece_interval_start(
  p_piece_id uuid,
  p_lane text
)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  r text := public.my_role();
  v_id uuid;
begin
  if not public.is_bodega() then
    raise exception 'Solo cuentas de bodega';
  end if;

  if p_lane not in (
    'programacion_cnc',
    'programacion_torno',
    'perfilado_operador',
    'maquinado',
    'armado',
    'detallado'
  ) then
    raise exception 'lane inválida: %', p_lane;
  end if;

  if not exists (select 1 from public.bodega_project_pieces bp where bp.id = p_piece_id) then
    raise exception 'Pieza no encontrada';
  end if;

  if p_lane in ('programacion_cnc', 'programacion_torno') then
    if r not in ('admin', 'encargado', 'programadora_maquinaria') then
      raise exception 'Solo programadora o supervisor puede iniciar programación';
    end if;
  elsif p_lane = 'perfilado_operador' then
    if r not in ('admin', 'encargado', 'operador_bodega', 'programadora_maquinaria') then
      raise exception 'Solo operador, programadora o supervisor puede iniciar perfilado';
    end if;
  elsif p_lane = 'maquinado' then
    if r not in ('admin', 'encargado', 'programadora_maquinaria') then
      raise exception 'Solo programadora o supervisor puede registrar maquinado';
    end if;
  elsif p_lane in ('armado', 'detallado') then
    if r not in ('admin', 'encargado', 'operador_bodega', 'programadora_maquinaria', 'disenadora') then
      raise exception 'Rol no autorizado para armado/detallado';
    end if;
  end if;

  if exists (
    select 1
    from public.bodega_piece_work_intervals w
    where w.piece_id = p_piece_id
      and w.lane = p_lane
      and w.actor_id = auth.uid()
      and w.ended_at is null
  ) then
    return (
      select w.id
      from public.bodega_piece_work_intervals w
      where w.piece_id = p_piece_id
        and w.lane = p_lane
        and w.actor_id = auth.uid()
        and w.ended_at is null
      limit 1
    );
  end if;

  insert into public.bodega_piece_work_intervals (piece_id, actor_id, lane, started_at)
  values (p_piece_id, auth.uid(), p_lane, now())
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.bodega_piece_interval_start(uuid, text) to authenticated;

notify pgrst, 'reload schema';
