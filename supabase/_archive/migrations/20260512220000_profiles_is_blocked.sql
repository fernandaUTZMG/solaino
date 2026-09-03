-- Columna opcional (la app ya no gestiona bloqueo desde UI). Puedes omitir esta migración en proyectos nuevos.
alter table public.profiles
  add column if not exists is_blocked boolean not null default false;

comment on column public.profiles.is_blocked is 'Opcional. La app no actualiza este campo; puedes usarlo desde SQL o Dashboard si lo necesitas.';
