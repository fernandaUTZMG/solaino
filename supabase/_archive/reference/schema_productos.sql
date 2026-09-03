-- Tabla public.productos — inventario Solaino
-- Ejecuta esto en Supabase: SQL Editor → New query → Run.
--
-- Mapeo con tu Excel:
--   codigo            → código / id de renglón del inventario
--   nombre            → nombre del material (la app ya usa el campo "nombre")
--   medida            → medida (texto libre: m, kg, rollo, etc.)
--   cantidad_por_pza  → cantidad por pieza (numérico; si no aplica, NULL)
--   descripcion       → descripción
--   codigo_producto   → código de producto (distinto del código de renglón)
--
-- La app (productosRepo.ts) también usa stock, ubicación, categoría, etc.
-- Si tu tabla solo tenía id/codigo/nombre/descripcion, los ALTER siguientes
-- completan el resto sin borrar datos.

-- 1) Tabla nueva (si aún no existe)
create table if not exists public.productos (
  id uuid primary key default gen_random_uuid(),

  codigo text not null,
  nombre text not null,
  descripcion text,
  medida text,
  cantidad_por_pza numeric,
  codigo_producto text,

  categoria_id text not null default 'cat_componentes',
  stock_actual numeric not null default 0,
  stock_minimo numeric not null default 0,
  stock_maximo numeric,
  unidad text not null default 'piezas',
  ubicacion_area text not null default 'Almacén principal',
  ubicacion_detalle text not null default '',
  costo_unitario numeric not null default 0,
  proveedor_id text,
  part_number text,
  fabricante text,
  especificaciones jsonb,
  lote text,
  fecha_caducidad date,
  estado text not null default 'Disponible',
  imagen_url text,
  datasheet_url text,
  ultima_entrada timestamptz,
  ultima_salida timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.productos is 'Inventario; columnas Excel: codigo, nombre (material), medida, cantidad_por_pza, descripcion, codigo_producto.';

-- 2) Si la tabla ya existía (ejemplo mínimo), agrega columnas que falten
alter table public.productos add column if not exists medida text;
alter table public.productos add column if not exists cantidad_por_pza numeric;
alter table public.productos add column if not exists codigo_producto text;

alter table public.productos add column if not exists categoria_id text;
alter table public.productos add column if not exists stock_actual numeric;
alter table public.productos add column if not exists stock_minimo numeric;
alter table public.productos add column if not exists stock_maximo numeric;
alter table public.productos add column if not exists unidad text;
alter table public.productos add column if not exists ubicacion_area text;
alter table public.productos add column if not exists ubicacion_detalle text;
alter table public.productos add column if not exists costo_unitario numeric;
alter table public.productos add column if not exists proveedor_id text;
alter table public.productos add column if not exists part_number text;
alter table public.productos add column if not exists fabricante text;
alter table public.productos add column if not exists especificaciones jsonb;
alter table public.productos add column if not exists lote text;
alter table public.productos add column if not exists fecha_caducidad date;
alter table public.productos add column if not exists estado text;
alter table public.productos add column if not exists imagen_url text;
alter table public.productos add column if not exists datasheet_url text;
alter table public.productos add column if not exists ultima_entrada timestamptz;
alter table public.productos add column if not exists ultima_salida timestamptz;
alter table public.productos add column if not exists created_at timestamptz;
alter table public.productos add column if not exists updated_at timestamptz;

-- 3) Rellenar NOT NULL / defaults en filas antiguas (solo donde queden NULL)
update public.productos
set
  categoria_id = coalesce(nullif(trim(categoria_id), ''), 'cat_componentes'),
  stock_actual = coalesce(stock_actual, 0),
  stock_minimo = coalesce(stock_minimo, 0),
  unidad = coalesce(nullif(trim(unidad), ''), 'piezas'),
  ubicacion_area = coalesce(nullif(trim(ubicacion_area), ''), 'Almacén principal'),
  ubicacion_detalle = coalesce(ubicacion_detalle, ''),
  costo_unitario = coalesce(costo_unitario, 0),
  estado = coalesce(nullif(trim(estado), ''), 'Disponible'),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now())
where true;

alter table public.productos alter column categoria_id set default 'cat_componentes';
alter table public.productos alter column stock_actual set default 0;
alter table public.productos alter column stock_minimo set default 0;
alter table public.productos alter column unidad set default 'piezas';
alter table public.productos alter column ubicacion_area set default 'Almacén principal';
alter table public.productos alter column ubicacion_detalle set default '';
alter table public.productos alter column costo_unitario set default 0;
alter table public.productos alter column estado set default 'Disponible';

-- 4) updated_at automático al hacer UPDATE
create or replace function public.productos_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists productos_set_updated_at on public.productos;
create trigger productos_set_updated_at
  before update on public.productos
  for each row
  execute function public.productos_touch_updated_at();

-- 5) Índices útiles para búsqueda e importación
create index if not exists productos_codigo_idx on public.productos (codigo);
create index if not exists productos_codigo_producto_idx on public.productos (codigo_producto);

-- NOTA: La app espera que productos.id sea UUID. Si tu tabla de ejemplo usaba
-- id SERIAL/BIGSERIAL, hay que migrar filas a una tabla nueva o recrear;
-- este script no convierte tipos de id automáticamente.
