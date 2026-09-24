import { getSupabase } from './supabaseClient'
import { intervalDate, spanSeconds } from './intervalTime'
import { businessMinutesBetween } from './workHours'

export type BodegaWorkIntervalLane =
  | 'orden'
  | 'diseno'
  | 'cnc_programacion'
  | 'cnc_torno'
  | 'cnc_perfilado'
  | 'maquina_programacion'
  | 'maquina_torno'
  | 'maquina_perfilado'
  | 'armado'

export type BodegaWorkIntervalRow = {
  id: string
  project_id: string
  orden_compra_id: string | null
  actor_id: string | null
  lane: BodegaWorkIntervalLane
  started_at: string
  ended_at: string | null
  meta: Record<string, unknown> | null
  created_at: string
}

const LANES_ORDER: BodegaWorkIntervalLane[] = [
  'orden',
  'diseno',
  'cnc_programacion',
  'cnc_torno',
  'cnc_perfilado',
  'maquina_programacion',
  'maquina_torno',
  'maquina_perfilado',
  'armado',
]

export function laneLabelEs(lane: BodegaWorkIntervalLane): string {
  switch (lane) {
    case 'orden':
      return 'Orden (desde fecha OC)'
    case 'diseno':
      return 'Diseño'
    case 'cnc_programacion':
      return 'CNC — Programación'
    case 'cnc_torno':
      return 'CNC — Torno'
    case 'cnc_perfilado':
      return 'CNC — Perfilado'
    case 'maquina_programacion':
      return 'Máquina — Programación'
    case 'maquina_torno':
      return 'Máquina — Torno'
    case 'maquina_perfilado':
      return 'Máquina — Perfilado'
    case 'armado':
      return 'Armado'
    default:
      return lane
  }
}

export function orderedLaneLabels(): { lane: BodegaWorkIntervalLane; label: string }[] {
  return LANES_ORDER.map((lane) => ({ lane, label: laneLabelEs(lane) }))
}

export async function fetchWorkIntervalsForProjects(
  projectIds: string[],
): Promise<Map<string, BodegaWorkIntervalRow[]>> {
  const out = new Map<string, BodegaWorkIntervalRow[]>()
  if (projectIds.length === 0) return out
  const sb = getSupabase()
  const { data, error } = await sb
    .from('bodega_project_work_intervals')
    .select('id, project_id, orden_compra_id, actor_id, lane, started_at, ended_at, meta, created_at')
    .in('project_id', projectIds)
    .order('started_at', { ascending: true })
  if (error) {
    const msg = [error.message, error.details].filter(Boolean).join(' ')
    if (/does not exist|could not find|404|PGRST205/i.test(msg)) return out
    throw error
  }
  for (const row of (data as BodegaWorkIntervalRow[] | null) ?? []) {
    const pid = row.project_id
    if (!out.has(pid)) out.set(pid, [])
    out.get(pid)!.push(row)
  }
  return out
}

export async function fetchWorkIntervals(projectId: string): Promise<BodegaWorkIntervalRow[]> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('bodega_project_work_intervals')
    .select('id, project_id, orden_compra_id, actor_id, lane, started_at, ended_at, meta, created_at')
    .eq('project_id', projectId)
    .order('started_at', { ascending: true })
  if (error) {
    const msg = [error.message, error.details].filter(Boolean).join(' ')
    if (/does not exist|could not find|404|PGRST205/i.test(msg)) return []
    throw error
  }
  return (data as BodegaWorkIntervalRow[] | null) ?? []
}

/** Inicia intervalo manual (diseño, CNC por módulo, armado). Idempotente si ya hay uno abierto del mismo actor. */
export async function startWorkInterval(projectId: string, lane: BodegaWorkIntervalLane): Promise<string | null> {
  const sb = getSupabase()
  const { data, error } = await sb.rpc('bodega_work_interval_start', {
    p_project_id: projectId,
    p_lane: lane,
  })
  if (error) throw error
  if (data == null) return null
  return String(data)
}

/**
 * Suma minutos hábiles (lun–vie 8:00–17:30) por carril.
 * Intervalos abiertos (ended_at null) cuentan hasta `nowRef`.
 */
export function aggregateBusinessMinutesByLane(
  rows: BodegaWorkIntervalRow[],
  nowRef: Date = new Date(),
): Map<BodegaWorkIntervalLane, number> {
  const m = new Map<BodegaWorkIntervalLane, number>()
  for (const r of rows) {
    const start = intervalDate(r.started_at)
    if (!start) continue
    const end = r.ended_at ? intervalDate(r.ended_at) ?? nowRef : nowRef
    const mins = businessMinutesBetween(start, end)
    if (mins <= 0) continue
    const lane = r.lane as BodegaWorkIntervalLane
    m.set(lane, (m.get(lane) ?? 0) + mins)
  }
  return m
}

/** Minutos de reloj real por carril (misma base que el cronómetro). */
export function aggregateWallMinutesByLane(
  rows: BodegaWorkIntervalRow[],
  nowRef: Date = new Date(),
): Map<BodegaWorkIntervalLane, number> {
  const m = new Map<BodegaWorkIntervalLane, number>()
  const nowMs = nowRef.getTime()
  for (const r of rows) {
    const mins = spanSeconds(r.started_at, r.ended_at, nowMs) / 60
    if (mins < 1 / 60) continue
    const lane = r.lane as BodegaWorkIntervalLane
    m.set(lane, (m.get(lane) ?? 0) + mins)
  }
  return m
}

/** Segundos de reloj real para un carril de proyecto (diseño, CNC oficina, armado, etc.). */
export function workLaneElapsedSeconds(
  rows: BodegaWorkIntervalRow[],
  lane: BodegaWorkIntervalLane,
  nowRef: Date = new Date(),
): number {
  let total = 0
  const nowMs = nowRef.getTime()
  for (const r of rows) {
    if (r.lane !== lane) continue
    total += spanSeconds(r.started_at, r.ended_at, nowMs)
  }
  return total
}

export function formatWorkMinutesShort(mins: number): string {
  if (!Number.isFinite(mins) || mins < 1) return '—'
  const m = Math.round(mins)
  const h = Math.floor(m / 60)
  const r = m % 60
  if (h === 0) return `${r}m`
  if (r === 0) return `${h}h`
  return `${h}h ${r}m`
}
