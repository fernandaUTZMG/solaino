import { FunctionsHttpError } from '@supabase/supabase-js'
import { getSupabase } from './supabaseClient'

type FnResponse = { ok?: boolean; error?: string }

function getFunctionsHttpStatus(err: unknown): number | null {
  if (!(err instanceof FunctionsHttpError)) return null
  try {
    return (err.context as Response).status
  } catch {
    return null
  }
}

async function readFunctionsErrorBody(err: unknown): Promise<string | null> {
  if (!(err instanceof FunctionsHttpError)) return null
  try {
    const ctx = err.context as Response
    const j = (await ctx.clone().json()) as { error?: string; message?: string }
    if (j?.error) return j.error
    if (j?.message) return j.message
  } catch {
    /* ignore */
  }
  return null
}

async function invokeAdminDelete(body: Record<string, unknown>): Promise<FnResponse> {
  const name = 'admin-delete-user' as const
  const sb = getSupabase()
  const { data: sess } = await sb.auth.getSession()
  if (!sess.session?.access_token) throw new Error('No hay sesión. Vuelve a iniciar sesión.')

  const { data, error } = await sb.functions.invoke<FnResponse>(name, { body })

  if (error) {
    const httpStatus = getFunctionsHttpStatus(error)
    if (httpStatus === 404) {
      throw new Error(
        'HTTP 404: no existe la ruta o la Edge Function «admin-delete-user» no está desplegada en tu proyecto. ' +
          'Desde la carpeta inventario-solaino: `supabase link --project-ref TU_REF` y `supabase functions deploy admin-delete-user`. ' +
          'Si la URL en el navegador es localhost con `/functions/v1/`, comprueba `.env.local` aquí mismo con VITE_SUPABASE_URL (el proxy de Vite lo necesita) y reinicia `npm run dev`.',
      )
    }

    const fromBody = await readFunctionsErrorBody(error)
    const raw = fromBody || error.message || 'Error al llamar la función'
    const lower = raw.toLowerCase()
    if (
      lower.includes('failed to fetch') ||
      lower.includes('networkerror') ||
      lower.includes('load failed') ||
      lower.includes('cors')
    ) {
      throw new Error(
        `No se pudo llamar a ${name} (red o CORS). Despliega: supabase functions deploy ${name}. En Dashboard, desactiva la verificación JWT en esa función o usa verify_jwt = false en supabase/config.toml.`,
      )
    }
    if (raw.includes('Failed to send') || raw.includes('404') || raw.includes('not found')) {
      throw new Error(
        `La función ${name} no está desplegada o no responde. Ejecuta: supabase functions deploy ${name}`,
      )
    }
    if (httpStatus != null && httpStatus >= 400) {
      throw new Error(`${name} respondió HTTP ${httpStatus}. ${raw}`)
    }
    throw new Error(raw)
  }

  if (data && typeof data === 'object' && 'error' in data && (data as FnResponse).error) {
    throw new Error(String((data as FnResponse).error))
  }
  if (!data || (data as FnResponse).ok !== true) {
    throw new Error(`El servidor no confirmó la operación (${name}). Revisa los logs de la Edge Function.`)
  }
  return data as FnResponse
}

/** Elimina el usuario en Auth (el perfil cae por ON DELETE CASCADE). */
export async function adminDeleteUser(targetUserId: string): Promise<void> {
  await invokeAdminDelete({ target_user_id: targetUserId })
}
