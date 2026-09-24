import { spanSeconds } from './intervalTime'
import { nowDate } from './serverNow'
import {
  aggregateBusinessMinutesByLane,
  type BodegaWorkIntervalLane,
  type BodegaWorkIntervalRow,
} from './bodegaWorkIntervalsRepo'
import {
  aggregatePieceMinutesByLane,
  aggregatePieceWallMinutesByLane,
  type BodegaPieceIntervalRow,
  type BodegaPieceLane,
} from './bodegaPieceIntervalsRepo'

/** Minutos hábiles por etapa, solo de relojes iniciados en ese proyecto/pieza. */
export type ProjectOrdenTimeBreakdown = {
  disenoMin: number
  programacionMin: number
  maquinadoMin: number
  perfiladoMin: number
  detalladoMin: number
  armadoMin: number
  totalTrackedMin: number
  hasOpenInterval: boolean
}

export function emptyOrdenTimeBreakdown(): ProjectOrdenTimeBreakdown {
  return {
    disenoMin: 0,
    programacionMin: 0,
    maquinadoMin: 0,
    perfiladoMin: 0,
    detalladoMin: 0,
    armadoMin: 0,
    totalTrackedMin: 0,
    hasOpenInterval: false,
  }
}

/** Oficina CNC: solo programación (no máquina). */
const WORK_PROGRAMACION_LANES: BodegaWorkIntervalLane[] = [
  'cnc_programacion',
  'cnc_torno',
  'cnc_perfilado',
]

/** Relojes de proyecto en máquina (legado / carriles maquina_*). */
const WORK_MAQUINADO_LANES: BodegaWorkIntervalLane[] = [
  'maquina_programacion',
  'maquina_torno',
  'maquina_perfilado',
]

const PIECE_PROGRAMACION_LANES: BodegaPieceLane[] = ['programacion_cnc', 'programacion_torno']

function sumWorkWallMinutes(
  rows: BodegaWorkIntervalRow[],
  lanes: BodegaWorkIntervalLane[],
  now: Date,
): number {
  return programmingElapsedSeconds(rows, [], now, lanes, []) / 60
}

/** Segundos de reloj real de programación (oficina + piezas). Misma cifra en pestaña y cronómetro. */
export function programmingElapsedSeconds(
  workIntervals: BodegaWorkIntervalRow[],
  pieceIntervals: BodegaPieceIntervalRow[],
  now: Date,
  workLanes: BodegaWorkIntervalLane[] = WORK_PROGRAMACION_LANES,
  pieceLanes: BodegaPieceLane[] = PIECE_PROGRAMACION_LANES,
): number {
  const nowMs = now.getTime()
  const workSet = new Set<string>(workLanes)
  const pieceSet = new Set<string>(pieceLanes)
  let s = 0
  for (const r of workIntervals) {
    if (!workSet.has(r.lane)) continue
    s += spanSeconds(r.started_at, r.ended_at, nowMs)
  }
  for (const r of pieceIntervals) {
    if (!pieceSet.has(r.lane)) continue
    s += spanSeconds(r.started_at, r.ended_at, nowMs)
  }
  return s
}

export function computeProjectOrdenTimes(args: {
  workIntervals: BodegaWorkIntervalRow[]
  pieceIntervals: BodegaPieceIntervalRow[]
  nowRef?: Date
}): ProjectOrdenTimeBreakdown {
  const now = args.nowRef ?? nowDate()
  const byWork = aggregateBusinessMinutesByLane(args.workIntervals, now)
  const byPiece = aggregatePieceMinutesByLane(args.pieceIntervals, now)
  // Maquinado CNC: minutos de reloj real (la máquina no se limita al horario de oficina).
  const byPieceWall = aggregatePieceWallMinutesByLane(args.pieceIntervals, now)

  const disenoMin = byWork.get('diseno') ?? 0
  const programacionMin = programmingElapsedSeconds(args.workIntervals, args.pieceIntervals, now) / 60
  const maquinadoMin =
    (byPieceWall.get('maquinado') ?? 0) + sumWorkWallMinutes(args.workIntervals, WORK_MAQUINADO_LANES, now)
  const perfiladoMin = byPiece.get('perfilado_operador') ?? 0
  const detalladoMin = byPiece.get('detallado') ?? 0
  const armadoMin = (byPiece.get('armado') ?? 0) + (byWork.get('armado') ?? 0)

  const totalTrackedMin =
    disenoMin + programacionMin + maquinadoMin + perfiladoMin + detalladoMin + armadoMin

  const hasOpenInterval =
    args.workIntervals.some((r) => r.ended_at == null) ||
    args.pieceIntervals.some((r) => r.ended_at == null)

  return {
    disenoMin,
    programacionMin,
    maquinadoMin,
    perfiladoMin,
    detalladoMin,
    armadoMin,
    totalTrackedMin,
    hasOpenInterval,
  }
}

export function sumOrdenTimeBreakdowns(items: ProjectOrdenTimeBreakdown[]): ProjectOrdenTimeBreakdown {
  const out = emptyOrdenTimeBreakdown()
  for (const t of items) {
    out.disenoMin += t.disenoMin
    out.programacionMin += t.programacionMin
    out.maquinadoMin += t.maquinadoMin
    out.perfiladoMin += t.perfiladoMin
    out.detalladoMin += t.detalladoMin
    out.armadoMin += t.armadoMin
    out.totalTrackedMin += t.totalTrackedMin
    if (t.hasOpenInterval) out.hasOpenInterval = true
  }
  return out
}

export type OrdenTimeSegmentKey =
  | 'diseno'
  | 'programacion'
  | 'maquinado'
  | 'perfilado'
  | 'detallado'
  | 'armado'

export const ORDEN_TIME_SEGMENTS: Array<{
  key: OrdenTimeSegmentKey
  label: string
  barClass: string
  textClass: string
  borderClass: string
  bgClass: string
}> = [
  {
    key: 'diseno',
    label: 'Diseño',
    barClass: 'bg-violet-600',
    textClass: 'text-violet-900',
    borderClass: 'border-violet-200',
    bgClass: 'bg-violet-50/90',
  },
  {
    key: 'programacion',
    label: 'Programación',
    barClass: 'bg-programacion-500',
    textClass: 'text-programacion-950',
    borderClass: 'border-programacion-200',
    bgClass: 'bg-programacion-50/90',
  },
  {
    key: 'maquinado',
    label: 'Maquinado',
    barClass: 'bg-amber-500',
    textClass: 'text-amber-950',
    borderClass: 'border-amber-200',
    bgClass: 'bg-amber-50/90',
  },
  {
    key: 'perfilado',
    label: 'Perfilado',
    barClass: 'bg-cyan-600',
    textClass: 'text-cyan-950',
    borderClass: 'border-cyan-200',
    bgClass: 'bg-cyan-50/90',
  },
  {
    key: 'detallado',
    label: 'Detallado',
    barClass: 'bg-orange-500',
    textClass: 'text-orange-950',
    borderClass: 'border-orange-200',
    bgClass: 'bg-orange-50/90',
  },
  {
    key: 'armado',
    label: 'Armado',
    barClass: 'bg-emerald-600',
    textClass: 'text-emerald-950',
    borderClass: 'border-emerald-200',
    bgClass: 'bg-emerald-50/90',
  },
]

export function ordenSegmentMinutes(
  t: ProjectOrdenTimeBreakdown,
  key: OrdenTimeSegmentKey,
): number {
  switch (key) {
    case 'diseno':
      return t.disenoMin
    case 'programacion':
      return t.programacionMin
    case 'maquinado':
      return t.maquinadoMin
    case 'perfilado':
      return t.perfiladoMin
    case 'detallado':
      return t.detalladoMin
    case 'armado':
      return t.armadoMin
    default:
      return 0
  }
}
