-- RPC: avance % manual (diseñadora, programadora, encargado, admin) sin cambiar estado.
-- Alineado con supabase/patch_bodega_avance_manual_rpc.sql y schema_bodega_versions.sql (mismo cuerpo).

create or replace function public.bodega_set_avance_manual(
  p_project_id uuid,
  p_avance_pct int,
  p_comment text default null
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  r text;
begin
  r := public.my_role();
  if r not in ('admin', 'encargado', 'disenadora', 'programadora_maquinaria') then
    raise exception 'Solo roles de bodega (diseñadora, programadora, encargado o admin) pueden registrar avance manual';
  end if;

  if p_avance_pct < 0 or p_avance_pct > 100 then
    raise exception 'El avance debe estar entre 0 y 100';
  end if;

  update public.bodega_projects
  set
    avance_pct = p_avance_pct,
    updated_at = now()
  where id = p_project_id;

  if not found then
    raise exception 'Proyecto no encontrado';
  end if;

  insert into public.project_activity(project_id, actor_id, type, payload)
  values (
    p_project_id,
    auth.uid(),
    'avance_manual',
    jsonb_build_object('avance_pct', p_avance_pct, 'comment', p_comment)
  );
end;
$$;

grant execute on function public.bodega_set_avance_manual(uuid, int, text) to authenticated;

notify pgrst, 'reload schema';
