-- =============================================================================
-- REQUISITORES (clientes): catálogo simple
-- Ejecuta en Supabase → SQL Editor.
-- =============================================================================

create table if not exists public.requisitores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  created_at timestamptz not null default now()
);

comment on table public.requisitores is 'Catálogo de requisitores (personas).';

-- Evita duplicados por nombre (normalizado a mayúsculas y trim en carga)
create unique index if not exists requisitores_nombre_uidx on public.requisitores (nombre);

