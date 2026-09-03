-- Prioridad por proyecto con niveles (0–4). Orden global entre distintas órdenes de compra.
-- Ejecutar en SQL Editor → Settings → API → Reload schema.

alter table public.bodega_projects
  add column if not exists prioridad_nivel smallint not null default 0;

alter table public.bodega_projects
  drop constraint if exists bodega_projects_prioridad_nivel_check;

alter table public.bodega_projects
  add constraint bodega_projects_prioridad_nivel_check
  check (prioridad_nivel >= 0 and prioridad_nivel <= 4);

comment on column public.bodega_projects.prioridad_nivel is
  '0=normal, 1=baja, 2=media, 3=alta, 4=urgente. Comparación global entre proyectos de cualquier OC.';

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'bodega_projects'
      and column_name = 'prioridad'
      and udt_name = 'bool'
  ) then
    update public.bodega_projects
    set prioridad_nivel = 3
    where prioridad = true
      and coalesce(prioridad_nivel, 0) = 0;
  end if;
end $$;

drop index if exists public.bodega_projects_prioridad_idx;

create index if not exists bodega_projects_prioridad_nivel_idx
  on public.bodega_projects (prioridad_nivel desc, updated_at desc)
  where prioridad_nivel > 0;

notify pgrst, 'reload schema';
