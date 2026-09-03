/**
 * Edge Function: admin establece contraseña de otro usuario (Auth Admin API).
 *
 * Despliegue (CLI):
 *   supabase login
 *   supabase link --project-ref TU_REF
 *   supabase functions deploy admin-set-password
 *
 * CORS desde el navegador: `supabase/config.toml` pone verify_jwt=false en esta función
 * (el preflight OPTIONS no lleva JWT; la verificación se hace aquí con getUser(jwt)).
 * Alternativa: deploy con --no-verify-jwt si no usas config.toml.
 *
 * Nota: en Dashboard → Edge Functions → Secrets deben existir SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY
 * (Supabase suele inyectarlas automáticamente). Añade SUPABASE_ANON_KEY si getUser con anon falla.
 *
 * Invocación desde la app: POST /functions/v1/admin-set-password
 * Headers: Authorization: Bearer <access_token del admin>, apikey: <anon key>
 * Body: { "target_user_id": "<uuid>", "new_password": "<string min 6>" }
 *
 * La contraseña se aplica en una llamada aparte del cambio de correo: en una sola petición
 * `updateUserById({ email, password, ... })` GoTrue a veces no persiste el hash y el login
 * sigue fallando aunque la API responda OK.
 *
 * Después, si hace falta, alinea el correo con `profiles.username` → `usuario@solaino.local`
 * y sincroniza `public.profiles.email`.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import {
  canManageUsers,
  encargadoCannotManageAdminTarget,
} from '../_shared/userManagementAuth.ts'

/** Debe coincidir con `INTERNAL_EMAIL_DOMAIN` en `src/lib/auth.ts` y con admin-create-user. */
const INTERNAL_EMAIL_DOMAIN = 'solaino.local'

function internalEmailForUsername(username: string): string {
  const u = username.trim().toLowerCase()
  return `${u}@${INTERNAL_EMAIL_DOMAIN}`
}

const cors: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, prefer, x-supabase-authorization',
  'Access-Control-Max-Age': '86400',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors })
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return new Response(JSON.stringify({ error: 'Faltan variables de entorno en la función' }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Sin autorización' }), {
      status: 401,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const jwt = authHeader.slice('Bearer '.length).trim()
  if (!jwt) {
    return new Response(JSON.stringify({ error: 'Token vacío' }), {
      status: 401,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const userClient = createClient(supabaseUrl, anonKey)
  const { data: userData, error: userErr } = await userClient.auth.getUser(jwt)
  if (userErr || !userData.user) {
    return new Response(JSON.stringify({ error: 'Sesión inválida' }), {
      status: 401,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
  const callerId = userData.user.id

  const adminClient = createClient(supabaseUrl, serviceKey)

  const { data: prof, error: profErr } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', callerId)
    .maybeSingle()
  if (profErr || !prof || !canManageUsers(prof.role)) {
    return new Response(JSON.stringify({ error: 'Solo administradores o supervisores pueden cambiar contraseñas' }), {
      status: 403,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  let body: { target_user_id?: string; new_password?: string }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'JSON inválido' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const targetId = body.target_user_id
  const newPassword = body.new_password
  if (!targetId || typeof newPassword !== 'string' || newPassword.length < 6) {
    return new Response(
      JSON.stringify({ error: 'Se requiere target_user_id y new_password (mínimo 6 caracteres)' }),
      { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } },
    )
  }

  const { data: targetUser, error: getTargetErr } = await adminClient.auth.admin.getUserById(targetId)
  if (getTargetErr || !targetUser?.user) {
    return new Response(
      JSON.stringify({
        error: getTargetErr?.message || 'No existe un usuario en Authentication con ese id.',
      }),
      { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } },
    )
  }

  const { data: targetProfile, error: profileErr } = await adminClient
    .from('profiles')
    .select('username, role')
    .eq('id', targetId)
    .maybeSingle()
  if (profileErr) {
    return new Response(JSON.stringify({ error: profileErr.message || 'No se pudo leer el perfil' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
  if (encargadoCannotManageAdminTarget(String(prof.role), (targetProfile as { role?: string })?.role)) {
    return new Response(JSON.stringify({ error: 'No puedes modificar cuentas de administrador' }), {
      status: 403,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const profileUsername = String((targetProfile as { username?: string | null })?.username ?? '').trim().toLowerCase()
  const currentEmail = (targetUser.user.email ?? '').trim().toLowerCase()
  let loginEmail = ''
  if (profileUsername.length >= 3) {
    loginEmail = internalEmailForUsername(profileUsername)
  } else if (currentEmail.length > 0) {
    loginEmail = currentEmail
  }
  if (!loginEmail) {
    return new Response(
      JSON.stringify({
        error:
          'El usuario no tiene nombre de usuario en el perfil (mín. 3 caracteres) ni correo en Auth; no se puede alinear el inicio de sesión.',
      }),
      { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } },
    )
  }

  const prevMeta = targetUser.user.user_metadata as Record<string, unknown> | undefined
  const user_metadata = {
    ...(prevMeta && typeof prevMeta === 'object' ? prevMeta : {}),
    ...(profileUsername.length >= 3 ? { username: profileUsername } : {}),
  }

  const { data: afterPwd, error: pwdErr } = await adminClient.auth.admin.updateUserById(targetId, {
    password: newPassword,
    user_metadata,
  })
  if (pwdErr || !afterPwd?.user) {
    return new Response(JSON.stringify({ error: pwdErr?.message || 'No se pudo actualizar la contraseña' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  let effectiveEmail = (afterPwd.user.email ?? '').trim().toLowerCase()
  if (!effectiveEmail) {
    effectiveEmail = currentEmail
  }

  let email_alignment_warning: string | null = null
  if (loginEmail && effectiveEmail !== loginEmail) {
    const { data: afterEmail, error: emErr } = await adminClient.auth.admin.updateUserById(targetId, {
      email: loginEmail,
      email_confirm: true,
    })
    if (emErr || !afterEmail?.user) {
      email_alignment_warning = emErr?.message || 'No se pudo alinear el correo en Auth (la contraseña sí se guardó).'
    } else {
      effectiveEmail = (afterEmail.user.email ?? loginEmail).trim().toLowerCase()
    }
  }

  await adminClient.from('profiles').update({ email: effectiveEmail }).eq('id', targetId)

  return new Response(
    JSON.stringify({
      ok: true,
      login_email: effectiveEmail || loginEmail,
      ...(email_alignment_warning ? { warning: email_alignment_warning } : {}),
    }),
    {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
    },
  )
})
