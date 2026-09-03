-- =============================================================================
-- MAQUINADO: ejecutar TODO este archivo en Supabase → SQL Editor (una sola vez).
-- Corrige: 404 en rpc/bodega_complete_maquinado_piece y 400 al actualizar piezas.
-- Después: Settings → API → Reload schema (o NOTIFY abajo) y recarga la app.
-- =============================================================================

alter table public.bodega_project_pieces
  add column if not exists maquinado_completed_at timestamptz;

alter table public.bodega_project_pieces
  add column if not exists post_maquinado_route text;

alter table public.bodega_project_pieces
  drop constraint if exists bodega_project_pieces_post_maquinado_route_check;

alter table public.bodega_project_pieces
  add constraint bodega_project_pieces_post_maquinado_route_check check (
    post_maquinado_route is null or post_maquinado_route in ('armado', 'detallado')
  );

comment on column public.bodega_project_pieces.post_maquinado_route is
  'Destino al terminar maquinado: armado o detallado (salta armado).';

create or replace function public.bodega_complete_maquinado_piece(
  p_piece_id uuid,
  p_route text
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  r text := public.my_role();
  p public.bodega_project_pieces%rowtype;
begin
  if not public.is_bodega() then
    raise exception 'Solo cuentas de bodega';
  end if;

  if r not in ('admin', 'encargado', 'programadora_maquinaria') then
    raise exception 'Solo programadora o supervisor puede terminar maquinado';
  end if;

  if p_route not in ('armado', 'detallado') then
    raise exception 'Ruta inválida: %', p_route;
  end if;

  select * into p from public.bodega_project_pieces where id = p_piece_id;
  if not found then
    raise exception 'Pieza no encontrada';
  end if;

  if p.programmer_bucket not in ('cnc', 'torno') then
    raise exception 'Maquinado solo aplica a piezas CNC o Torno';
  end if;

  if p.programming_finished_at is null or p.programming_exit_kind is distinct from 'archivo_adjunto' then
    raise exception 'La pieza debe terminar programación (sin perfilado) antes de maquinado';
  end if;

  if p.maquinado_completed_at is not null then
    raise exception 'Maquinado ya terminado para esta pieza';
  end if;

  update public.bodega_piece_work_intervals
  set ended_at = now()
  where piece_id = p_piece_id
    and lane = 'maquinado'
    and ended_at is null;

  update public.bodega_project_pieces
  set
    maquinado_completed_at = now(),
    post_maquinado_route = p_route
  where id = p_piece_id;
end;
$$;

grant execute on function public.bodega_complete_maquinado_piece(uuid, text) to authenticated;

-- Cierra todos los relojes abiertos de un carril (p. ej. al terminar maquinado sin RPC).
create or replace function public.bodega_piece_interval_close_all(
  p_piece_id uuid,
  p_lane text
)
returns int
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  n int;
  r text := public.my_role();
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

  if p_lane = 'maquinado' and r not in ('admin', 'encargado', 'programadora_maquinaria') then
    raise exception 'Solo programadora o supervisor puede cerrar relojes de maquinado';
  elsif p_lane in ('armado', 'detallado', 'perfilado_operador')
    and r not in ('admin', 'encargado', 'operador_bodega', 'programadora_maquinaria', 'disenadora') then
    raise exception 'Rol no autorizado para cerrar este reloj';
  elsif p_lane in ('programacion_cnc', 'programacion_torno')
    and r not in ('admin', 'encargado', 'programadora_maquinaria') then
    raise exception 'Solo programadora o supervisor puede cerrar programación';
  end if;

  update public.bodega_piece_work_intervals
  set
    ended_at = now(),
    meta = coalesce(meta, '{}'::jsonb) || '{"closed_on_finish":true}'::jsonb
  where piece_id = p_piece_id
    and lane = p_lane
    and ended_at is null;

  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on function public.bodega_piece_interval_close_all(uuid, text) to authenticated;

-- Recarga el esquema de la API REST (PostgREST)
notify pgrst, 'reload schema';
