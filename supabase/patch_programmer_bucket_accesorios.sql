-- Permite destino «accesorios» en programación y guarda copia en Storage.
-- Ejecutar en SQL Editor de Supabase si al asignar piezas falla con error 400.
-- Después: Settings → API → Reload schema.

do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_namespace n on t.relnamespace = n.oid
    where n.nspname = 'public'
      and t.relname = 'bodega_project_pieces'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%programmer_bucket%'
  loop
    execute format('alter table public.bodega_project_pieces drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.bodega_project_pieces
  add constraint bodega_project_pieces_programmer_bucket_check
  check (
    programmer_bucket is null
    or programmer_bucket in ('cnc', 'torno', 'perfilado', 'accesorios')
  );

alter table public.bodega_project_pieces
  add column if not exists accesorio_storage_path text;

alter table public.bodega_project_pieces
  add column if not exists accesorio_storage_name text;

alter table public.bodega_project_pieces
  add column if not exists accesorio_archived_at timestamptz;

comment on column public.bodega_project_pieces.programmer_bucket is
  'Destino en programación: cnc, torno, perfilado, accesorios (sin proceso), o null pendiente.';

comment on column public.bodega_project_pieces.accesorio_storage_path is
  'Ruta en bodega-proyectos/{folio}/accesorios/… con copia del archivo de diseño.';

comment on column public.bodega_project_pieces.accesorio_storage_name is
  'Nombre de archivo mostrado para la copia en accesorios.';

comment on column public.bodega_project_pieces.accesorio_archived_at is
  'Cuándo se archivó la pieza en la carpeta de accesorios en la nube.';
