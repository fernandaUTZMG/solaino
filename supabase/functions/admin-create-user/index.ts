/**
 * Edge Function: admin crea un nuevo usuario (Auth Admin API) y registra/actualiza `profiles`.
 *
 * Despliegue (CLI):
 *   supabase login
 *   supabase link --project-ref TU_REF
 *   supabase functions deploy admin-create-user
 *
 * Nota: en Dashboard → Edge Functions → Secrets deben existir:
 * - SUPABASE_URL
 * - SUPABASE_ANON_KEY
 * - SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import {
  canManageUsers,
  encargadoCannotAssignRole,
} from '../_shared/userManagementAuth.ts'
 
const INTERNAL_EMAIL_DOMAIN = 'solaino.local'
 
function usernameToInternalEmail(username: string): string {
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
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
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
    return new Response(JSON.stringify({ error: 'Solo administradores o supervisores pueden crear usuarios' }), {
      status: 403,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
 
  let body: { username?: string; password?: string; role?: string }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'JSON inválido' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
 
  const username = String(body.username ?? '').trim().toLowerCase()
  const password = String(body.password ?? '')
  const allowedRoles = new Set([
    'admin',
    'user',
    'encargado',
    'disenadora',
    'programadora_maquinaria',
    'operador_bodega',
  ])
  const rawRole = String(body.role ?? '').trim()
  const role = allowedRoles.has(rawRole) ? rawRole : 'user'

  if (encargadoCannotAssignRole(String(prof.role), role)) {
    return new Response(JSON.stringify({ error: 'No puedes crear cuentas con rol administrador' }), {
      status: 403,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
 
  if (username.length < 3) {
    return new Response(JSON.stringify({ error: 'El usuario debe tener al menos 3 caracteres.' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
  if (password.length < 6) {
    return new Response(JSON.stringify({ error: 'La contraseña debe tener al menos 6 caracteres.' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
 
  const email = usernameToInternalEmail(username)
 
  let userId: string

  const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username },
  })

  if (createErr || !created?.user) {
    const msg = (createErr?.message ?? '').toLowerCase()
    const duplicate =
      msg.includes('already') ||
      msg.includes('registered') ||
      msg.includes('exists') ||
      msg.includes('duplicate')
    if (duplicate) {
      const { data: page, error: listErr } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 })
      if (listErr || !page?.users?.length) {
        return new Response(
          JSON.stringify({
            error:
              createErr?.message ||
              'Ese usuario/correo ya existe en Authentication. No se pudo localizar el registro para actualizar el perfil.',
            step: 'auth_duplicate',
          }),
          { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } },
        )
      }
      const found = page.users.find((u) => (u.email ?? '').toLowerCase() === email.toLowerCase())
      if (!found) {
        return new Response(
          JSON.stringify({
            error:
              createErr?.message ||
              'Ese correo ya está en uso. Si el usuario existe, búscalo en Authentication y sincroniza el perfil.',
            step: 'auth_duplicate',
          }),
          { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } },
        )
      }
      userId = found.id
      await adminClient.auth.admin.updateUserById(userId, { password, user_metadata: { username } })
    } else {
      return new Response(
        JSON.stringify({ error: createErr?.message || 'No se pudo crear el usuario', step: 'auth' }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } },
      )
    }
  } else {
    userId = created.user.id
  }

  const { error: upsertErr } = await adminClient
    .from('profiles')
    .upsert({ id: userId, username, email, role }, { onConflict: 'id' })

  if (upsertErr) {
    const hint =
      /profiles_role_check|check constraint|violates check/i.test(upsertErr.message ?? '')
        ? ' Ejecuta en SQL Editor el archivo supabase/alter_profiles_role_constraint.sql (o schema_bodega.sql) para permitir roles encargado/disenadora/programadora_maquinaria.'
        : ''
    return new Response(
      JSON.stringify({
        error: `${upsertErr.message || 'No se pudo guardar el perfil.'}${hint}`,
        step: 'profiles',
      }),
      { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } },
    )
  }
 
  return new Response(JSON.stringify({ ok: true, user_id: userId, email }), {
    status: 200,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
})

