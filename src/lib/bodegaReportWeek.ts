import type { BodegaPieceIntervalRow } from './bodegaPieceIntervalsRepo'
import { intervalDate } from './intervalTime'
import type { BodegaProjectPieceRow } from './bodegaPiecesRepo'
import type { ProjectOrdenTimeBreakdown } from './bodegaProjectOrdenTimes'
import { formatBusinessMinutesShort } from './bodegaProjectPhaseDurations'
import {
  computeProjectPipelineDisplay,
  pieceStageComplete,
  projectUsesOperationalPipeline,
} from './bodegaProjectPipelineProgress'
import { bodegaProjectStatusLabelEs, type BodegaProjectStatus } from './bodegaProjectsRepo'
import type { ProjectPiecePhotoRow } from './piecePhotosRepo'

const TZ = 'America/Mexico_City'

export type WorkWeekWindow = {
  start: Date
  end: Date
  label: string
}

function mexicoParts(d: Date): { y: number; m: number; day: number; dowMon1: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  })
  const map: Record<string, string> = {}
  for (const p of fmt.formatToParts(d)) {
    if (p.type !== 'literal') map[p.type] = p.value
  }
  const wd: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }
  return {
    y: Number(map.year),
    m: Number(map.month),
    day: Number(map.day),
    dowMon1: wd[map.weekday ?? 'Mon'] ?? 1,
  }
}

/** Medianoche o 17:30 en America/Mexico_City (UTC−6). */
function mexicoInstant(y: number, m: number, day: number, hour: number, minute: number): Date {
  return new Date(Date.UTC(y, m - 1, day, hour + 6, minute))
}

function addDays(y: number, m: number, day: number, delta: number): { y: number; m: number; day: number } {
  const dt = new Date(Date.UTC(y, m - 1, day + delta))
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, day: dt.getUTCDate() }
}

function shortDay(y: number, m: number, day: number): string {
  const d = mexicoInstant(y, m, day, 12, 0)
  return d.toLocaleDateString('es-MX', { timeZone: TZ, day: 'numeric', month: 'short' })
}

/** Semana hábil que se entrega el viernes. Sábado y domingo usan la semana que acaba de cerrar. */
export function currentWorkWeekWindow(now: Date = new Date()): WorkWeekWindow {
  const p = mexicoParts(now)
  const back = p.dowMon1 === 6 ? 5 : p.dowMon1 === 7 ? 6 : p.dowMon1 - 1
  const monday = addDays(p.y, p.m, p.day, -back)
  const friday = addDays(monday.y, monday.m, monday.day, 4)
  const start = mexicoInstant(monday.y, monday.m, monday.day, 0, 0)
  const fridayClose = mexicoInstant(friday.y, friday.m, friday.day, 17, 30)
  const end = now.getTime() < fridayClose.getTime() && p.dowMon1 <= 5 ? now : fridayClose
  return {
    start,
    end,
    label: `${shortDay(monday.y, monday.m, monday.day)} – ${shortDay(friday.y, friday.m, friday.day)}`,
  }
}

export function clipIntervalsToWindow<T extends { started_at: string; ended_at: string | null }>(
  rows: T[],
  window: WorkWeekWindow,
): T[] {
  const a = window.start.getTime()
  const b = window.end.getTime()
  const out: T[] = []
  for (const r of rows) {
    const start = intervalDate(r.started_at)
    if (!start) continue
    const end = r.ended_at ? intervalDate(r.ended_at) ?? window.end : window.end
    const lo = Math.max(start.getTime(), a)
    const hi = Math.min(end.getTime(), b)
    if (!(hi > lo)) continue
    out.push({
      ...r,
      started_at: new Date(lo).toISOString(),
      ended_at: new Date(hi).toISOString(),
    })
  }
  return out
}

export function tallerWeekMinutes(t: ProjectOrdenTimeBreakdown): number {
  return t.perfiladoMin + t.detalladoMin + t.armadoMin
}

export function formatWeekMinutes(mins: number): string {
  if (!Number.isFinite(mins) || mins < 1) return '—'
  return formatBusinessMinutesShort(mins)
}

export type ReportAdvance = {
  /** Etapa que se muestra en el reporte. No usa el estado guardado si las piezas ya siguieron. */
  headline: string
  disenoCumplido: boolean
  programacionCumplido: boolean
  maquinadoCumplido: boolean
  tallerCumplido: boolean
  readyForPhoto: number
  withPhoto: number
  totalPieces: number
}

const DESIGN_WAITING = ['pendiente', 'en_diseno', 'revision_diseno', 'modificacion_diseno', 'diseno_parcial']

function everyPieceDone(
  pieces: BodegaProjectPieceRow[],
  stage: 'programacion' | 'maquinado' | 'detallado' | 'armado',
  intervals: BodegaPieceIntervalRow[],
  photos: ProjectPiecePhotoRow[],
  routesConfirmed: boolean,
): boolean {
  if (pieces.length === 0) return false
  return pieces.every(
    (piece) =>
      piece.programmer_bucket != null &&
      pieceStageComplete({ piece, stage, intervals, photos, routesConfirmed }),
  )
}

export function buildReportAdvance(args: {
  status: string
  week: ProjectOrdenTimeBreakdown
  pieces: BodegaProjectPieceRow[]
  intervals: BodegaPieceIntervalRow[]
  photos: ProjectPiecePhotoRow[]
  routesConfirmed: boolean
}): ReportAdvance {
  const { status, week, pieces, intervals, photos, routesConfirmed } = args
  const designWaiting = DESIGN_WAITING.includes(status)
  const disenoCumplido = !designWaiting && status !== 'revision_diseno'
  const programacionCumplido = everyPieceDone(pieces, 'programacion', intervals, photos, routesConfirmed)
  const maquinadoCumplido = everyPieceDone(pieces, 'maquinado', intervals, photos, routesConfirmed)
  const tallerCumplido =
    everyPieceDone(pieces, 'detallado', intervals, photos, routesConfirmed) &&
    everyPieceDone(pieces, 'armado', intervals, photos, routesConfirmed)

  let readyForPhoto = 0
  let withPhoto = 0
  for (const piece of pieces) {
    if (!pieceStageComplete({ piece, stage: 'fotos', intervals, photos, routesConfirmed })) {
      const eligible =
        piece.programmer_bucket === 'torno' ||
        piece.programmer_bucket === 'perfilado' ||
        piece.programmer_bucket === 'accesorios' ||
        piece.detallado_completed_at != null
      if (eligible) readyForPhoto++
      continue
    }
    readyForPhoto++
    withPhoto++
  }

  let headline = bodegaProjectStatusLabelEs(status as BodegaProjectStatus)
  if (status === 'terminado') headline = 'Terminado'
  else if (status === 'revision_programacion') headline = 'En revisión'
  else if (!designWaiting && projectUsesOperationalPipeline(status)) {
    const pipeline = computeProjectPipelineDisplay({ pieces, intervals, photos, routesConfirmed })
    const taller = tallerWeekMinutes(week)
    if (pipeline.stageId === 'fotos' || (tallerCumplido && maquinadoCumplido && programacionCumplido && withPhoto < pieces.length)) {
      headline = 'Fotos'
    } else if (taller >= 1 || pipeline.stageId === 'detallado' || pipeline.stageId === 'armado') {
      headline = 'Taller'
    } else if (week.maquinadoMin >= 1 || pipeline.stageId === 'maquinado') {
      headline = 'Maquinado'
    } else if (pipeline.stageId === 'completo') {
      headline = 'Terminado'
    } else {
      headline = 'Programación'
    }
  }

  return {
    headline,
    disenoCumplido,
    programacionCumplido,
    maquinadoCumplido,
    tallerCumplido,
    readyForPhoto,
    withPhoto,
    totalPieces: pieces.length,
  }
}

export function formatWeekCell(mins: number, cumplido: boolean): string {
  if (Number.isFinite(mins) && mins >= 1) return formatWeekMinutes(mins)
  return cumplido ? 'Cumplido' : '—'
}

/** Motivo corto de por qué la etapa no avanzó esta semana. */
export function quePasoEstaSemana(args: {
  status: string
  week: ProjectOrdenTimeBreakdown
  contratiempo: string | null
  weekNote: string
  advance?: ReportAdvance | null
}): string {
  const note = args.contratiempo?.trim() ?? ''
  const weekNote = args.weekNote.trim()
  const ausencia = /ausente|no asiste|no asist/i.test(weekNote)
  const st = args.status
  const w = args.week
  const taller = tallerWeekMinutes(w)

  const adv = args.advance
  if (st === 'terminado' || adv?.headline === 'Terminado') return 'Terminado'

  if (st === 'revision_diseno' || st === 'revision_programacion') {
    return note ? `En revisión. ${note}` : 'En revisión'
  }

  if (DESIGN_WAITING.includes(st)) {
    if (w.disenoMin >= 1) return note ? `Avanzó en diseño. ${note}` : 'Avanzó en diseño'
    return note ? `Contratiempo de la pieza: ${note}` : 'Esperando diseño'
  }

  if (taller >= 1) return note ? `Avanzó en taller. ${note}` : 'Avanzó en taller'
  if (w.maquinadoMin >= 1) return note ? `Avanzó en maquinado. ${note}` : 'Avanzó en maquinado'

  if (adv && adv.totalPieces > 0 && adv.readyForPhoto > adv.withPhoto) {
    const waitingPhoto = adv.readyForPhoto - adv.withPhoto
    const stillWorking = adv.totalPieces - adv.readyForPhoto
    if (stillWorking === 0) {
      return waitingPhoto === 1 ? 'Cumplido: falta adjuntar 1 foto' : `Cumplido: faltan ${waitingPhoto} fotos`
    }
    if (w.programacionMin < 1) {
      return `${waitingPhoto} piezas ya solo esperan la foto. ${stillWorking} siguen en proceso`
    }
  }

  if (st === 'diseno_aprobado' || st === 'en_programacion' || adv?.headline === 'Programación') {
    if (adv?.programacionCumplido && w.programacionMin < 1) return 'Programación cumplida'
    if (w.programacionMin < 1) {
      if (ausencia) return 'Personal ausente: no se programó'
      return 'Sin movimiento en programación'
    }
    return 'Avanzó en programación'
  }

  if (w.maquinadoMin < 1 && taller < 1) {
    if (note) return `No se maquinó. ${note}`
    return 'No se maquinó esta semana'
  }

  if (w.maquinadoMin >= 1 || taller >= 1 || w.programacionMin >= 1 || w.disenoMin >= 1) {
    return note ? `Avanzó esta semana. ${note}` : 'Avanzó esta semana'
  }

  return note ? `Sin movimiento. ${note}` : 'Sin movimiento esta semana'
}
