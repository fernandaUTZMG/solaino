-- Plan de trabajo: empresa proveedora que está desarrollando el proyecto.
-- Ejecutar en SQL Editor → Settings → API → Reload schema.

alter table public.bodega_weekly_plan_items
  add column if not exists proveedor text not null default '';

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'bodega_weekly_plan_items'
      and column_name = 'taller'
  ) then
    update public.bodega_weekly_plan_items
      set proveedor = taller
      where coalesce(proveedor, '') = ''
        and coalesce(taller, '') <> '';
    alter table public.bodega_weekly_plan_items drop column taller;
  end if;
end $$;

comment on column public.bodega_weekly_plan_items.proveedor is
  'Empresa proveedora que desarrolla el proyecto. Lo escribe el encargado o el admin.';

notify pgrst, 'reload schema';
