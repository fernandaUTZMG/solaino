import { getSupabase } from './supabaseClient'

/**
 * Registra acciones del cliente (no automáticas por triggers).
 * Requiere que exista la función `public.audit_write` y permisos de ejecución.
 */
export async function logClientAction(args: {
  action: string
  tableName?: string | null
  recordId?: string | null
  metadata?: Record<string, unknown> | null
}): Promise<void> {
  try {
    const sb = getSupabase()
    await sb.rpc('audit_write', {
      p_action: args.action,
      p_table_name: args.tableName ?? null,
      p_record_id: args.recordId ?? null,
      p_metadata: args.metadata ?? null,
    })
  } catch {
    // Best-effort: no bloquea la app si no hay permisos/config.
  }
}

