-- Hora oficial de Supabase para alinear cronómetros del cliente.
-- Ejecutar en Supabase → SQL Editor.

create or replace function public.bodega_server_now()
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select now();
$$;

grant execute on function public.bodega_server_now() to anon, authenticated;
