-- Políticas RLS para series (requiere `schema_series.sql` y `schema_roles_audit_solicitudes.sql`)

alter table public.series enable row level security;

drop policy if exists "series_select_auth" on public.series;
drop policy if exists "series_insert_auth" on public.series;

create policy "series_select_auth"
  on public.series for select
  to authenticated
  using (true);

create policy "series_insert_auth"
  on public.series for insert
  to authenticated
  with check (true);

