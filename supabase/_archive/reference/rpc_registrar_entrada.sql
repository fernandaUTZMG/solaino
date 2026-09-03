-- RPC atómica: registrar entrada (crear o sumar stock) y filas en `series` con cantidad por número de serie.
-- Requiere columna series.cantidad (ver alter_series_cantidad.sql).
-- p_series_lineas: [{"serie":"SN1","cantidad":5},...] — repeticiones del mismo número de serie se suman en una fila.
-- Compat: p_series (text[]) agrupa repeticiones (cada aparición = 1 pieza).

drop function if exists public.registrar_entrada(text, numeric, text[], jsonb);

create or replace function public.registrar_entrada(
  p_codigo text,
  p_cantidad numeric default null,
  p_series text[] default null,
  p_series_lineas jsonb default null,
  p_payload jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_producto public.productos%rowtype;
  v_exists boolean := false;
  v_delta numeric := 0;
  v_created boolean := false;
  v_tiene_serie boolean := false;
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_otro_codigo text;
begin
  if p_codigo is null or btrim(p_codigo) = '' then
    raise exception 'codigo requerido';
  end if;

  select * into v_producto
  from public.productos
  where codigo = btrim(p_codigo)
  limit 1;

  v_exists := found;

  if not v_exists then
    insert into public.productos (
      codigo,
      nombre,
      categoria_id,
      stock_actual,
      stock_minimo,
      unidad,
      ubicacion_area,
      ubicacion_detalle,
      costo_unitario,
      estado,
      tiene_serie
    )
    values (
      btrim(p_codigo),
      coalesce(nullif(btrim(v_payload->>'nombre'), ''), 'Producto sin nombre'),
      coalesce(nullif(btrim(v_payload->>'categoria_id'), ''), 'cat_componentes'),
      0,
      coalesce(nullif((v_payload->>'stock_minimo')::numeric, null), 0),
      coalesce(nullif(btrim(v_payload->>'unidad'), ''), 'piezas'),
      coalesce(nullif(btrim(v_payload->>'ubicacion_area'), ''), 'Almacén principal'),
      coalesce(nullif(btrim(v_payload->>'ubicacion_detalle'), ''), ''),
      coalesce(nullif((v_payload->>'costo_unitario')::numeric, null), 0),
      coalesce(nullif(btrim(v_payload->>'estado'), ''), 'Disponible'),
      coalesce((v_payload->>'tiene_serie')::boolean, false)
    )
    returning * into v_producto;

    v_created := true;
  end if;

  v_tiene_serie := coalesce(v_producto.tiene_serie, false);

  if v_tiene_serie then
    if p_series_lineas is not null
       and jsonb_typeof(p_series_lineas) = 'array'
       and jsonb_array_length(p_series_lineas) > 0
    then
      -- Total piezas = suma de cada línea JSON (antes de agrupar por número de serie).
      select coalesce(sum(
        greatest(1, floor(coalesce(nullif((elem->>'cantidad')::numeric, null), 1)))::numeric
      ), 0) into v_delta
      from jsonb_array_elements(p_series_lineas) elem
      where btrim(coalesce(elem->>'serie', '')) <> '';

      if v_delta <= 0 then
        raise exception 'series_lineas vacías o cantidades inválidas';
      end if;

      select min(p.codigo) into v_otro_codigo
      from public.series s
      join public.productos p on p.id = s.producto_id
      where s.producto_id <> v_producto.id
        and btrim(s.numero_serie) in (
          select distinct btrim(elem->>'serie')
          from jsonb_array_elements(p_series_lineas) elem
          where btrim(coalesce(elem->>'serie', '')) <> ''
        );

      if v_otro_codigo is not null then
        raise exception 'serie pertenece a otro producto: %', v_otro_codigo;
      end if;

      insert into public.series (producto_id, numero_serie, cantidad, estado)
      select v_producto.id, ns, c, 'Disponible'
      from (
        select
          ns,
          sum(c) as c
        from (
          select
            btrim(elem->>'serie') as ns,
            greatest(1, floor(coalesce(nullif((elem->>'cantidad')::numeric, null), 1)))::numeric as c
          from jsonb_array_elements(p_series_lineas) elem
          where btrim(coalesce(elem->>'serie', '')) <> ''
        ) lineas
        group by ns
      ) por_serie
      on conflict (numero_serie)
      do update set
        cantidad = public.series.cantidad + excluded.cantidad,
        estado = case when public.series.cantidad + excluded.cantidad > 0 then 'Disponible' else public.series.estado end
      where public.series.producto_id = excluded.producto_id;

    elsif p_series is not null and cardinality(p_series) > 0 then
      select count(*)::numeric into v_delta
      from unnest(p_series) s
      where btrim(s) <> '';

      if v_delta <= 0 then
        raise exception 'p_series vacío';
      end if;

      select min(p.codigo) into v_otro_codigo
      from public.series s
      join public.productos p on p.id = s.producto_id
      where s.producto_id <> v_producto.id
        and btrim(s.numero_serie) in (
          select distinct btrim(s2)
          from unnest(p_series) s2
          where btrim(s2) <> ''
        );

      if v_otro_codigo is not null then
        raise exception 'serie pertenece a otro producto: %', v_otro_codigo;
      end if;

      insert into public.series (producto_id, numero_serie, cantidad, estado)
      select v_producto.id, ns, c, 'Disponible'
      from (
        select btrim(s) as ns, count(*)::numeric as c
        from unnest(p_series) s
        where btrim(s) <> ''
        group by 1
      ) por_serie
      on conflict (numero_serie)
      do update set
        cantidad = public.series.cantidad + excluded.cantidad,
        estado = case when public.series.cantidad + excluded.cantidad > 0 then 'Disponible' else public.series.estado end
      where public.series.producto_id = excluded.producto_id;

    else
      raise exception 'indica números de serie con cantidad (p_series_lineas) o lista p_series';
    end if;

  else
    if p_cantidad is null or p_cantidad <= 0 then
      raise exception 'cantidad requerida (>0)';
    end if;
    v_delta := p_cantidad;
  end if;

  if v_delta <= 0 then
    raise exception 'delta inválido';
  end if;

  update public.productos
  set stock_actual = coalesce(stock_actual, 0) + v_delta,
      ultima_entrada = now()
  where id = v_producto.id
  returning * into v_producto;

  insert into public.movimientos (
    producto_id,
    tipo,
    motivo,
    cantidad,
    fecha,
    responsable,
    nota
  )
  values (
    v_producto.id,
    'Entrada',
    'Compra',
    v_delta,
    now(),
    coalesce(nullif(btrim(v_payload->>'responsable'), ''), 'Usuario'),
    case when v_created then 'entrada_inicial' else 'entrada' end
  );

  return jsonb_build_object(
    'producto_id', v_producto.id,
    'codigo', v_producto.codigo,
    'delta', v_delta,
    'created', v_created,
    'tiene_serie', v_tiene_serie
  );
exception
  when unique_violation then
    raise exception 'serie duplicada';
end;
$$;

grant execute on function public.registrar_entrada(text, numeric, text[], jsonb, jsonb) to authenticated;
