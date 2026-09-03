import { businessMinutesBetween } from './workHours'
import { formatWorkMinutesShort, type BodegaWorkIntervalRow } from './bodegaWorkIntervalsRepo'

export type DesignTimePhase = 'inicial' | 'correccion' | 'otro'

export type DesignTimeRound = {
  phase: DesignTimePhase
  round: number
  label: string
  businessMinutes: number
  startedAt: string
  endedAt: string | null
  isOpen: boolean
}

function phaseFromMeta(meta: Record<string, unknown> | null): DesignTimePhase {
  const phase = meta?.phase
  if (phase === 'correccion') return 'correccion'
  if (phase === 'inicial') return 'inicial'
  const openedBy = meta?.opened_by
  if (openedBy === 'design_partial_review') return 'correccion'
  const closedBy = meta?.closed_by
  if (closedBy === 'design_zip_correction_upload') return 'correccion'
  if (closedBy === 'design_zip_upload') return 'inicial'
  return 'otro'
}

function roundFromMeta(meta: Record<string, unknown> | null, fallback: number): number {
  const r = meta?.correction_round
  if (typeof r === 'number' && Number.isFinite(r) && r >= 1) return Math.trunc(r)
  if (typeof r === 'string' && /^\d+$/.test(r)) return Number(r)
  return fallback
}

function roundLabel(phase: DesignTimePhase, round: number): string {
  if (phase === 'inicial') return 'Diseño inicial'
  if (phase === 'correccion') {
    return round <= 1 ? 'Corrección (ronda 1)' : `Corrección (ronda ${round})`
  }
  return 'Diseño (otros intervalos)'
}

/** Desglosa intervalos del carril «diseno» en rondas legibles para reportes y UI. */
export function computeDesignTimeRounds(
  rows: BodegaWorkIntervalRow[],
  nowRef: Date = new Date(),
): DesignTimeRound[] {
  const designRows = rows
    .filter((r) => r.lane === 'diseno')
    .sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime())

  let correctionIndex = 0
  return designRows.map((r, idx) => {
    const meta = (r.meta ?? {}) as Record<string, unknown>
    let phase = phaseFromMeta(meta)
    if (phase === 'otro' && idx === 0) phase = 'inicial'
    if (phase === 'otro' && idx > 0) phase = 'correccion'

    let round = roundFromMeta(meta, 1)
    if (phase === 'correccion' && meta.correction_round == null) {
      correctionIndex += 1
      round = correctionIndex
    } else if (phase === 'inicial') {
      round = 1
    }

    const start = new Date(r.started_at)
    const end = r.ended_at ? new Date(r.ended_at) : nowRef
    const businessMinutes = businessMinutesBetween(start, end)

    return {
      phase,
      round,
      label: roundLabel(phase, round),
      businessMinutes,
      startedAt: r.started_at,
      endedAt: r.ended_at,
      isOpen: r.ended_at == null,
    }
  })
}

export function totalDesignBusinessMinutes(rounds: DesignTimeRound[]): number {
  return rounds.reduce((s, r) => s + r.businessMinutes, 0)
}

export function formatDesignTimeSummary(rounds: DesignTimeRound[]): string {
  const total = totalDesignBusinessMinutes(rounds)
  if (total < 1) return '—'
  const open = rounds.some((r) => r.isOpen)
  return open ? `${formatWorkMinutesShort(total)} (activo)` : formatWorkMinutesShort(total)
}

export function designClockShouldBeActive(projectStatus: string): boolean {
  return ['pendiente', 'en_diseno', 'modificacion_diseno', 'diseno_parcial'].includes(projectStatus)
}

export function designClockPausedForReview(projectStatus: string): boolean {
  return projectStatus === 'revision_diseno'
}
