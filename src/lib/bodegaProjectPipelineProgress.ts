import type { BodegaPieceIntervalRow } from './bodegaPieceIntervalsRepo'
import { pieceNeedsSecondProgrammingSession } from './bodegaPostPerfiladoProgramming'
import type { BodegaProjectPieceRow } from './bodegaPiecesRepo'
import { photosForPiece } from './bodegaPiecePhotosFlow'
import type { ProjectPiecePhotoRow } from './piecePhotosRepo'

export type BodegaPipelineStageId =
  | 'programacion'
  | 'tiempos'
  | 'maquinado'
  | 'detallado'
  | 'armado'
  | 'fotos'
  | 'completo'

const STAGE_ORDER: BodegaPipelineStageId[] = [
  'programacion',
  'tiempos',
  'maquinado',
  'detallado',
  'armado',
  'fotos',
]

export function pipelineStageLabelEs(stage: BodegaPipelineStageId): string {
  switch (stage) {
    case 'programacion':
      return 'Programación'
    case 'tiempos':
      return 'Tiempos'
    case 'maquinado':
      return 'Maquinado'
    case 'detallado':
      return 'Detallado'
    case 'armado':
      return 'Armado'
    case 'fotos':
      return 'Fotos'
    case 'completo':
      return 'Terminado'
    default:
      return stage
  }
}

/** Proyectos en taller/programación: estado y % derivados de piezas, no solo del campo manual. */
export function projectUsesOperationalPipeline(status: string): boolean {
  return (
    status === 'diseno_aprobado' ||
    status === 'diseno_parcial' ||
    status === 'en_programacion' ||
    status === 'revision_programacion' ||
    status === 'terminado'
  )
}

export function pieceNeedsMaquinado(p: BodegaProjectPieceRow): boolean {
  if (p.programmer_bucket === 'perfilado' || p.programmer_bucket === 'accesorios') return false
  return (
    (p.programmer_bucket === 'cnc' || p.programmer_bucket === 'torno') &&
    p.programming_exit_kind === 'archivo_adjunto'
  )
}

function pieceHasPhoto(pieceId: string, photos: ProjectPiecePhotoRow[]): boolean {
  return photosForPiece(photos, pieceId).length > 0
}

function intervalsForPiece(pieceId: string, intervals: BodegaPieceIntervalRow[]): BodegaPieceIntervalRow[] {
  return intervals.filter((r) => r.piece_id === pieceId)
}

function hasClosedProgInterval(pieceId: string, intervals: BodegaPieceIntervalRow[]): boolean {
  return intervalsForPiece(pieceId, intervals).some(
    (r) =>
      (r.lane === 'programacion_cnc' || r.lane === 'programacion_torno') && r.ended_at != null,
  )
}

export function pieceProgramacionComplete(
  p: BodegaProjectPieceRow,
  routesConfirmed: boolean,
): boolean {
  if (!routesConfirmed || p.programmer_bucket == null) return false
  if (p.programmer_bucket === 'perfilado' || p.programmer_bucket === 'accesorios') return true
  return p.programming_finished_at != null
}

export function pieceTiemposComplete(
  p: BodegaProjectPieceRow,
  intervals: BodegaPieceIntervalRow[],
  routesConfirmed = false,
): boolean {
  if (p.programmer_bucket === 'perfilado') {
    if (!routesConfirmed) return false
    return p.perfilado_completed_at != null
  }
  if (p.programmer_bucket === 'accesorios') return routesConfirmed
  if (pieceNeedsSecondProgrammingSession(p)) {
    return p.programming_finished_at != null
  }
  if (p.programming_exit_kind === 'a_perfilado') {
    return p.perfilado_completed_at != null
  }
  if (p.programmer_bucket === 'cnc' || p.programmer_bucket === 'torno') {
    return p.programming_finished_at != null || hasClosedProgInterval(p.id, intervals)
  }
  return false
}

function applicableStagesForPiece(p: BodegaProjectPieceRow): BodegaPipelineStageId[] {
  if (p.programmer_bucket === 'accesorios') return []
  const stages: BodegaPipelineStageId[] = ['programacion', 'tiempos']
  if (pieceNeedsMaquinado(p)) stages.push('maquinado')
  stages.push('detallado', 'armado', 'fotos')
  return stages
}

export function pieceStageComplete(args: {
  piece: BodegaProjectPieceRow
  stage: BodegaPipelineStageId
  intervals: BodegaPieceIntervalRow[]
  photos: ProjectPiecePhotoRow[]
  routesConfirmed: boolean
}): boolean {
  const { piece: p, stage, intervals, photos, routesConfirmed } = args
  switch (stage) {
    case 'programacion':
      return pieceProgramacionComplete(p, routesConfirmed)
    case 'tiempos':
      return pieceTiemposComplete(p, intervals, routesConfirmed)
    case 'maquinado':
      if (!pieceNeedsMaquinado(p)) return true
      return p.maquinado_completed_at != null
    case 'detallado':
      return p.detallado_completed_at != null
    case 'armado':
      return p.armado_completed_at != null
    case 'fotos':
      return pieceHasPhoto(p.id, photos)
    case 'completo':
      return (
        pieceProgramacionComplete(p, routesConfirmed) &&
        pieceTiemposComplete(p, intervals, routesConfirmed) &&
        (!pieceNeedsMaquinado(p) || p.maquinado_completed_at != null) &&
        p.detallado_completed_at != null &&
        p.armado_completed_at != null &&
        pieceHasPhoto(p.id, photos)
      )
    default:
      return false
  }
}

export function piecePipelineProgressPct(args: {
  piece: BodegaProjectPieceRow
  intervals: BodegaPieceIntervalRow[]
  photos: ProjectPiecePhotoRow[]
  routesConfirmed: boolean
}): number {
  if (args.piece.programmer_bucket === 'accesorios' && args.routesConfirmed) return 100
  const stages = applicableStagesForPiece(args.piece)
  if (stages.length === 0) return 0
  const weight = 100 / stages.length
  let pct = 0
  for (const stage of stages) {
    if (
      pieceStageComplete({
        piece: args.piece,
        stage,
        intervals: args.intervals,
        photos: args.photos,
        routesConfirmed: args.routesConfirmed,
      })
    ) {
      pct += weight
    }
  }
  return Math.min(100, Math.round(pct))
}

export function pieceCurrentPipelineStage(args: {
  piece: BodegaProjectPieceRow
  intervals: BodegaPieceIntervalRow[]
  photos: ProjectPiecePhotoRow[]
  routesConfirmed: boolean
}): BodegaPipelineStageId {
  const stages = applicableStagesForPiece(args.piece)
  for (const stage of stages) {
    if (
      !pieceStageComplete({
        piece: args.piece,
        stage,
        intervals: args.intervals,
        photos: args.photos,
        routesConfirmed: args.routesConfirmed,
      })
    ) {
      return stage
    }
  }
  return 'completo'
}

export type ProjectPipelineDisplay = {
  stageId: BodegaPipelineStageId
  statusLabel: string
  avancePct: number
  allPiecesComplete: boolean
}

export function computeProjectPipelineDisplay(args: {
  pieces: BodegaProjectPieceRow[]
  intervals: BodegaPieceIntervalRow[]
  photos: ProjectPiecePhotoRow[]
  routesConfirmed: boolean
}): ProjectPipelineDisplay {
  const { pieces, intervals, photos, routesConfirmed } = args
  if (pieces.length === 0) {
    return { stageId: 'programacion', statusLabel: 'Programación', avancePct: 0, allPiecesComplete: false }
  }

  const piecePcts = pieces.map((p) =>
    piecePipelineProgressPct({ piece: p, intervals, photos, routesConfirmed }),
  )
  const avancePct = Math.round(piecePcts.reduce((a, b) => a + b, 0) / pieces.length)

  let projectStage: BodegaPipelineStageId = 'completo'
  for (const stage of STAGE_ORDER) {
    if (stage === 'completo') continue
    const allDone = pieces.every((p) =>
      pieceStageComplete({ piece: p, stage, intervals, photos, routesConfirmed }),
    )
    if (!allDone) {
      projectStage = stage
      break
    }
  }

  const allPiecesComplete = projectStage === 'completo' && avancePct >= 100

  return {
    stageId: allPiecesComplete ? 'completo' : projectStage,
    statusLabel: pipelineStageLabelEs(allPiecesComplete ? 'completo' : projectStage),
    avancePct: allPiecesComplete ? 100 : avancePct,
    allPiecesComplete,
  }
}
