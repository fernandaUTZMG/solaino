import { businessMinutesBetween } from './workHours'
import type { ProjectActivityRow } from './projectActivityRepo'

/** Fila mínima de proyecto para cálculos (compatible con `BodegaProjectRow` en BodegaPage). */
export type BodegaProjectTimingRow = {
  fecha_inicio: string
  fecha_termino: string | null
  created_at: string
  updated_at: string | null
  status: string
}

function parseDateSafe(s: string | null | undefined): Date | null {
  if (s == null || String(s).trim() === '') return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

function finishDateForProject(r: BodegaProjectTimingRow): Date {
  const ft = parseDateSafe(r.fecha_termino)
  if (ft) return ft
  const up = parseDateSafe(r.updated_at)
  if (up) return up
  return parseDateSafe(r.created_at) ?? new Date(0)
}

function payloadStatus(payload: Record<string, unknown> | null): string | null {
  if (!payload || typeof payload !== 'object') return null
  const s = payload.status
  if (typeof s !== 'string' || !s.trim()) return null
  return s.trim()
}

export type PhaseSplitSource = 'activity' | 'sin_actividad'

export type ProjectPhaseBusinessMinutes = {
  designMin: number
  cncMin: number
  totalMin: number
  source: PhaseSplitSource
}

/**
 * Diseño: desde inicio del proyecto hasta diseño aprobado o inicio de CNC (lo que ocurra antes en el historial).
 * CNC: desde primer `en_programacion` o primera subida `machine_uploaded` hasta cierre.
 * Horario: lun–vie 8:00–17:30 (`businessMinutesBetween`).
 */
export function computeProjectPhaseBusinessMinutes(
  row: BodegaProjectTimingRow,
  activities: ProjectActivityRow[] | undefined,
  nowOverride?: Date,
): ProjectPhaseBusinessMinutes {
  const tStart = parseDateSafe(row.fecha_inicio) ?? parseDateSafe(row.created_at)
  const tEndRaw = row.status === 'terminado' ? finishDateForProject(row) : (nowOverride ?? new Date())
  if (!tStart) {
    return { designMin: 0, cncMin: 0, totalMin: 0, source: 'sin_actividad' }
  }

  const totalMin = businessMinutesBetween(tStart, tEndRaw)

  const list = (activities ?? []).filter((a) => a.project_id)
  if (list.length === 0) {
    return { designMin: totalMin, cncMin: 0, totalMin, source: 'sin_actividad' }
  }

  const chronological = [...list].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

  let tDisenoAprobado: Date | null = null
  let tEnProgramacion: Date | null = null
  let tMachineUpload: Date | null = null

  for (const a of chronological) {
    if (a.type === 'status_changed') {
      const st = payloadStatus(a.payload as Record<string, unknown> | null)
      if (!st) continue
      const t = new Date(a.created_at)
      if (st === 'diseno_aprobado' && !tDisenoAprobado) tDisenoAprobado = t
      if (st === 'en_programacion' && !tEnProgramacion) tEnProgramacion = t
    }
    if (a.type === 'machine_uploaded' && !tMachineUpload) {
      tMachineUpload = new Date(a.created_at)
    }
  }

  const cncStart = tEnProgramacion ?? tMachineUpload

  let designEnd: Date
  if (tDisenoAprobado && cncStart) {
    designEnd = tDisenoAprobado.getTime() <= cncStart.getTime() ? tDisenoAprobado : cncStart
  } else {
    designEnd = tDisenoAprobado ?? cncStart ?? tEndRaw
  }

  const designMin = businessMinutesBetween(tStart, designEnd)
  const cncMin = cncStart ? businessMinutesBetween(cncStart, tEndRaw) : 0

  return {
    designMin,
    cncMin,
    totalMin,
    source: 'activity',
  }
}

export function formatBusinessMinutesShort(mins: number): string {
  if (!Number.isFinite(mins) || mins < 1) return '—'
  const m = Math.round(mins)
  const h = Math.floor(m / 60)
  const r = m % 60
  if (h === 0) return `${r}m`
  if (r === 0) return `${h}h`
  return `${h}h ${r}m`
}
