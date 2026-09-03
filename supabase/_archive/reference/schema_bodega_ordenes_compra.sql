-- Órdenes de compra (Bodega): PDF + vínculo a empresa/requisitor y N proyectos
-- Ejecuta en Supabase → SQL Editor después de empresas/requisitores y schema_bodega.sql

create table if not exists public.bodega_ordenes_compra (
  id uuid primary key default gen_random_uuid(),
  numero text not null,
  archivo_storage_path text not null,
  archivo_nombre text not null,
  empresa_id uuid references public.empresas(id) on delete set null,
  requisitor_id uuid references public.requisitores(id) on delete set null,
  fecha date not null default current_date,
  notas text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.bodega_ordenes_compra is 'Orden de compra con PDF en Storage; varios proyectos pueden apuntar aquí.';

create unique index if not exists bodega_ordenes_compra_numero_uidx
  on public.bodega_ordenes_compra (numero);

create index if not exists bodega_ordenes_compra_fecha_idx
  on public.bodega_ordenes_compra (fecha desc);

-- Vincular proyectos a una OC (una OC → muchos proyectos / cotizaciones)
alter table public.bodega_projects
  add column if not exists orden_compra_id uuid references public.bodega_ordenes_compra(id) on delete set null;

create index if not exists bodega_projects_orden_compra_idx
  on public.bodega_projects (orden_compra_id);

create or replace function public.bodega_ordenes_compra_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists bodega_ordenes_compra_set_updated_at on public.bodega_ordenes_compra;
create trigger bodega_ordenes_compra_set_updated_at
  before update on public.bodega_ordenes_compra
  for each row
  execute function public.bodega_ordenes_compra_touch_updated_at();

-- Partidas leídas del PDF (cotización); ver también alter_bodega_ordenes_cotizacion_lineas.sql en BD existentes
alter table public.bodega_ordenes_compra
  add column if not exists cotizacion_lineas text[] not null default '{}';

comment on column public.bodega_ordenes_compra.cotizacion_lineas is
  'Descripciones de línea de la cotización (PDF); ref. proyectos creados en la app.';
