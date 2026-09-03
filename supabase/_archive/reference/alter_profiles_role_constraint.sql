-- Ampliar roles permitidos en public.profiles (necesario para encargado, diseñadora, etc.)
-- Ejecuta en Supabase → SQL Editor si al crear usuarios ves error de CHECK en profiles.role.

do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'profiles_role_check'
  ) then
    alter table public.profiles drop constraint profiles_role_check;
  end if;
exception when others then
  null;
end $$;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'user', 'encargado', 'disenadora', 'programadora_maquinaria', 'operador_bodega'));
