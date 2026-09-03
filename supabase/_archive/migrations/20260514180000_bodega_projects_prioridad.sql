-- Prioridad de proyecto (admin / supervisor): visible para diseño y programación.
alter table public.bodega_projects
  add column if not exists prioridad boolean not null default false;

comment on column public.bodega_projects.prioridad is
  'true = el admin o el supervisor marcó el proyecto como urgente; la app lo muestra primero y con etiqueta visible.';

create index if not exists bodega_projects_prioridad_idx
  on public.bodega_projects (prioridad desc)
  where prioridad = true;
