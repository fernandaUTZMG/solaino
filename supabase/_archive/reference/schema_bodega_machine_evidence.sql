-- =============================================================================
-- BODEGA: Programación (ZIP) + fotos piezas + vínculo partida PDF → proyecto
-- Ejecuta en SQL Editor DESPUÉS de `schema_bodega_versions.sql`.
-- =============================================================================

-- 1) Índice de partida en el PDF (1 = primera línea de cotizacion_lineas[])
alter table public.bodega_projects
  add column if not exists cotizacion_linea_idx int;

comment on column public.bodega_projects.cotizacion_linea_idx is
  'Si el proyecto viene de una línea del PDF: índice 1-based en bodega_ordenes_compra.cotizacion_lineas.';

create unique index if not exists bodega_projects_oc_line_uidx
  on public.bodega_projects (orden_compra_id, cotizacion_linea_idx)
  where orden_compra_id is not null and cotizacion_linea_idx is not null;

-- 2) Versiones de entrega CNC / programación (ZIP)
create table if not exists public.project_machine_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.bodega_projects(id) on delete cascade,
  version int not null check (version >= 1),

  zip_storage_path text not null,
  zip_filename text not null,

  status text not null default 'subida'
    check (status in ('subida', 'en_revision', 'requiere_cambios', 'aprobada')),

  entry_html_path text,
  manifest jsonb,
  comentarios text,

  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

comment on table public.project_machine_versions is
  'Entregas de programación/CNC por proyecto: 1 ZIP por versión.';

create unique index if not exists project_machine_versions_project_version_uidx
  on public.project_machine_versions (project_id, version);

create index if not exists project_machine_versions_project_created_idx
  on public.project_machine_versions (project_id, created_at desc);

-- 3) Fotos de piezas armadas / prueba
create table if not exists public.project_piece_photos (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.bodega_projects(id) on delete cascade,
  storage_path text not null,
  filename text not null,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

comment on table public.project_piece_photos is
  'Imágenes de piezas terminadas / armado / prueba por proyecto.';

create index if not exists project_piece_photos_project_created_idx
  on public.project_piece_photos (project_id, created_at desc);

-- 4) Crear un proyecto por cada partida del PDF (cualquier rol is_bodega(); insert con RLS desactivado en la función)
create or replace function public.bodega_bulk_create_projects_from_oc(p_orden_compra_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  oc record;
  lines text[];
  i int;
  n int;
  created int := 0;
  skipped int := 0;
  v_folio text;
  cliente_n text;
  empresa_n text;
  line text;
begin
  if not public.is_bodega() then
    raise exception 'Solo cuentas con rol de bodega pueden crear proyectos desde partidas del PDF';
  end if;

  select
    o.id,
    o.numero,
    o.cotizacion_lineas,
    coalesce(nullif(trim(rq.nombre), ''), 'Cliente') as requisitor_nombre,
    e.nombre as empresa_nombre
  into oc
  from public.bodega_ordenes_compra o
  left join public.requisitores rq on rq.id = o.requisitor_id
  left join public.empresas e on e.id = o.empresa_id
  where o.id = p_orden_compra_id;

  if not found then
    raise exception 'Orden de compra no encontrada';
  end if;

  lines := coalesce(oc.cotizacion_lineas, '{}');
  n := coalesce(array_length(lines, 1), 0);
  if n = 0 then
    raise exception 'La OC no tiene partidas en cotizacion_lineas (sube de nuevo el PDF o revisa extracción)';
  end if;

  cliente_n := oc.requisitor_nombre;
  empresa_n := oc.empresa_nombre;

  for i in 1..n loop
    line := trim(coalesce(lines[i], ''));
    if line = '' then
      skipped := skipped + 1;
      continue;
    end if;

    if exists (
      select 1
      from public.bodega_projects p
      where p.orden_compra_id = p_orden_compra_id
        and p.cotizacion_linea_idx = i
    ) then
      skipped := skipped + 1;
      continue;
    end if;

    v_folio := upper(regexp_replace(oc.numero, '[^A-Za-z0-9]+', '-', 'g')) || '-I' || i::text;
    while exists (select 1 from public.bodega_projects bp where bp.folio = v_folio) loop
      v_folio := v_folio || '-' || substr(md5(random()::text), 1, 4);
    end loop;

    insert into public.bodega_projects (
      folio,
      orden,
      orden_compra_id,
      cliente,
      empresa,
      nombre,
      status,
      cotizacion_linea_idx
    ) values (
      v_folio,
      oc.numero,
      p_orden_compra_id,
      cliente_n,
      empresa_n,
      line,
      'en_diseno',
      i
    );

    created := created + 1;
  end loop;

  return jsonb_build_object('created', created, 'skipped', skipped, 'lines', n);
end;
$$;

grant execute on function public.bodega_bulk_create_projects_from_oc(uuid) to authenticated;

notify pgrst, 'reload schema';

-- 5) Programadora: solicitar revisión de cierre (piezas listas / fotos de prueba)
create or replace function public.bodega_programadora_solicita_cierre(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  r text := public.my_role();
  st text;
begin
  if r not in ('admin', 'programadora_maquinaria') then
    raise exception 'Solo programadora o admin puede solicitar revisión de cierre';
  end if;

  select p.status into st from public.bodega_projects p where p.id = p_project_id;
  if not found then raise exception 'Proyecto no encontrado'; end if;

  if st not in ('en_programacion', 'diseno_aprobado') then
    raise exception 'El proyecto debe estar en diseño aprobado o en programación para solicitar cierre';
  end if;

  update public.bodega_projects
    set status = 'revision_programacion'
  where id = p_project_id;

  insert into public.project_activity(project_id, actor_id, type, payload)
  values (
    p_project_id,
    auth.uid(),
    'closure_review_requested',
    jsonb_build_object('from_status', st)
  );
end;
$$;

grant execute on function public.bodega_programadora_solicita_cierre(uuid) to authenticated;
