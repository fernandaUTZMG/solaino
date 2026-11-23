import type { BodegaProjectPieceRow } from './bodegaPiecesRepo'
import { weeklyPlanStageLabelEs, type WeeklyPlanStageId, type WeeklyPlanStageProgress } from './bodegaWeeklyPlanProgress'

type WeekFocusItem = {
  project_id: string | null
  proyecto_nombre: string
  projectFolio: string | null
  actual: WeeklyPlanStageProgress
  projectTerminado: boolean
  lagStages: WeeklyPlanStageId[]
  fecha_entrega: string | null
  delay_reason: string
  /** En foto, con otro taller: no entra al porcentaje de esta semana. */
  externalShop?: boolean
}

export type WeekStageMark = 'esta_semana' | 'ya_estaba' | 'falta'

export type WeeklyPlanWeekJob = {
  name: string
  done: string[]
  missing: string[]
  behind: string[]
  workOn: string[]
}

export type WeeklyPlanWeekFocus = {
  meta: number
  real: number
  jobs: WeeklyPlanWeekJob[]
}

type Window = { startMs: number; endMs: number }

/** Lunes 00:00 a viernes 17:30, hora de la Ciudad de México. */
export function weeklyPlanWindow(weekStart: string): Window {
  const [y, m, d] = weekStart.split('-').map(Number)
  return {
    startMs: Date.UTC(y, (m ?? 1) - 1, d ?? 1, 6, 0, 0),
    endMs: Date.UTC(y, (m ?? 1) - 1, (d ?? 1) + 4, 23, 30, 0),
  }
}

function fridayKey(weekStart: string): string {
  const [y, m, d] = weekStart.split('-').map(Number)
  const friday = new Date(Date.UTC(y, (m ?? 1) - 1, (d ?? 1) + 4))
  return friday.toISOString().slice(0, 10)
}

function stampMs(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : null
}

function inWeek(iso: string | null | undefined, window: Window): boolean {
  const t = stampMs(iso)
  return t != null && t >= window.startMs && t <= window.endMs
}

function beforeWeek(iso: string | null | undefined, window: Window): boolean {
  const t = stampMs(iso)
  return t != null && t < window.startMs
}

function pieceName(piece: BodegaProjectPieceRow): string {
  const label = piece.label?.trim()
  if (label) return label
  const path = piece.source_path?.split(/[/\\]/).pop()?.trim()
  return path || 'Pieza'
}

function stageStamp(piece: BodegaProjectPieceRow, stage: WeeklyPlanStageId): string | null {
  if (stage === 'diseno') return piece.design_approved_at || piece.design_drawing_uploaded_at
  if (stage === 'programacion') return piece.programming_finished_at
  if (stage === 'maquinado') return piece.maquinado_completed_at
  return piece.armado_completed_at
}

function stagePieces(pieces: BodegaProjectPieceRow[], stage: WeeklyPlanStageId): BodegaProjectPieceRow[] {
  if (stage === 'maquinado') {
    const needing = pieces.filter((piece) => piece.programmer_bucket === 'cnc' && piece.programming_exit_kind === 'archivo_adjunto')
    return needing.length > 0 ? needing : pieces
  }
  if (stage === 'programacion') {
    const needing = pieces.filter((piece) => piece.programmer_bucket === 'cnc' || piece.programmer_bucket === 'torno')
    return needing.length > 0 ? needing : pieces
  }
  return pieces
}

export function weekStageMark(
  stage: WeeklyPlanStageId,
  pieces: BodegaProjectPieceRow[],
  actualPct: number,
  finalizedAt: string | null,
  window: Window,
): WeekStageMark {
  if (inWeek(finalizedAt, window)) return 'esta_semana'
  const scoped = stagePieces(pieces, stage)
  if (scoped.some((piece) => inWeek(stageStamp(piece, stage), window))) return 'esta_semana'
  if (beforeWeek(finalizedAt, window) || actualPct >= 100) return 'ya_estaba'
  return 'falta'
}

function namesDone(pieces: BodegaProjectPieceRow[], stage: WeeklyPlanStageId, window: Window): string[] {
  return stagePieces(pieces, stage)
    .filter((piece) => inWeek(stageStamp(piece, stage), window))
    .map(pieceName)
}

export function buildWeeklyPlanWeekFocus(args: {
  weekStart: string
  items: WeekFocusItem[]
  piecesByProject: Map<string, BodegaProjectPieceRow[]>
  finalizedAtByProject: Map<string, string | null>
}): WeeklyPlanWeekFocus {
  const window = weeklyPlanWindow(args.weekStart)
  const stages: WeeklyPlanStageId[] = ['diseno', 'programacion', 'maquinado', 'armado']
  const jobs: WeeklyPlanWeekJob[] = []
  const scores: number[] = []

  const inShop = args.items.filter((item) => !item.externalShop)
  for (const item of inShop) {
    const pieces = item.project_id ? args.piecesByProject.get(item.project_id) ?? [] : []
    const finalizedAt = item.project_id ? args.finalizedAtByProject.get(item.project_id) ?? null : null
    const name = item.projectFolio ? `${item.proyecto_nombre} (${item.projectFolio})` : item.proyecto_nombre || 'Sin nombre'
    const done: string[] = []
    const missing: string[] = []
    const workOn: string[] = []
    const stageScores: number[] = []

    if (inWeek(finalizedAt, window)) done.push('Se entregó el proyecto')

    for (const stage of stages) {
      const label = weeklyPlanStageLabelEs(stage)
      const mark = weekStageMark(stage, pieces, item.actual[stage], finalizedAt, window)
      const finishedNames = namesDone(pieces, stage, window)
      if (finishedNames.length > 0) {
        const shown = finishedNames.slice(0, 3).join(', ')
        const extra = finishedNames.length > 3 ? ` y ${finishedNames.length - 3} más` : ''
        done.push(`${label}: ${shown}${extra}`)
      }
      if (mark === 'ya_estaba') continue
      const closed = finishedNames.length
      const pending = stagePieces(pieces, stage).filter((piece) => !beforeWeek(stageStamp(piece, stage), window))
      const total = Math.max(pending.length, closed)
      const pct = mark === 'esta_semana' && item.actual[stage] >= 100 ? 100 : total === 0 ? 0 : Math.round((closed / total) * 100)
      stageScores.push(pct)
      if (pct < 100) {
        missing.push(`${label} va en ${item.actual[stage]}%`)
        workOn.push(label)
      }
    }

    if (stageScores.length > 0) {
      scores.push(Math.round(stageScores.reduce((sum, value) => sum + value, 0) / stageScores.length))
    }

    const behind: string[] = []
    if (!item.projectTerminado && item.lagStages.length > 0) {
      behind.push(`Atraso en ${item.lagStages.map((stage) => weeklyPlanStageLabelEs(stage).toLowerCase()).join(', ')}`)
    }
    const friday = fridayKey(args.weekStart)
    if (!item.projectTerminado && item.fecha_entrega && item.fecha_entrega <= friday) {
      behind.push(`La entrega queda en esta semana o ya pasó (${item.fecha_entrega})`)
    }
    if (item.delay_reason.trim()) behind.push(item.delay_reason.trim())

    if (done.length > 0 || missing.length > 0 || behind.length > 0) {
      jobs.push({ name, done, missing, behind, workOn })
    }
  }

  const real = scores.length === 0 ? 0 : Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length)
  return {
    meta: inShop.length === 0 ? 0 : 100,
    real,
    jobs,
  }
}

export function weekStageMarkLabel(mark: WeekStageMark): string {
  if (mark === 'esta_semana') return 'Esta semana'
  if (mark === 'ya_estaba') return 'Ya estaba'
  return 'Falta'
}
