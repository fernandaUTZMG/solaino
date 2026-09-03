-- Misma lógica que migrations/20260511120000_design_version_package_category.sql
-- Ejecutar en Supabase SQL Editor si aún no aplicaste la migración (corrige 400 en filtros package_category).

alter table public.project_design_versions
  add column if not exists package_category text not null default 'entrega_diseno'
  constraint project_design_versions_package_category_check
  check (package_category in ('entrega_diseno', 'info_cliente'));

drop index if exists project_design_versions_project_version_uidx;

create unique index if not exists project_design_versions_project_cat_version_uidx
  on public.project_design_versions (project_id, package_category, version);

notify pgrst, 'reload schema';
