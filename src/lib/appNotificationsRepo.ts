import { getSupabase } from './supabaseClient'

export type DesignCorrectionPiecePayload = {
  source_path?: string
  label?: string
  feedback?: string | null
}

export type AppNotificationRow = {
  id: string
  kind: string
  title: string
  body: string
  payload: {
    project_id?: string
    folio?: string
    proyecto_nombre?: string
    old_nivel?: number
    new_nivel?: number
    design_version?: number
    project_status?: string
    pieces_to_correct?: DesignCorrectionPiecePayload[]
    rejected_count?: number
    approved_count?: number
    tab?: string
  }
  read_at: string | null
  created_at: string
}

export const APP_NOTIFICATIONS_PATCH = 'supabase/patch_app_notifications.sql'

function mapRow(r: Record<string, unknown>): AppNotificationRow {
  const payload = (r.payload as Record<string, unknown> | null) ?? {}
  const rawPieces = payload.pieces_to_correct
  const pieces_to_correct = Array.isArray(rawPieces)
    ? rawPieces
        .filter((x): x is Record<string, unknown> => x != null && typeof x === 'object')
        .map((x) => ({
          source_path: x.source_path != null ? String(x.source_path) : undefined,
          label: x.label != null ? String(x.label) : undefined,
          feedback: x.feedback != null ? String(x.feedback) : null,
        }))
    : undefined
  return {
    id: String(r.id),
    kind: String(r.kind ?? ''),
    title: String(r.title ?? ''),
    body: String(r.body ?? ''),
    payload: {
      project_id: payload.project_id != null ? String(payload.project_id) : undefined,
      folio: payload.folio != null ? String(payload.folio) : undefined,
      proyecto_nombre: payload.proyecto_nombre != null ? String(payload.proyecto_nombre) : undefined,
      old_nivel: typeof payload.old_nivel === 'number' ? payload.old_nivel : undefined,
      new_nivel: typeof payload.new_nivel === 'number' ? payload.new_nivel : undefined,
      design_version: typeof payload.design_version === 'number' ? payload.design_version : undefined,
      project_status: payload.project_status != null ? String(payload.project_status) : undefined,
      pieces_to_correct,
      rejected_count: typeof payload.rejected_count === 'number' ? payload.rejected_count : undefined,
      approved_count: typeof payload.approved_count === 'number' ? payload.approved_count : undefined,
      tab: payload.tab != null ? String(payload.tab) : undefined,
    },
    read_at: r.read_at != null ? String(r.read_at) : null,
    created_at: String(r.created_at ?? ''),
  }
}

function isNotificationsUnavailable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  const msg = String(error.message ?? '').toLowerCase()
  if (error.code === 'PGRST205' || error.code === '42P01') return true
  if (msg.includes('app_notifications')) return true
  if (msg.includes('notify_bodega_project_prioridad')) return true
  if (msg.includes('could not find') && msg.includes('function')) return true
  return false
}

export async function fetchUnreadAppNotifications(limit = 30): Promise<AppNotificationRow[]> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('app_notifications')
    .select('id, kind, title, body, payload, read_at, created_at')
    .is('read_at', null)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) {
    if (isNotificationsUnavailable(error)) return []
    throw error
  }
  return ((data as Record<string, unknown>[]) ?? []).map(mapRow)
}

export async function fetchUnreadAppNotificationCount(): Promise<number> {
  const sb = getSupabase()
  const { count, error } = await sb
    .from('app_notifications')
    .select('*', { count: 'exact', head: true })
    .is('read_at', null)
  if (error) {
    if (isNotificationsUnavailable(error)) return 0
    throw error
  }
  return count ?? 0
}

export async function markAppNotificationRead(id: string): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb
    .from('app_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .is('read_at', null)
  if (error) throw error
}

export async function markAllAppNotificationsRead(): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb
    .from('app_notifications')
    .update({ read_at: new Date().toISOString() })
    .is('read_at', null)
  if (error) throw error
}
