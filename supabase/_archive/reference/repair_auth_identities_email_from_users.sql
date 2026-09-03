-- Reparación: alinear correos de perfil/Auth con `profiles.username` → `usuario@solaino.local`
-- y dejar cada identidad GoTrue (`provider = 'email'`) con los campos mínimos que usa el
-- login por contraseña: `sub`, `email` y `email_verified`.
--
-- Versiones anteriores solo hacían jsonb_set en `email` y podían dejar `identity_data` sin
-- `sub` o sin `email_verified`, lo que hace que **ningún** usuario pueda iniciar sesión (400).
--
-- Ejecuta TODO el bloque de una vez en Supabase → SQL Editor (incluye BEGIN/COMMIT).

begin;

with canon as (
  select
    u.id as user_id,
    case
      when p.username is not null
        and length(trim(p.username)) >= 3
        and lower(trim(p.username)) ~ '^[a-z0-9._+\-]+$'
      then lower(trim(p.username)) || '@solaino.local'
      else coalesce(
        nullif(lower(trim(p.email)), ''),
        nullif(lower(trim(u.email)), '')
      )
    end as login_email
  from auth.users u
  left join public.profiles p on p.id = u.id
)
update public.profiles pr
set email = c.login_email
from canon c
where pr.id = c.user_id
  and c.login_email is not null
  and nullif(trim(pr.email), '') is distinct from c.login_email;

with canon as (
  select
    u.id as user_id,
    case
      when p.username is not null
        and length(trim(p.username)) >= 3
        and lower(trim(p.username)) ~ '^[a-z0-9._+\-]+$'
      then lower(trim(p.username)) || '@solaino.local'
      else coalesce(
        nullif(lower(trim(p.email)), ''),
        nullif(lower(trim(u.email)), '')
      )
    end as login_email
  from auth.users u
  left join public.profiles p on p.id = u.id
)
update auth.users uu
set email = c.login_email
from canon c
where uu.id = c.user_id
  and c.login_email is not null
  and nullif(trim(uu.email), '') is distinct from c.login_email;

-- Obligatorio: reescribir identity_data con sub + email (desde auth.users) + email_verified.
-- No uses solo jsonb_set sobre `{email}`: puede quedar un JSON inválido para GoTrue.
update auth.identities i
set
  identity_data =
    jsonb_set(
      jsonb_set(
        jsonb_set(
          coalesce(i.identity_data, '{}'::jsonb),
          '{sub}',
          to_jsonb(i.user_id::text),
          true
        ),
        '{email}',
        to_jsonb(lower(trim(u.email))),
        true
      ),
      '{email_verified}',
      to_jsonb(true),
      true
    ),
  updated_at = now()
from auth.users u
where i.user_id = u.id
  and i.provider = 'email'
  and u.email is not null
  and length(trim(u.email)) > 0;

commit;

-- Verificación (opcional):
-- select u.email, i.identity_data, i.provider
-- from auth.identities i
-- join auth.users u on u.id = i.user_id
-- where i.provider = 'email'
-- limit 20;
