-- Resultado del análisis de ensamblajes .x_T (worker externo o cliente).

alter table public.project_design_versions
  add column if not exists assembly_children jsonb,
  add column if not exists assembly_parse_status text not null default 'pending'
    check (assembly_parse_status in ('pending', 'processing', 'ok', 'partial', 'failed', 'skipped')),
  add column if not exists assembly_parse_error text,
  add column if not exists assembly_parsed_at timestamptz;

comment on column public.project_design_versions.assembly_children is
  'Piezas por ensamblaje .x_T: { "SOLID/Ensamblaje1.x_t": [{ key, label, sourcePath, assemblyPath, origin }] }.';

comment on column public.project_design_versions.assembly_parse_status is
  'Estado del worker de extracción (pending → processing → ok|partial|failed).';
