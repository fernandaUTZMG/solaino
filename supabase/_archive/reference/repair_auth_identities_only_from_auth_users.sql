-- Emergencia: solo repara `auth.identities` (proveedor `email`) usando el correo que ya
-- está en `auth.users`. No modifica `profiles` ni vuelve a escribir `auth.users.email`.
--
-- Úsalo si una reparación anterior dejó `identity_data` incompleto (falta `sub` o
-- `email_verified`) y nadie puede entrar, pero los correos en Authentication ya son correctos.

begin;

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
