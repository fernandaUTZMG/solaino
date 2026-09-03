-- Un número de serie solo puede existir en UN producto (evita el mismo serial en dos códigos distintos).
-- Ejecutar en Supabase → SQL Editor DESPUÉS de schema_series / alter_series_cantidad.
--
-- Si falla el paso 2: hay el mismo número de serie en más de un producto. Revisa y deja cada serial en un solo producto
-- (borra filas en `series` o reasigna) y vuelve a ejecutar este script.

-- 1) Normalizar espacios
update public.series
set numero_serie = btrim(numero_serie)
where numero_serie is distinct from btrim(numero_serie);

-- 2) Abortar si aún hay conflicto entre productos
do $$
declare
  v_conflictos int;
begin
  select count(*)::int into v_conflictos
  from (
    select 1
    from public.series
    group by btrim(numero_serie)
    having count(distinct producto_id) > 1
  ) x;

  if v_conflictos > 0 then
    raise exception
      'Hay % número(s) de serie asignados a más de un producto. Corrige la tabla public.series antes de continuar (deja cada serial en un solo producto).',
      v_conflictos;
  end if;
end $$;

-- 3) Índice único por producto+serie ya no aplica; índice único global
drop index if exists public.series_producto_numero_uidx;

create unique index if not exists series_numero_serie_glob_uidx
  on public.series (numero_serie);

comment on index public.series_numero_serie_glob_uidx is 'Un número de serie pertenece a un solo producto en todo el inventario.';
