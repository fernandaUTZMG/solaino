import { getSupabase } from './supabaseClient'

type FnResponse = { ok?: boolean; error?: string; login_email?: string; warning?: string }

export type AdminSetPasswordResult = { loginEmail: string; warning?: string }

/**
 * Establece la contraseña del usuario destino vía Edge Function `admin-set-password` (requiere deploy).
 * Usa `functions.invoke` para enviar bien el JWT de la sesión del admin.
 */
export async function adminSetUserPassword(
  targetUserId: string,
  newPassword: string,
): Promise<AdminSetPasswordResult> {
  const sb = getSupabase()
  const { data: sess } = await sb.auth.getSession()
  if (!sess.session?.access_token) {
    throw new Error('No hay sesión. Vuelve a iniciar sesión.')
  }

  const { data, error } = await sb.functions.invoke<FnResponse>('admin-set-password', {
    body: { target_user_id: targetUserId, new_password: newPassword },
  })

  if (error) {
    const msg = error.message || 'Error al llamar la función'
    if (msg.includes('Failed to send') || msg.includes('404') || msg.includes('not found')) {
      throw new Error(
        'La función admin-set-password no está desplegada o no responde. Ejecuta: supabase functions deploy admin-set-password',
      )
    }
    throw new Error(msg)
  }

  if (data && typeof data === 'object' && 'error' in data && (data as FnResponse).error) {
    throw new Error(String((data as FnResponse).error))
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
