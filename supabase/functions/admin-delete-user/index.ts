/**
 * Edge Function: admin elimina un usuario en Auth (el perfil cae por ON DELETE CASCADE en profiles).
 *
 *   supabase functions deploy admin-delete-user
 *
 * Antes de borrar en Auth, se limpian referencias en `public.*` (solicitudes, audit_log, bodega, etc.),
 * porque varias FKs a `auth.users` usan RESTRICT / NO ACTION y GoTrue devuelve «Database error deleting user».
 *
 * Si el navegador muestra CORS en el preflight: despliega con `verify_jwt = false` en
 * `supabase/config.toml` ([functions.admin-delete-user]) o desactiva JWT en Dashboard para esta función.
 *
 * Requiere secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import {
  canManageUsers,
  encargadoCannotManageAdminTarget,
} from '../_shared/userManagementAuth.ts'

const cors: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, prefer, x-supabase-authorization',
  'Access-Control-Max-Age': '86400',
}

/** Tablas/columnas opcionales: ignorar si el proyecto no tiene esa tabla en el schema cache de PostgREST. */
function ignorableTableError(msg: string): boolean {
  const m = msg.toLowerCase()
  return (
    m.includes('schema cache') ||
    m.includes('could not find the table') ||
    (m.includes('relation') && m.includes('does not exist'))
  )
}

/**
 * Quita o anula filas en `public` que referencian `auth.users(id)` sin ON DELETE adecuado.
 * Sin esto, `auth.admin.deleteUser` a menudo falla con «Database error deleting user».
 */
async function detachUserReferencesBeforeAuthDelete(
  admin: SupabaseClient,
  targetId: string,
): Promise<string | null> {
  {
    const { error } = await admin.from('solicitudes').delete().eq('requested_by', targetId)
    if (error && !ignorableTableError(error.message)) {
      return `solicitudes: ${error.message}`
    }
  }

  const nullOut: Array<[string, string]> = [
    ['audit_log', 'actor_id'],
    ['password_recovery_requests', 'resolved_by'],
    ['bodega_projects', 'created_by'],
    ['project_design_versions', 'uploaded_by'],
    ['project_activity', 'actor_id'],
    ['bodega_ordenes_compra', 'created_by'],
    ['project_machine_versions', 'uploaded_by'],
    ['project_piece_photos', 'uploaded_by'],
  ]

  for (const [table, col] of nullOut) {
    const patch: Record<string, null> = { [col]: null }
    const { error } = await admin.from(table).update(patch).eq(col, targetId)
    if (error && !ignorableTableError(error.message)) {
      return `${table}.${col}: ${error.message}`
    }
  }

  return null
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
    return new Response(JSON.stringify({ error: 'Solo administradores o supervisores pueden eliminar usuarios' }), {
      status: 403,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  let body: { target_user_id?: string }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'JSON inválido' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const targetId = body.target_user_id
  if (!targetId || typeof targetId !== 'string') {
    return new Response(JSON.stringify({ error: 'Se requiere target_user_id' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  if (targetId === callerId) {
    return new Response(JSON.stringify({ error: 'No puedes eliminar tu propia cuenta.' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const { data: targetProfile, error: tpErr } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', targetId)
    .maybeSingle()
  if (tpErr) {
    return new Response(JSON.stringify({ error: tpErr.message || 'No se pudo leer el perfil' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
  if (!targetProfile) {
    return new Response(JSON.stringify({ error: 'No existe un perfil con ese id.' }), {
      status: 404,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  if (encargadoCannotManageAdminTarget(String(prof.role), targetProfile.role)) {
    return new Response(JSON.stringify({ error: 'No puedes eliminar cuentas de administrador' }), {
      status: 403,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  if (targetProfile.role === 'admin') {
    const { data: admins, error: adErr } = await adminClient.from('profiles').select('id').eq('role', 'admin')
    if (adErr) {
      return new Response(JSON.stringify({ error: adErr.message || 'No se pudo verificar administradores' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }
    if ((admins?.length ?? 0) <= 1) {
      return new Response(JSON.stringify({ error: 'No se puede eliminar el único administrador del sistema.' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }
  }

  const detachErr = await detachUserReferencesBeforeAuthDelete(adminClient, targetId)
  if (detachErr) {
    return new Response(JSON.stringify({ error: detachErr }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const { error: delErr } = await adminClient.auth.admin.deleteUser(targetId)
  if (delErr) {
    let msg = delErr.message || 'No se pudo eliminar el usuario en Auth'
    if (/database error deleting user/i.test(msg)) {
      msg +=
        ' Sigue existiendo alguna fila en la base que referencia a este usuario (FK hacia auth.users). Revisa tablas personalizadas o vuelve a desplegar admin-delete-user tras actualizar el código.'
    }
    return new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
})
