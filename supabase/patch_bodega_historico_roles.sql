-- Permisos Histórico alineados con respaldo actual (PROGRAMAS en historico/disenadora/).
-- Ejecutar en Supabase → SQL Editor y recargar esquema API.

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

notify pgrst, 'reload schema';
