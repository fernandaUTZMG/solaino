-- Categoría de ZIP en project_design_versions: entrega de diseño vs material de referencia (supervisor → diseñadora).
-- Tras aplicar: NOTIFY pgrst o Dashboard → API → Reload schema.

alter table public.project_design_versions
  add column if not exists package_category text not null default 'entrega_diseno'
  constraint project_design_versions_package_category_check
  check (package_category in ('entrega_diseno', 'info_cliente'));

drop index if exists project_design_versions_project_version_uidx;

create unique index if not exists project_design_versions_project_cat_version_uidx
  on public.project_design_versions (project_id, package_category, version);

notify pgrst, 'reload schema';
