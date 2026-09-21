import { createClient, FunctionsHttpError } from '@supabase/supabase-js'
import { getSupabase } from './supabaseClient'

type FnResponse = { ok?: boolean; error?: string; login_email?: string; warning?: string }

export type AdminSetPasswordResult = { loginEmail: string; warning?: string }

async function readFunctionsErrorBody(err: unknown): Promise<string | null> {
  if (!(err instanceof FunctionsHttpError)) return null
  try {
    const ctx = err.context as Response
    const j = (await ctx.clone().json()) as { error?: string }
    if (j?.error) return j.error
  } catch {
    /* ignore */
  }
  return null
}

/** Cliente aparte: no toca la sesión del admin en el navegador. */
async function probePasswordLogin(email: string, password: string): Promise<string | null> {
  const url = import.meta.env.VITE_SUPABASE_URL as string
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string
  if (!url || !key) return 'Supabase no está configurado.'
  const probe = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { error } = await probe.auth.signInWithPassword({ email, password })
  await probe.auth.signOut({ scope: 'local' }).catch(() => undefined)
  if (!error) return null
  return error.message || error.code || 'Usuario o contraseña incorrectos'
}

async function invokeSetPassword(targetUserId: string, newPassword: string): Promise<AdminSetPasswordResult> {
  const sb = getSupabase()
  const { data: sess } = await sb.auth.getSession()
  if (!sess.session?.access_token) {
    throw new Error('No hay sesión. Vuelve a iniciar sesión.')
  }

  const { data, error } = await sb.functions.invoke<FnResponse>('admin-set-password', {
    body: { target_user_id: targetUserId, new_password: newPassword },
  })

  if (data && typeof data === 'object' && 'error' in data && (data as FnResponse).error) {
    throw new Error(String((data as FnResponse).error))
  }

  if (error) {
    const fromBody = await readFunctionsErrorBody(error)
    const msg = fromBody || error.message || 'Error al llamar la función'
    if (msg.includes('Failed to send') || msg.includes('404') || msg.includes('not found')) {
      throw new Error(
        'La función admin-set-password no está desplegada o no responde. Ejecuta: supabase functions deploy admin-set-password',
      )
    }
    if (/500|internal server error/i.test(msg)) {
      throw new Error(
        'El servidor no pudo guardar la contraseña (500). Recarga la página (F5) y vuelve a intentar. Si sigue, redespliega admin-set-password.',
      )
    }
    throw new Error(msg)
  }

  if (!data || data.ok !== true) {
    throw new Error(
      'El servidor no confirmó el cambio (ok: true faltante). Vuelve a desplegar admin-set-password y revisa los logs en Supabase.',
    )
  }

  const loginEmail =
    typeof data.login_email === 'string' && data.login_email.trim() !== '' ? data.login_email.trim() : ''
  if (!loginEmail) {
    throw new Error(
      'El servidor no devolvió login_email. Redespliega la Edge Function admin-set-password desde el repo actualizado.',
    )
  }

  const warning = typeof data.warning === 'string' && data.warning.trim() !== '' ? data.warning.trim() : undefined
  return { loginEmail, warning }
}

/**
 * Establece la contraseña del usuario destino vía Edge Function `admin-set-password`.
 * Después comprueba el login con un cliente aparte para no cerrar la sesión del admin.
 */
export async function adminSetUserPassword(
  targetUserId: string,
  newPassword: string,
): Promise<AdminSetPasswordResult> {
  let result = await invokeSetPassword(targetUserId, newPassword)
  let probeFail = await probePasswordLogin(result.loginEmail, newPassword)
  if (probeFail) {
    result = await invokeSetPassword(targetUserId, newPassword)
    probeFail = await probePasswordLogin(result.loginEmail, newPassword)
  }
  if (probeFail) {
    throw new Error(
      `La contraseña no quedó activa para entrar con ${result.loginEmail} (${probeFail}). ` +
        'Vuelve a pulsar «Establecer contraseña». El usuario debe entrar con su nombre (sin @), no con un correo distinto.',
    )
  }
  return result
}
