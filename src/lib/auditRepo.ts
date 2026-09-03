import { getSupabase } from './supabaseClient'

export type AuditRow = {
  id: number
  created_at: string
  actor_id: string | null
  actor_email: string | null
  action: string
  table_name: string | null
  record_id: string | null
  metadata: Record<string, unknown> | null
}

export async function fetchAuditLog(limit = 200): Promise<AuditRow[]> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data as AuditRow[] | null) ?? []
}

export async function fetchAuditLogByActor(actorId: string, limit = 200): Promise<AuditRow[]> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('audit_log')
    .select('*')
    .eq('actor_id', actorId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data as AuditRow[] | null) ?? []
}

/** Solo administrador mayor (RPC `clear_audit_log`). */
export async function clearAuditLogForActor(actorId: string): Promise<number> {
  const sb = getSupabase()
  const { data, error } = await sb.rpc('clear_audit_log', { p_actor_id: actorId })
  if (error) throw error
  const n = data as number | string | null
  return typeof n === 'number' ? n : Number(n ?? 0)
}

