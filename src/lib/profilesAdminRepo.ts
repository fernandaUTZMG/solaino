import type { AppRole } from './roles'
import { getSupabase } from './supabaseClient'

export type ProfileAdminRow = {
  id: string
  username: string | null
  email: string | null
  role: string
  created_at: string
}

export async function fetchProfilesAdmin(): Promise<ProfileAdminRow[]> {
  const sb = getSupabase()
  const { data: rpcData, error: rpcError } = await sb.rpc('list_profiles_for_user_manager')
  if (!rpcError && Array.isArray(rpcData)) {
    return (rpcData as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      username: (r.username ?? null) as string | null,
      email: (r.email ?? null) as string | null,
      role: String(r.role),
      created_at: String(r.created_at ?? ''),
    }))
  }

  // Respaldo si el RPC aún no está desplegado en Supabase
  const { data, error } = await sb
    .from('profiles')
    .select('id, username, email, role, created_at')
    .order('created_at', { ascending: false })
  if (error) throw error
  const rows = (data as Record<string, unknown>[]) ?? []
  return rows.map((r) => ({
    id: String(r.id),
    username: (r.username ?? null) as string | null,
    email: (r.email ?? null) as string | null,
    role: String(r.role),
    created_at: String(r.created_at),
  }))
}

/** Actualiza `profiles` y el correo en Auth (`usuario@solaino.local`). Solo admin (RPC). */
export async function adminSyncAuthEmailForUsername(userId: string, newUsername: string): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb.rpc('admin_sync_auth_email_for_username', {
    p_user_id: userId,
    p_username: newUsername.trim().toLowerCase(),
  })
  if (error) throw new Error(error.message || 'No se pudo actualizar el usuario')
}

export async function updateProfileRole(userId: string, role: AppRole): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb.from('profiles').update({ role }).eq('id', userId)
  if (error) throw new Error(error.message || 'No se pudo actualizar el rol')
}

/** Envía correo de recuperación de Supabase Auth (requiere SMTP configurado para el dominio). */
export async function sendPasswordResetEmailToUser(email: string): Promise<void> {
  const e = email.trim()
  if (!e) throw new Error('Sin correo para enviar el enlace.')
  const sb = getSupabase()
  const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/` : undefined
  const { error } = await sb.auth.resetPasswordForEmail(e, redirectTo ? { redirectTo } : undefined)
  if (error) throw new Error(error.message || 'No se pudo enviar el correo de recuperación')
}
