import { getSupabase } from './supabaseClient'

export type PasswordRecoveryRow = {
  id: string
  username: string
  created_at: string
  status: string
}

/** Tabla o RPC aún no creados en el proyecto Supabase (404 / PGRST205 / mensaje típico). */
export function isPasswordRecoveryUnavailable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  const code = String(error.code ?? '')
  const msg = String(error.message ?? '').toLowerCase()
  if (code === 'PGRST205' || code === '42P01') return true
  if (msg.includes('password_recovery_requests')) return true
  if (msg.includes('could not find the table') || msg.includes('schema cache')) return true
  if (msg.includes('does not exist') && msg.includes('relation')) return true
  if (msg.includes('404')) return true
  return false
}

export async function requestPasswordRecovery(username: string): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb.rpc('request_password_recovery', {
    p_username: username.trim().toLowerCase(),
  })
  if (error) {
    if (isPasswordRecoveryUnavailable(error)) {
      throw new Error(
        'La recuperación de contraseña aún no está configurada en el servidor. Ejecuta en Supabase el SQL: schema_password_recovery.sql y policies_password_recovery.sql',
      )
    }
    throw new Error(error.message || 'No se pudo registrar la solicitud')
  }
}

export async function fetchPendingPasswordRecoveryCount(): Promise<number> {
  const sb = getSupabase()
  const { count, error } = await sb
    .from('password_recovery_requests')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pendiente')
  if (error) {
    if (isPasswordRecoveryUnavailable(error)) return 0
    return 0
  }
  return count ?? 0
}

export async function fetchPendingPasswordRecoveries(): Promise<PasswordRecoveryRow[]> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('password_recovery_requests')
    .select('id, username, created_at, status')
    .eq('status', 'pendiente')
    .order('created_at', { ascending: false })
  if (error) {
    if (isPasswordRecoveryUnavailable(error)) return []
    throw new Error(error.message || 'No se pudieron cargar las solicitudes')
  }
  return (data as PasswordRecoveryRow[]) ?? []
}

export async function markPasswordRecoveryDone(id: string): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb.rpc('admin_mark_password_recovery_atendida', { p_id: id })
  if (error) {
    if (isPasswordRecoveryUnavailable(error)) {
      throw new Error(
        'Falta crear en Supabase las tablas/RPC de recuperación (schema_password_recovery.sql).',
      )
    }
    throw new Error(error.message || 'No se pudo marcar como atendida')
  }
}
