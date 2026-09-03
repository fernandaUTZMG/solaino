import { FunctionsHttpError } from '@supabase/supabase-js'
import { getSupabase } from './supabaseClient'
import type { AppRole } from './roles'

type FnResponse = { ok?: boolean; error?: string; step?: string; user_id?: string; email?: string }

async function readFunctionsErrorBody(err: unknown): Promise<string | null> {
  if (!(err instanceof FunctionsHttpError)) return null
  try {
    const ctx = err.context as Response
    const j = (await ctx.clone().json()) as { error?: string; step?: string }
    if (j?.error) return j.step ? `${j.error} (${j.step})` : j.error
  } catch {
    /* ignore */
  }
  return null
}

export async function adminCreateUser(args: {
  username: string
  password: string
  role: AppRole
}): Promise<{ userId: string; email: string }> {
  const sb = getSupabase()
  const { data: sess } = await sb.auth.getSession()
  if (!sess.session?.access_token) throw new Error('No hay sesión. Vuelve a iniciar sesión.')

  const { data, error } = await sb.functions.invoke<FnResponse>('admin-create-user', {
    body: { username: args.username, password: args.password, role: args.role },
  })

  if (error) {
    const fromBody = await readFunctionsErrorBody(error)
    const msg = fromBody || error.message || 'Error al llamar la función'
    if (msg.includes('Failed to send') || msg.includes('404') || msg.includes('not found')) {
      throw new Error(
        'La función admin-create-user no está desplegada o no responde. Ejecuta: supabase functions deploy admin-create-user',
      )
    }
    throw new Error(msg)
  }

  if (data && typeof data === 'object' && 'error' in data && (data as FnResponse).error) {
    const d = data as FnResponse
    throw new Error(d.step ? `${d.error} (${d.step})` : String(d.error))
  }

  const userId = (data as FnResponse | null)?.user_id
  const email = (data as FnResponse | null)?.email
  if (!userId || !email) {
    throw new Error('El servidor no devolvió user_id/email. Revisa los logs de la Edge Function.')
  }
  return { userId, email }
}

