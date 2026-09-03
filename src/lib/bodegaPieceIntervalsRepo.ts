import { getSupabase } from './supabaseClient'
import { businessMinutesBetween } from './workHours'

export type BodegaPieceLane =
  | 'programacion_cnc'
  | 'programacion_torno'
  | 'perfilado_operador'
  | 'maquinado'
  | 'armado'
  | 'detallado'

export type BodegaPieceIntervalRow = {
  id: string
  piece_id: string
  actor_id: string | null
  lane: BodegaPieceLane
  started_at: string
  ended_at: string | null
  meta: Record<string, unknown> | null
  created_at: string
}

export function pieceHasOpenInterval(
  intervals: BodegaPieceIntervalRow[],
  pieceId: string,
  lane: BodegaPieceLane,
): boolean {
  return intervals.some((r) => r.piece_id === pieceId && r.lane === lane && r.ended_at == null)
}

export function pieceLaneLabelEs(lane: BodegaPieceLane): string {
  switch (lane) {
    case 'programacion_cnc':
      return 'Programación CNC'
    case 'programacion_torno':
      return 'Programación torno'
    case 'perfilado_operador':
      return 'Perfilado (operador)'
    case 'maquinado':
      return 'Maquinado'
    case 'armado':
      return 'Armado'
    case 'detallado':
      return 'Detallado'
    default:
      return lane
  }
}

export async function fetchPieceIntervalsForProjects(
  projectIds: string[],
): Promise<Map<string, BodegaPieceIntervalRow[]>> {
  const out = new Map<string, BodegaPieceIntervalRow[]>()
  if (projectIds.length === 0) return out
  const sb = getSupabase()
  const { data: pieces, error: pe } = await sb
    .from('bodega_project_pieces')
    .select('id, project_id')
    .in('project_id', projectIds)
  if (pe) throw pe
  const pieceList = (pieces as Array<{ id: string; project_id: string }> | null) ?? []
  const pieceToProject = new Map(pieceList.map((p) => [p.id, p.project_id]))
  const pieceIds = pieceList.map((p) => p.id)
  if (pieceIds.length === 0) return out
  const { data, error } = await sb
    .from('bodega_piece_work_intervals')
    .select('id, piece_id, actor_id, lane, started_at, ended_at, meta, created_at')
    .in('piece_id', pieceIds)
    .order('started_at', { ascending: true })
  if (error) {
    const msg = [error.message, error.details].filter(Boolean).join(' ')
    if (/does not exist|could not find|404|PGRST205/i.test(msg)) return out
    throw error
  }
  for (const row of (data as BodegaPieceIntervalRow[] | null) ?? []) {
    const pid = pieceToProject.get(row.piece_id)
    if (!pid) continue
    if (!out.has(pid)) out.set(pid, [])
    out.get(pid)!.push(row)
  }
  return out
}

export async function fetchPieceIntervals(pieceId: string): Promise<BodegaPieceIntervalRow[]> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('bodega_piece_work_intervals')
    .select('id, piece_id, actor_id, lane, started_at, ended_at, meta, created_at')
    .eq('piece_id', pieceId)
    .order('started_at', { ascending: true })
  if (error) {
    const msg = [error.message, error.details].filter(Boolean).join(' ')
    if (/does not exist|could not find|404|PGRST205/i.test(msg)) return []
    throw error
  }
  return (data as BodegaPieceIntervalRow[] | null) ?? []
}

export async function fetchPieceIntervalsForProject(projectId: string): Promise<BodegaPieceIntervalRow[]> {
  const sb = getSupabase()
  const { data: pieces, error: pe } = await sb.from('bodega_project_pieces').select('id').eq('project_id', projectId)
  if (pe) throw pe
  const ids = (pieces as Array<{ id: string }> | null)?.map((p) => p.id) ?? []
  if (ids.length === 0) return []
  const { data, error } = await sb
    .from('bodega_piece_work_intervals')
    .select('id, piece_id, actor_id, lane, started_at, ended_at, meta, created_at')
    .in('piece_id', ids)
    .order('started_at', { ascending: true })
  if (error) throw error
  return (data as BodegaPieceIntervalRow[] | null) ?? []
}

export async function startPieceInterval(pieceId: string, lane: BodegaPieceLane): Promise<string | null> {
  const sb = getSupabase()
  const { data, error } = await sb.rpc('bodega_piece_interval_start', {
    p_piece_id: pieceId,
    p_lane: lane,
  })
  if (error) throw error
  if (data == null) return null
  return String(data)
}

export async function endPieceInterval(pieceId: string, lane: BodegaPieceLane): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb.rpc('bodega_piece_interval_end', { p_piece_id: pieceId, p_lane: lane })
  if (error) throw error
}

function isIntervalCloseAllRpcMissing(err: { message?: string; details?: string; code?: string }): boolean {
  const msg = [err.message, err.details, err.code].filter(Boolean).join(' ')
  return (
    err.code === 'PGRST202' ||
    /bodega_piece_interval_close_all|function.*does not exist|could not find/i.test(msg)
  )
}

/** Cierra todos los relojes abiertos del carril (no solo el del usuario actual). */
export async function closeAllOpenPieceIntervals(pieceId: string, lane: BodegaPieceLane): Promise<void> {
  const sb = getSupabase()
  const { error: closeAllErr } = await sb.rpc('bodega_piece_interval_close_all', {
    p_piece_id: pieceId,
    p_lane: lane,
  })
  if (!closeAllErr) return

  if (!isIntervalCloseAllRpcMissing(closeAllErr)) {
    throw closeAllErr
  }

  await endPieceInterval(pieceId, lane)
}

/** Segundos de reloj real (no minutos hábiles) para una pieza y carril. */
export function pieceLaneElapsedSeconds(
  rows: BodegaPieceIntervalRow[],
  pieceId: string,
  lane: BodegaPieceLane,
  nowRef: Date = new Date(),
): number {
  let total = 0
  const nowMs = nowRef.getTime()
  for (const r of rows) {
    if (r.piece_id !== pieceId || r.lane !== lane) continue
    const start = new Date(r.started_at).getTime()
    const end = r.ended_at ? new Date(r.ended_at).getTime() : nowMs
    total += Math.max(0, Math.floor((end - start) / 1000))
  }
  return total
}

export function aggregatePieceMinutesByLane(
  rows: BodegaPieceIntervalRow[],
  nowRef: Date = new Date(),
): Map<BodegaPieceLane, number> {
  const m = new Map<BodegaPieceLane, number>()
  for (const r of rows) {
    const start = new Date(r.started_at)
    const end = r.ended_at ? new Date(r.ended_at) : nowRef
    const mins = businessMinutesBetween(start, end)
    if (mins <= 0) continue
    const lane = r.lane as BodegaPieceLane
    m.set(lane, (m.get(lane) ?? 0) + mins)
  }
  return m
}
