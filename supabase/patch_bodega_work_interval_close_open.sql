-- Cierra intervalos abiertos de un carril (reloj de proyecto).
-- La función vieja usa el parámetro "p_end"; CREATE OR REPLACE no puede renombrarlo.
-- Ejecutar en Supabase → SQL Editor.

drop function if exists public.bodega_work_interval_close_open(uuid, text, timestamptz, jsonb);
drop function if exists public.bodega_work_interval_close_open(uuid, text, timestamptz);
drop function if exists public.bodega_work_interval_close_open(uuid, text);

-- Firma completa (p_end = nombre histórico en BD)
create or replace function public.bodega_work_interval_close_open(
  p_project_id uuid,
  p_lane text,
  p_end timestamptz default now(),
  p_meta jsonb default null
)
returns int
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  n int := 0;
begin
  if p_project_id is null or coalesce(trim(p_lane), '') = '' then
    return 0;
  end if;

  update public.bodega_project_work_intervals
  set
    ended_at = coalesce(p_end, now()),
    meta = case
      when p_meta is null then meta
      else coalesce(meta, '{}'::jsonb) || p_meta
    end
  where project_id = p_project_id
    and lane = p_lane
    and ended_at is null;

  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on function public.bodega_work_interval_close_open(uuid, text, timestamptz, jsonb) to authenticated;

-- Compatibilidad: solo project + lane
create or replace function public.bodega_work_interval_close_open(
  p_project_id uuid,
  p_lane text
)
returns int
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  return public.bodega_work_interval_close_open(p_project_id, p_lane, now(), null);
end;
$$;

grant execute on function public.bodega_work_interval_close_open(uuid, text) to authenticated;

notify pgrst, 'reload schema';
