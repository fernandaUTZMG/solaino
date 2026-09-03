-- Series por producto (para productos con número de serie)
-- Ejecuta en Supabase → SQL Editor.

-- 1) Bandera en productos
alter table public.productos
  add column if not exists tiene_serie boolean not null default false;

-- 2) Tabla series
create table if not exists public.series (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos(id) on delete cascade,
  numero_serie text not null,
  cantidad numeric not null default 1 check (cantidad >= 0),
  estado text not null default 'Disponible',
  created_at timestamptz not null default now()
);

-- Un número de serie no puede repetirse en otro producto (ver alter_series_numero_serie_globally_unique.sql en BD existentes).
create unique index if not exists series_numero_serie_glob_uidx
  on public.series (numero_serie);

-- Búsqueda por número de serie (coincidencia exacta / prefijo)
create index if not exists series_numero_serie_idx
  on public.series (numero_serie);

