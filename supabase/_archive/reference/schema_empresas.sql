-- =============================================================================
-- EMPRESAS (clientes): catálogo simple
-- Ejecuta en Supabase → SQL Editor.
-- =============================================================================

create table if not exists public.empresas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  created_at timestamptz not null default now()
);

comment on table public.empresas is 'Catálogo de empresas (clientes).';

create unique index if not exists empresas_nombre_uidx on public.empresas (nombre);

