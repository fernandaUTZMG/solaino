-- Plan de trabajo semanal (bodega): filas priorizadas por semana, metas y motivos de atraso.
-- Ejecutar en SQL Editor → Settings → API → Reload schema.

create table if not exists public.bodega_weekly_plans (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bodega_weekly_plans_week_start_unique unique (week_start)
);

comment on table public.bodega_weekly_plans is
  'Encabezado del plan semanal; week_start debe ser lunes (fecha local de planta).';

create table if not exists public.bodega_weekly_plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.bodega_weekly_plans (id) on delete cascade,
  project_id uuid references public.bodega_projects (id) on delete set null,
  sort_order integer not null default 0,
  prioridad_nivel smallint not null default 0,
  cliente text not null default '',
  requisitor text not null default '',
  po_numero text not null default '',
  po_fecha date,
  proyecto_nombre text not null default '',
  plan_diseno_pct smallint not null default 0,
  plan_programacion_pct smallint not null default 0,
  plan_maquinado_pct smallint not null default 0,
  plan_armado_pct smallint not null default 0,
  fecha_entrega date,
  status_label text not null default '',
  factura text not null default '',
  delay_reason text not null default '',
  week_notes text not null default '',
  notes_lun text not null default '',
  notes_mar text not null default '',
  notes_mie text not null default '',
  notes_jue text not null default '',
  notes_vie text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bodega_weekly_plan_items_plan_diseno_pct check (plan_diseno_pct between 0 and 100),
  constraint bodega_weekly_plan_items_plan_programacion_pct check (plan_programacion_pct between 0 and 100),
  constraint bodega_weekly_plan_items_plan_maquinado_pct check (plan_maquinado_pct between 0 and 100),
  constraint bodega_weekly_plan_items_plan_armado_pct check (plan_armado_pct between 0 and 100),
  constraint bodega_weekly_plan_items_prioridad_nivel_check check (prioridad_nivel >= 0 and prioridad_nivel <= 4)
);

comment on column public.bodega_weekly_plan_items.prioridad_nivel is
  'Copia de bodega_projects.prioridad_nivel al sincronizar; define el orden del plan (4=urgente primero).';

create unique index if not exists bodega_weekly_plan_items_plan_project_uidx
  on public.bodega_weekly_plan_items (plan_id, project_id)
  where project_id is not null;

create index if not exists bodega_weekly_plan_items_plan_sort_idx
  on public.bodega_weekly_plan_items (plan_id, sort_order asc);

comment on table public.bodega_weekly_plan_items is
  'Fila del plan semanal; puede ligarse a bodega_projects o ser manual (project_id null).';

-- Si la tabla ya existía sin prioridad_nivel, agregarla (create table if not exists no altera tablas viejas).
alter table public.bodega_weekly_plan_items
  add column if not exists prioridad_nivel smallint not null default 0;

alter table public.bodega_weekly_plan_items
  drop constraint if exists bodega_weekly_plan_items_prioridad_nivel_check;

alter table public.bodega_weekly_plan_items
  add constraint bodega_weekly_plan_items_prioridad_nivel_check
  check (prioridad_nivel >= 0 and prioridad_nivel <= 4);

alter table public.bodega_weekly_plans enable row level security;
alter table public.bodega_weekly_plan_items enable row level security;

drop policy if exists bodega_weekly_plans_select on public.bodega_weekly_plans;
drop policy if exists bodega_weekly_plans_write on public.bodega_weekly_plans;
drop policy if exists bodega_weekly_plan_items_select on public.bodega_weekly_plan_items;
drop policy if exists bodega_weekly_plan_items_write on public.bodega_weekly_plan_items;

create policy bodega_weekly_plans_select on public.bodega_weekly_plans
  for select using (
    public.my_role() in ('admin', 'encargado', 'disenadora', 'programadora_maquinaria', 'operador_bodega')
  );

create policy bodega_weekly_plans_write on public.bodega_weekly_plans
  for all using (public.my_role() in ('admin', 'encargado'))
  with check (public.my_role() in ('admin', 'encargado'));

create policy bodega_weekly_plan_items_select on public.bodega_weekly_plan_items
  for select using (
    public.my_role() in ('admin', 'encargado', 'disenadora', 'programadora_maquinaria', 'operador_bodega')
  );

create policy bodega_weekly_plan_items_write on public.bodega_weekly_plan_items
  for all using (public.my_role() in ('admin', 'encargado'))
  with check (public.my_role() in ('admin', 'encargado'));

create or replace function public.bodega_weekly_plan_item_set_delay(
  p_item_id uuid,
  p_delay_reason text,
  p_week_notes text default ''
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if public.my_role() not in ('admin', 'encargado', 'disenadora', 'programadora_maquinaria', 'operador_bodega') then
    raise exception 'Sin permiso para registrar atraso en el plan';
  end if;

  update public.bodega_weekly_plan_items
  set
    delay_reason = coalesce(trim(p_delay_reason), ''),
    week_notes = coalesce(trim(p_week_notes), ''),
    updated_at = now()
  where id = p_item_id;

  if not found then
    raise exception 'Fila del plan no encontrada';
  end if;
end;
$$;

grant execute on function public.bodega_weekly_plan_item_set_delay(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
