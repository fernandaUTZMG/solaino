-- Módulo Histórico (archivo diseñadora / programación en R2)
-- Ejecutar en Supabase → SQL Editor y recargar esquema API.

create table if not exists public.bodega_historic_files (
  id uuid primary key default gen_random_uuid(),
  area text not null check (area in ('disenadora', 'programacion')),
  storage_path text not null,
  display_name text not null,
  folio text,
  notes text,
  file_size bigint,
  content_type text,
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint bodega_historic_files_storage_path_key unique (storage_path),
  constraint bodega_historic_files_path_area check (
    (area = 'disenadora' and storage_path like 'historico/disenadora/%')
    or (area = 'programacion' and storage_path like 'historico/programacion/%')
  )
);

create index if not exists bodega_historic_files_area_created_idx
  on public.bodega_historic_files (area, created_at desc);

comment on table public.bodega_historic_files is
  'Índice de archivos del módulo Histórico (R2: historico/disenadora|programacion/...).';

alter table public.bodega_historic_files enable row level security;

drop policy if exists "bodega_historic_files_select" on public.bodega_historic_files;
create policy "bodega_historic_files_select"
  on public.bodega_historic_files for select
  to authenticated
  using (
    public.is_bodega()
    and (
      public.my_role() in ('admin', 'encargado')
      or (public.my_role() = 'disenadora' and area = 'programacion')
      or (public.my_role() = 'programadora_maquinaria' and area = 'disenadora')
    )
  );

drop policy if exists "bodega_historic_files_insert" on public.bodega_historic_files;
create policy "bodega_historic_files_insert"
  on public.bodega_historic_files for insert
  to authenticated
  with check (
    public.is_bodega()
    and (
      public.my_role() in ('admin', 'encargado')
      or (public.my_role() = 'disenadora' and area = 'programacion')
      or (public.my_role() = 'programadora_maquinaria' and area = 'disenadora')
    )
    and uploaded_by = auth.uid()
  );

drop policy if exists "bodega_historic_files_update" on public.bodega_historic_files;
create policy "bodega_historic_files_update"
  on public.bodega_historic_files for update
  to authenticated
  using (
    public.is_bodega()
    and (
      public.my_role() in ('admin', 'encargado')
      or (public.my_role() = 'disenadora' and area = 'programacion')
      or (public.my_role() = 'programadora_maquinaria' and area = 'disenadora')
    )
  )
  with check (
    public.is_bodega()
    and (
      public.my_role() in ('admin', 'encargado')
      or (
        public.my_role() = 'disenadora'
        and area = 'programacion'
        and uploaded_by = auth.uid()
      )
      or (
        public.my_role() = 'programadora_maquinaria'
        and area = 'disenadora'
        and uploaded_by = auth.uid()
      )
    )
  );

drop policy if exists "bodega_historic_files_delete" on public.bodega_historic_files;
create policy "bodega_historic_files_delete"
  on public.bodega_historic_files for delete
  to authenticated
  using (
    public.is_bodega()
    and public.my_role() in ('admin', 'encargado')
  );

notify pgrst, 'reload schema';
