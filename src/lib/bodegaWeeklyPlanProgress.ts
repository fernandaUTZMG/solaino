import type { BodegaPieceIntervalRow } from './bodegaPieceIntervalsRepo'
import type { BodegaWorkIntervalRow } from './bodegaWorkIntervalsRepo'
import { pieceDesignApproved } from './bodegaDesignPieceReview'
import { programmingEligiblePieces } from './bodegaProgrammerFlow'
import {
  pieceNeedsMaquinado,
  pieceProgramacionComplete,
  pieceStageComplete,
  pieceTiemposComplete,
} from './bodegaProjectPipelineProgress'
import type { BodegaProjectPieceRow } from './bodegaPiecesRepo'
import type { ProjectPiecePhotoRow } from './piecePhotosRepo'
import { isSwPartZipPath } from './zipDesignPackage'

export type WeeklyPlanStageId = 'diseno' | 'programacion' | 'maquinado' | 'armado'

export const WEEKLY_PLAN_STAGES: readonly WeeklyPlanStageId[] = [
  'diseno',
  'programacion',
  'maquinado',
  'armado',
]

export function weeklyPlanStageLabelEs(stage: WeeklyPlanStageId): string {
  switch (stage) {
    case 'diseno':
      return 'Diseño'
    case 'programacion':
      return 'Programación'
    case 'maquinado':
      return 'Maquinado'
    case 'armado':
      return 'Armado'
    default:
      return stage
  }
}

export type WeeklyPlanStageProgress = Record<WeeklyPlanStageId, number>

const DISENO_COMPLETE_STATUSES = new Set([
  'terminado',
  'en_foto',
  'revision_programacion',
  'en_programacion',
  'diseno_aprobado',
])

function designCadPieces(pieces: BodegaProjectPieceRow[]): BodegaProjectPieceRow[] {
  return pieces.filter((p) => p.source_path && isSwPartZipPath(p.source_path))
}

function designStatusBaselinePct(projectStatus: string): number {
  switch (projectStatus) {
    case 'pendiente':
      return 0
    case 'en_diseno':
      return 15
    case 'modificacion_diseno':
      return 25
    case 'revision_diseno':
      return 45
    case 'diseno_parcial':
      return 65
    default:
      return 0
  }
}

/** % real de diseño según piezas (aprobación, tratamiento, plano adjunto) o estado del proyecto. */
export function computeDisenoWeeklyActualPct(
  projectStatus: string,
  pieces: BodegaProjectPieceRow[],
): number {
  if (DISENO_COMPLETE_STATUSES.has(projectStatus)) return 100

  const cadPieces = designCadPieces(pieces)
  if (cadPieces.length > 0) {
    let sum = 0
    for (const p of cadPieces) {
      let pct = 0
      if (pieceDesignApproved(p)) pct += 34
      if (p.finish_spec) pct += 33
      if (p.design_drawing_storage_path && p.design_drawing_name) pct += 33
      sum += pct
    }
    return Math.round(sum / cadPieces.length)
  }

  return designStatusBaselinePct(projectStatus)
}

function weeklyProgramacionPiecePct(
  piece: BodegaProjectPieceRow,
  intervals: BodegaPieceIntervalRow[],
  routesConfirmed: boolean,
): number {
  if (!routesConfirmed || piece.programmer_bucket == null) return 0
  const prog = pieceProgramacionComplete(piece, routesConfirmed) ? 50 : 0
  const tiempos = pieceTiemposComplete(piece, intervals, routesConfirmed) ? 50 : 0
  return prog + tiempos
}

function weeklyArmadoPiecePct(
  piece: BodegaProjectPieceRow,
  intervals: BodegaPieceIntervalRow[],
  photos: ProjectPiecePhotoRow[],
  routesConfirmed: boolean,
): number {
  const det = pieceStageComplete({
    piece,
    stage: 'detallado',
    intervals,
    photos,
    routesConfirmed,
  })
    ? 34
    : 0
  const arm = pieceStageComplete({
    piece,
    stage: 'armado',
    intervals,
    photos,
    routesConfirmed,
  })
    ? 33
    : 0
  const fot = pieceStageComplete({
    piece,
    stage: 'fotos',
    intervals,
    photos,
    routesConfirmed,
  })
    ? 33
    : 0
  return det + arm + fot
}

function weeklyMaquinadoActualPct(
  workPieces: BodegaProjectPieceRow[],
  intervals: BodegaPieceIntervalRow[],
  routesConfirmed: boolean,
): number {
  const needing = workPieces.filter((p) => pieceNeedsMaquinado(p))
  if (needing.length === 0) {
    if (workPieces.length === 0) return 0
    const tiemposDone = workPieces.filter((p) =>
      pieceTiemposComplete(p, intervals, routesConfirmed),
    ).length
    return Math.round((tiemposDone / workPieces.length) * 100)
  }
  const done = needing.filter((p) => p.maquinado_completed_at != null).length
  return Math.round((done / needing.length) * 100)
}

export function isWeeklyPlanProjectTerminado(projectStatus: string | null | undefined): boolean {
  return projectStatus === 'terminado'
}

export function computeProjectWeeklyPlanActual(args: {
  projectStatus: string
  pieces: BodegaProjectPieceRow[]
  intervals: BodegaPieceIntervalRow[]
  photos: ProjectPiecePhotoRow[]
  routesConfirmed: boolean
  projectWorkIntervals?: BodegaWorkIntervalRow[]
}): WeeklyPlanStageProgress {
  const { projectStatus, pieces, intervals, photos, routesConfirmed } = args

  if (isWeeklyPlanProjectTerminado(projectStatus)) {
    return { diseno: 100, programacion: 100, maquinado: 100, armado: 100 }
  }

  if (projectStatus === 'en_foto') {
    return { diseno: 0, programacion: 0, maquinado: 0, armado: 0 }
  }

  const diseno = computeDisenoWeeklyActualPct(projectStatus, pieces)
  const workPieces = programmingEligiblePieces(pieces)

  if (workPieces.length === 0) {
    return {
      diseno,
      programacion: 0,
      maquinado: 0,
      armado: 0,
    }
  }

  let progSum = 0
  let armSum = 0

  for (const piece of workPieces) {
    progSum += weeklyProgramacionPiecePct(piece, intervals, routesConfirmed)
    armSum += weeklyArmadoPiecePct(piece, intervals, photos, routesConfirmed)
  }

  const n = workPieces.length
  const programacion = Math.round(progSum / n)
  const maquinadoHecho = weeklyMaquinadoActualPct(workPieces, intervals, routesConfirmed)
  // Maquinado no puede ir adelante de programación. El % de lo ya maquinado
  // solo se muestra cuando programación está en 100; si todavía falta, se queda
  // en ese mismo avance (o más bajo, si la máquina va todavía más atrás).
  const maquinado = programacion >= 100 ? maquinadoHecho : Math.min(maquinadoHecho, programacion)
  const armadoCalculado = Math.round(armSum / n)
  const huboTiempoArmado =
    intervals.some((row) => row.lane === 'armado') ||
    workPieces.some((piece) => piece.armado_completed_at != null) ||
    (args.projectWorkIntervals ?? []).some((row) => row.lane === 'armado')
  const anterioresEnCien = diseno >= 100 && programacion >= 100 && maquinado >= 100
  const armado = !huboTiempoArmado && !anterioresEnCien ? 0 : armadoCalculado
  return {
    diseno,
    programacion,
    maquinado,
    armado,
  }
}

export function weeklyPlanOverallPct(stages: WeeklyPlanStageProgress): number {
  const vals = WEEKLY_PLAN_STAGES.map((s) => stages[s])
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
}

export function weeklyPlanPlannedOverallPct(plan: {
  plan_diseno_pct: number
  plan_programacion_pct: number
  plan_maquinado_pct: number
  plan_armado_pct: number
}): number {
  return Math.round(
    (plan.plan_diseno_pct +
      plan.plan_programacion_pct +
      plan.plan_maquinado_pct +
      plan.plan_armado_pct) /
      4,
  )
}

/** Etapas donde el avance real va por debajo de lo planeado (margen 5 pts). */
const PLANNED_BY_STAGE: Record<WeeklyPlanStageId, keyof {
  plan_diseno_pct: number
  plan_programacion_pct: number
  plan_maquinado_pct: number
  plan_armado_pct: number
}> = {
  diseno: 'plan_diseno_pct',
  programacion: 'plan_programacion_pct',
  maquinado: 'plan_maquinado_pct',
  armado: 'plan_armado_pct',
}

export function weeklyPlanLagStages(
  plan: {
    plan_diseno_pct: number
    plan_programacion_pct: number
    plan_maquinado_pct: number
    plan_armado_pct: number
  },
  actual: WeeklyPlanStageProgress,
  options?: { projectTerminado?: boolean },
): WeeklyPlanStageId[] {
  if (options?.projectTerminado) return []
  const out: WeeklyPlanStageId[] = []
  for (const stage of WEEKLY_PLAN_STAGES) {
    const planned = plan[PLANNED_BY_STAGE[stage]]
    if (planned > 0 && actual[stage] + 5 < planned) out.push(stage)
  }
  return out
}

/** Texto de ayuda: cómo se calcula el % real por etapa. */
export const WEEKLY_PLAN_ACTUAL_HELP: readonly { stage: WeeklyPlanStageId; text: string }[] = [
  {
    stage: 'diseno',
    text: 'Por pieza CAD: 34% diseño aprobado, 33% tratamiento confirmado, 33% plano PDF adjunto. Si aún no hay piezas importadas, usa el estado del proyecto (pendiente 0%, en diseño 15%, revisión 45%, etc.). En programación o terminado = 100%.',
  },
  {
    stage: 'programacion',
    text: 'Promedio de piezas con diseño aprobado: 50% programación CNC/Torno terminada (o ruta Perfilado asignada) + 50% tiempos/taller cerrados (incluye Perfilado en taller). Sin rutas confirmadas = 0%.',
  },
  {
    stage: 'maquinado',
    text: 'Cuando programación ya está en 100%, muestra el % de piezas CNC con maquinado terminado. Si programación sigue abajo de 100, maquinado no puede pasar de ese mismo porcentaje.',
  },
  {
    stage: 'armado',
    text: 'Si todavía no hay tiempo de armado y diseño, programación o maquinado no están en 100%, queda en 0%. Cuando ya hay tiempo de armado, o lo anterior ya está en 100%, promedia 34% detallado + 33% armado + 33% fotos.',
  },
]
