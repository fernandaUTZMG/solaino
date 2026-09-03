-- Embarque / salidas: una o varias líneas en una sola transacción.
-- Línea sin serie: { "codigo": "X", "cantidad": N }
-- Con serie, FIFO: { "codigo": "X", "cantidad": N } (consume cantidad por filas series.cantidad, orden created_at)
-- Con serie, explícita: { "codigo": "X", "series": ["s1","s2"] } (1 pieza por aparición) o
--   un solo número distinto + cantidad: { "codigo": "X", "series": ["SN1"], "cantidad": 5 }
-- Requiere series.cantidad (alter_series_cantidad.sql).

create or replace function public.registrar_embarque(
  p_lineas jsonb,
  p_payload jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_elem jsonb;
  v_i int;
  v_n int;
  v_codigo text;
  v_qty numeric;
  v_need_left int;
  v_producto public.productos%rowtype;
  v_tiene boolean;
  v_delta numeric;
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_motivo text := coalesce(nullif(btrim(v_payload->>'motivo'), ''), 'Embarque');
  v_resp text := coalesce(nullif(btrim(v_payload->>'responsable'), ''), 'Usuario');
  v_nota text := nullif(btrim(v_payload->>'nota'), '');
  v_sid uuid;
  v_sc numeric;
  v_newc numeric;
  v_take int;
  v_distinct_cnt int;
  v_one_ns text;
  v_need_explicit int;
  r record;
begin
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'lineas requeridas';
  end if;

  v_n := jsonb_array_length(p_lineas);
  for v_i in 0 .. v_n - 1 loop
    v_elem := p_lineas -> v_i;
    v_codigo := btrim(v_elem->>'codigo');
    if v_codigo = '' then
      raise exception 'codigo requerido en linea';
    end if;

    select * into v_producto
    from public.productos
    where codigo = v_codigo
    limit 1;

    if not found then
      raise exception 'producto no encontrado: %', v_codigo;
    end if;

    v_tiene := coalesce(v_producto.tiene_serie, false);
    v_delta := 0;

    if v_elem ? 'series'
       and jsonb_typeof(v_elem->'series') = 'array'
       and jsonb_array_length(v_elem->'series') > 0
    then
      if not v_tiene then
        raise exception 'producto % no maneja series', v_codigo;
      end if;

      select count(distinct btrim(x)) into v_distinct_cnt
      from jsonb_array_elements_text(v_elem->'series') as t(x);

      if v_distinct_cnt = 1
         and v_elem ? 'cantidad'
         and (v_elem->>'cantidad')::numeric is not null
         and (v_elem->>'cantidad')::numeric > 0
      then
        select btrim(x) into v_one_ns from jsonb_array_elements_text(v_elem->'series') as t(x) limit 1;
        v_need_explicit := floor((v_elem->>'cantidad')::numeric)::int;
        if v_need_explicit <= 0 then
          raise exception 'cantidad inválida para %', v_codigo;
        end if;

        select s.id, s.cantidad into v_sid, v_sc
        from public.series s
        where s.producto_id = v_producto.id
          and btrim(s.numero_serie) = v_one_ns
          and s.estado = 'Disponible'
          and s.cantidad > 0
        limit 1
        for update;

        if not found then
          raise exception 'serie no disponible o inexistente para %', v_codigo;
        end if;

        if v_sc < v_need_explicit then
          raise exception 'cantidad insuficiente en serie para %', v_codigo;
        end if;

        v_newc := v_sc - v_need_explicit;
        update public.series s
        set cantidad = v_newc,
            estado = case when v_newc <= 0 then 'Salida' else 'Disponible' end
        where s.id = v_sid;

        v_delta := v_need_explicit;

      else
        for r in
          select btrim(x) as ns, count(*)::int as need
          from jsonb_array_elements_text(v_elem->'series') t(x)
          group by btrim(x)
        loop
          select s.id, s.cantidad into v_sid, v_sc
          from public.series s
          where s.producto_id = v_producto.id
            and btrim(s.numero_serie) = r.ns
            and s.estado = 'Disponible'
            and s.cantidad > 0
          limit 1
          for update;

          if not found then
            raise exception 'serie no disponible o inexistente para %', v_codigo;
          end if;

          if v_sc < r.need then
            raise exception 'cantidad insuficiente en serie para %', v_codigo;
          end if;

          v_newc := v_sc - r.need;
          update public.series s
          set cantidad = v_newc,
              estado = case when v_newc <= 0 then 'Salida' else 'Disponible' end
          where s.id = v_sid;

          v_delta := v_delta + r.need;
        end loop;
      end if;

    elsif v_tiene then
      v_qty := (v_elem->>'cantidad')::numeric;
      if v_qty is null or v_qty <= 0 then
        raise exception 'cantidad requerida (>0) para %', v_codigo;
      end if;
      if v_qty <> floor(v_qty) then
        raise exception 'cantidad debe ser entera para productos con serie: %', v_codigo;
      end if;

      v_need_left := v_qty::int;
      v_delta := 0;

      while v_need_left > 0 loop
        select s.id, s.cantidad into v_sid, v_sc
        from public.series s
        where s.producto_id = v_producto.id
          and s.estado = 'Disponible'
          and s.cantidad > 0
        order by s.created_at asc
        limit 1
        for update;

        exit when not found;

        v_take := least(v_need_left, floor(v_sc)::int);
        if v_take <= 0 then
          exit;
        end if;

        v_newc := v_sc - v_take;
        update public.series s
        set cantidad = v_newc,
            estado = case when v_newc <= 0 then 'Salida' else 'Disponible' end
        where s.id = v_sid;

        v_need_left := v_need_left - v_take;
        v_delta := v_delta + v_take;
      end loop;

      if v_need_left > 0 then
        raise exception 'piezas con serie insuficientes para %', v_codigo;
      end if;

    else
      v_qty := (v_elem->>'cantidad')::numeric;
      if v_qty is null or v_qty <= 0 then
        raise exception 'cantidad requerida (>0) para %', v_codigo;
      end if;

      v_delta := v_qty;

      if coalesce(v_producto.stock_actual, 0) < v_delta then
        raise exception 'stock insuficiente para %', v_codigo;
      end if;
    end if;

    update public.productos
    set stock_actual = coalesce(stock_actual, 0) - v_delta,
        ultima_salida = now()
    where id = v_producto.id
      and coalesce(stock_actual, 0) >= v_delta;

    if not found then
      raise exception 'stock insuficiente para %', v_codigo;
    end if;

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
      'Salida',
      v_motivo,
      v_delta,
      now(),
      v_resp,
      coalesce(v_nota, 'embarque')
    );
  end loop;

  return jsonb_build_object(
    'ok', true,
    'lineas', jsonb_array_length(p_lineas)
  );
end;
$$;

grant execute on function public.registrar_embarque(jsonb, jsonb) to authenticated;
grant execute on function public.registrar_embarque(jsonb, jsonb) to anon;
