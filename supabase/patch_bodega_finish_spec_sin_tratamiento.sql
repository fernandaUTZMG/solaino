-- Permite marcar piezas sin tratamiento de superficie (anodizado / pavonado / otro).
-- Ejecuta en Supabase → SQL Editor.

do $$
declare
  cname text;
begin
  select c.conname into cname
  from pg_constraint c
  where c.conrelid = 'public.bodega_project_pieces'::regclass
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ilike '%finish_spec%';

  if cname is not null then
    execute format('alter table public.bodega_project_pieces drop constraint %I', cname);
  end if;
end $$;

alter table public.bodega_project_pieces
  add constraint bodega_project_pieces_finish_spec_check
  check (
    finish_spec is null
    or finish_spec in ('anodizado', 'pavonado', 'otro', 'sin_tratamiento')
  );

comment on column public.bodega_project_pieces.finish_spec is
  'Tras aprobar diseño: anodizado / pavonado / otro, o sin_tratamiento si no aplica.';

notify pgrst, 'reload schema';
