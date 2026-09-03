-- Storage: Entregas por proyecto (diseño / programación / fotos)
-- Ejecuta este script completo en SQL Editor (crea el bucket si no existe + policies + GRANT).
--
-- Requiere antes: supabase/schema_bodega.sql (my_role(), is_admin(), is_bodega(), is_bodega_supervisor()).

create or replace function public.can_review_design()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select public.my_role() in ('admin', 'encargado');
$$;

-- Subir bajo .../diseno/... : diseñadora, supervisor (encargado) o admin
create or replace function public.can_upload_design()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select public.my_role() in ('admin', 'encargado', 'disenadora');
$$;

create or replace function public.can_upload_machine()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select public.my_role() in ('admin', 'encargado', 'programadora_maquinaria');
$$;

create or replace function public.can_upload_piece_photos()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select public.my_role() in ('admin', 'encargado', 'disenadora', 'programadora_maquinaria');
$$;

insert into storage.buckets (id, name, public)
select 'bodega-proyectos', 'bodega-proyectos', false
where not exists (select 1 from storage.buckets where id = 'bodega-proyectos');

grant usage on schema storage to authenticated;
grant select, insert, update, delete on storage.objects to authenticated;

drop policy if exists "bodega_proyectos_select_bodega" on storage.objects;
drop policy if exists "bodega_proyectos_insert_design_uploader" on storage.objects;
drop policy if exists "bodega_proyectos_insert_paths" on storage.objects;
drop policy if exists "bodega_proyectos_update_supervisor" on storage.objects;
drop policy if exists "bodega_proyectos_delete_admin" on storage.objects;

create policy "bodega_proyectos_select_bodega"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'bodega-proyectos' and public.is_bodega());

-- Subida: rutas por tipo (name = ruta del objeto)
create policy "bodega_proyectos_insert_paths"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'bodega-proyectos'
    and (
      (public.can_upload_design() and (name like '%/diseno/%' or name like '%/info_cliente/%'))
      or (public.can_upload_machine() and name like '%/programacion/%')
      or (public.can_upload_piece_photos() and name like '%/evidencias/%')
    )
  );

create policy "bodega_proyectos_update_supervisor"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'bodega-proyectos' and (public.can_review_design() or public.is_admin()))
  with check (bucket_id = 'bodega-proyectos');

create policy "bodega_proyectos_delete_admin"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'bodega-proyectos' and public.is_bodega_supervisor());
