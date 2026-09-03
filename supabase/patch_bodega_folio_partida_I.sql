-- Folios de proyectos por partida de OC: usar sufijo -I1, -I2… (antes -P1, -P2…).
-- Ejemplo: J20I65165-I3 en lugar de J20I65165-P3.
-- Ejecuta en Supabase → SQL Editor. Luego: NOTIFY pgrst, 'reload schema'; (incluido al final).

create or replace function public.bodega_bulk_create_projects_from_oc(p_orden_compra_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  oc record;
  lines text[];
  i int;
  n int;
  created int := 0;
  skipped int := 0;
  v_folio text;
  cliente_n text;
  empresa_n text;
  line text;
begin
  if not public.is_bodega() then
    raise exception 'Solo cuentas con rol de bodega pueden crear proyectos desde partidas del PDF';
  end if;

  select
    o.id,
    o.numero,
    o.cotizacion_lineas,
    coalesce(nullif(trim(rq.nombre), ''), 'Cliente') as requisitor_nombre,
    e.nombre as empresa_nombre
  into oc
  from public.bodega_ordenes_compra o
  left join public.requisitores rq on rq.id = o.requisitor_id
  left join public.empresas e on e.id = o.empresa_id
  where o.id = p_orden_compra_id;

  if not found then
    raise exception 'Orden de compra no encontrada';
  end if;

  lines := coalesce(oc.cotizacion_lineas, '{}');
  n := coalesce(array_length(lines, 1), 0);
  if n = 0 then
    raise exception 'La OC no tiene partidas en cotizacion_lineas (sube de nuevo el PDF o revisa extracción)';
  end if;

  cliente_n := oc.requisitor_nombre;
  empresa_n := oc.empresa_nombre;

  for i in 1..n loop
    line := trim(coalesce(lines[i], ''));
    if line = '' then
      skipped := skipped + 1;
      continue;
    end if;

    if exists (
      select 1
      from public.bodega_projects p
      where p.orden_compra_id = p_orden_compra_id
        and p.cotizacion_linea_idx = i
    ) then
      skipped := skipped + 1;
      continue;
    end if;

    v_folio := upper(regexp_replace(oc.numero, '[^A-Za-z0-9]+', '-', 'g')) || '-I' || i::text;
    while exists (select 1 from public.bodega_projects bp where bp.folio = v_folio) loop
      v_folio := v_folio || '-' || substr(md5(random()::text), 1, 4);
    end loop;

    insert into public.bodega_projects (
      folio,
      orden,
      orden_compra_id,
      cliente,
      empresa,
      nombre,
      status,
      cotizacion_linea_idx
    ) values (
      v_folio,
      oc.numero,
      p_orden_compra_id,
      cliente_n,
      empresa_n,
      line,
      'en_diseno',
      i
    );

    created := created + 1;
  end loop;

  return jsonb_build_object('created', created, 'skipped', skipped, 'lines', n);
end;
$$;

grant execute on function public.bodega_bulk_create_projects_from_oc(uuid) to authenticated;

notify pgrst, 'reload schema';
