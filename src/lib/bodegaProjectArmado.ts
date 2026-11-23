import { pieceEligibleForDetallado, type BodegaProjectPieceRow } from './bodegaPiecesRepo'
import type { BodegaWorkIntervalRow } from './bodegaWorkIntervalsRepo'
import { intervalDate } from './intervalTime'
import { businessSecondsBetween } from './workHours'

/** Por qué la pieza todavía no puede entrar al armado del proyecto. Null = ya está. */
export function pieceNotReadyForProjectArmado(p: BodegaProjectPieceRow): string | null {
  if (!p.programmer_bucket) return 'Sin destino'
  // Perfilado no lleva reloj: pasa al armado igual que torno y accesorios.
  if (p.programmer_bucket === 'accesorios' || p.programmer_bucket === 'torno' || p.programmer_bucket === 'perfilado') {
    return null
  }
  if (p.programming_finished_at == null) return 'Aún en programación'
  if (p.programming_exit_kind === 'archivo_adjunto' && p.maquinado_completed_at == null) return 'Aún en maquinado'
  if (pieceEligibleForDetallado(p)) return 'Aún en detallado'
  return null
}

export function projectPiecesReadyForArmado(pieces: BodegaProjectPieceRow[]): boolean {
  return pieces.length > 0 && pieces.every((p) => pieceNotReadyForProjectArmado(p) == null)
}

export function projectArmadoIntervals(rows: BodegaWorkIntervalRow[]): BodegaWorkIntervalRow[] {
  return rows.filter((r) => r.lane === 'armado')
}

export function projectArmadoClockOpen(rows: BodegaWorkIntervalRow[]): boolean {
  return projectArmadoIntervals(rows).some((r) => r.ended_at == null)
}

function latestArmadoInterval(rows: BodegaWorkIntervalRow[]): BodegaWorkIntervalRow | null {
  const armado = projectArmadoIntervals(rows)
  if (armado.length === 0) return null
  return [...armado].sort((a, b) => a.started_at.localeCompare(b.started_at)).at(-1) ?? null
}

function armadoStopKind(row: BodegaWorkIntervalRow | null): string | null {
  const raw = row?.meta?.armado_stop
  return typeof raw === 'string' ? raw : null
}

/** El reloj se detuvo con Parar. El armado no está terminado. */
export function projectArmadoClockPaused(rows: BodegaWorkIntervalRow[]): boolean {
  if (projectArmadoClockOpen(rows)) return false
  const latest = latestArmadoInterval(rows)
  if (!latest?.ended_at) return false
  return armadoStopKind(latest) === 'pause'
}

/** El reloj de armado del proyecto ya se cerró con Fin. Ahí pasa a la foto. */
export function projectArmadoClockClosed(rows: BodegaWorkIntervalRow[]): boolean {
  const armado = projectArmadoIntervals(rows)
  if (armado.length === 0 || armado.some((r) => r.ended_at == null)) return false
  return !projectArmadoClockPaused(rows)
}

export function projectArmadoBusinessSeconds(rows: BodegaWorkIntervalRow[], now: Date): number {
  let seconds = 0
  for (const row of projectArmadoIntervals(rows)) {
    const start = intervalDate(row.started_at)
    if (!start) continue
    const end = row.ended_at ? intervalDate(row.ended_at) ?? now : now
    seconds += businessSecondsBetween(start, end)
  }
  return seconds
}
