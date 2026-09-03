-- Ejecuta esto en Supabase → SQL Editor para ver qué falta antes/después de los parches.
-- Cada fila: ok = true si existe; false = ejecuta el parche indicado en docs/SUPABASE_PASO_A_PASO.md

select 'bodega_weekly_plans' as objeto,
  exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'bodega_weekly_plans'
  ) as ok,
  'patch_bodega_weekly_plan.sql' as parche_si_falta
union all
select 'bodega_weekly_plan_items.prioridad_nivel',
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'bodega_weekly_plan_items' and column_name = 'prioridad_nivel'
  ),
  'patch_bodega_weekly_plan_prioridad.sql (o volver a ejecutar weekly_plan.sql)'
union all
select 'bodega_projects.prioridad_nivel',
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'bodega_projects' and column_name = 'prioridad_nivel'
  ),
  'patch_bodega_project_prioridad_nivel.sql'
union all
select 'project_design_versions.package_category',
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'project_design_versions' and column_name = 'package_category'
  ),
  'patch_design_version_package_category.sql'
union all
select 'project_piece_photos.piece_id',
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'project_piece_photos' and column_name = 'piece_id'
  ),
  'patch_bodega_piece_photos_piece_id.sql'
union all
select 'storage policy bodega_proyectos_update_bodega_rename_paths',
  exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'bodega_proyectos_update_bodega_rename_paths'
  ),
  'patch_bodega_cloud_rename_rls_storage.sql'
union all
select 'rpc bodega_weekly_plan_item_set_delay',
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'bodega_weekly_plan_item_set_delay'
  ),
  'patch_bodega_weekly_plan.sql'
order by 1;
