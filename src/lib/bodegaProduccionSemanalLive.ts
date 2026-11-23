import { clipIntervalsToWindow, type WorkWeekWindow } from './bodegaReportWeek'
import { formatBusinessMinutesShort } from './bodegaProjectPhaseDurations'
import type {
  ProduccionLiveBadge,
  ProduccionPieceLine,
  ProduccionProjectLive,
  ProduccionProjectPick,
  ProduccionTaskLane,
} from './bodegaProduccionSemanalTasks'
import { getSupabase } from './supabaseClient'
import { businessSecondsBetween } from './workHours'
import { spanSeconds } from './intervalTime'

type PieceSnap = {
  id: string
  project_id: string
  label: string
  sort_order: number
  programmer_bucket: string | null
  programming_finished_at: string | null
  maquinado_completed_at: string | null
  armado_completed_at: string | null
  programming_exit_kind: string | null
}

type IntervalSnap = {
  ownerId: string
  lane: string
  started_at: string
  ended_at: string | null
}

function weekWindow(weekStart: string, now: Date): WorkWeekWindow {
  const [y, m, d] = weekStart.split('-').map(Number)
  const start = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, 6, 0))
  const fridayClose = new Date(Date.UTC(y, (m ?? 1) - 1, (d ?? 1) + 4, 23, 30))
  let end = fridayClose
  if (now.getTime() < start.getTime()) end = start
  else if (now.getTime() < fridayClose.getTime()) end = now
  return { start, end, label: weekStart }
}

function minutesAll(rows: IntervalSnap[], now: Date, kind: 'business' | 'wall'): number {
  let seconds = 0
  for (const row of rows) {
    if (kind === 'business') {
      const end = row.ended_at ? new Date(row.ended_at) : now
      seconds += businessSecondsBetween(new Date(row.started_at), end)
    } else {
      seconds += spanSeconds(row.started_at, row.ended_at, now.getTime())
    }
  }
  return seconds / 60
}

function minutesOf(
  rows: IntervalSnap[],
  window: WorkWeekWindow,
  kind: 'business' | 'wall',
): number {
  const clipped = clipIntervalsToWindow(rows, window)
  let seconds = 0
  for (const row of clipped) {
    if (kind === 'business') {
      seconds += businessSecondsBetween(new Date(row.started_at), new Date(row.ended_at ?? window.end))
    } else {
      seconds += spanSeconds(row.started_at, row.ended_at, window.end.getTime())
    }
  }
  return seconds / 60
}

function timeBit(mins: number): string {
  if (mins < 1) return ''
  return formatBusinessMinutesShort(mins)
}

function badge(
  label: string,
  tone: ProduccionLiveBadge['tone'],
  percent: number | null,
  pieces: ProduccionPieceLine[] = [],
): ProduccionLiveBadge {
  return {
    label: percent == null ? label : `${percent}% · ${label}`,
    tone,
    percent,
    pieces,
  }
}

function piecePercent(finished: number, total: number): number | null {
  if (total <= 0) return null
  return Math.round((finished * 100) / total)
}

function displayPieceName(label: string): string {
  const file = label.split(/[/\\]/).pop() ?? label
  const cleaned = file.replace(/\.(sldprt|sldasm|prt|step|stp|x_t|xt|pdf|igs|iges)$/i, '').trim()
  return cleaned || file.trim() || 'Pieza'
}

function pieceLines(
  pieces: PieceSnap[],
  done: (piece: PieceSnap) => boolean,
  intervals: IntervalSnap[],
  window: WorkWeekWindow,
  kind: 'business' | 'wall',
): ProduccionPieceLine[] {
  return [...pieces]
    .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label, 'es'))
    .map((piece) => {
      const mins = minutesOf(
        intervals.filter((row) => row.ownerId === piece.id),
        window,
        kind,
      )
      return {
        name: displayPieceName(piece.label),
        done: done(piece),
        timeLabel: timeBit(mins) || null,
      }
    })
}

function disenoBadge(args: {
  finalized: boolean
  enFoto: boolean
  open: boolean
  delivered: boolean
  mins: number
}): ProduccionLiveBadge {
  if (args.finalized) return badge('Finalizado', 'done', 100)
  if (args.enFoto) return badge('En foto', 'progress', args.delivered ? 100 : null)
  const time = timeBit(args.mins)
  if (args.open) return badge(time ? `En diseño ahora · ${time}` : 'En diseño ahora', 'progress', null)
  if (args.delivered) return badge(time ? `Diseño entregado · ${time}` : 'Diseño entregado', 'done', 100)
  if (time) return badge(`${time} esta semana`, 'progress', null)
  return badge('Sin avance de diseño', 'wait', 0)
}

function armadoBadge(args: {
  finalized: boolean
  enFoto: boolean
  mins: number
  open: boolean
  projectClosed: boolean
  pieces: ProduccionPieceLine[]
}): ProduccionLiveBadge {
  const time = timeBit(args.mins)
  const finished = args.pieces.filter((piece) => piece.done).length
  const total = args.pieces.length
  const allPiecesDone = total > 0 && finished >= total
  if (args.finalized) {
    return badge(['Finalizado', time].filter(Boolean).join(' · '), 'done', 100)
  }
  if (args.open) {
    return badge(time ? `En armado ahora · ${time}` : 'En armado ahora', 'progress', null, args.pieces)
  }
  if (total > 0 && !allPiecesDone) {
    const percent = piecePercent(finished, total)
    const count = `${finished} de ${total} piezas`
    return badge([count, time].filter(Boolean).join(' · '), 'progress', percent, args.pieces)
  }
  if (args.projectClosed || allPiecesDone) {
    return badge(time ? `Armado listo · ${time}` : 'Armado listo', 'done', 100, args.pieces)
  }
  if (args.enFoto) {
    return badge(['En foto', time].filter(Boolean).join(' · '), 'progress', null, args.pieces)
  }
  if (time) return badge(`Tiempo de armado · ${time}`, 'progress', null, args.pieces)
  return badge('Sin tiempo de armado', 'wait', 0)
}

function shopBadge(args: {
  finalized: boolean
  enFoto: boolean
  mins: number
  finished: number
  total: number
  pieces: ProduccionPieceLine[]
  ready: string
  empty: string
}): ProduccionLiveBadge {
  const percent = piecePercent(args.finished, args.total)
  const time = timeBit(args.mins)
  const count = args.total > 0 ? `${args.finished} de ${args.total} piezas` : ''
  if (args.finalized) {
    return badge(['Finalizado', time].filter(Boolean).join(' · '), 'done', 100)
  }
  if (args.enFoto) {
    return badge(['En foto', count, time].filter(Boolean).join(' · '), 'progress', percent, args.pieces)
  }
  if (args.total > 0 && args.finished >= args.total) {
    return badge([args.ready, time].filter(Boolean).join(' · '), 'done', 100, args.pieces)
  }
  if (count && time) return badge(`${count} · ${time}`, args.finished > 0 ? 'progress' : 'wait', percent, args.pieces)
  if (time) return badge(`${time} esta semana`, 'progress', percent, args.pieces)
  if (count) return badge(count, args.finished > 0 ? 'progress' : 'wait', percent, args.pieces)
  return badge(args.empty, 'wait', percent, args.pieces)
}

function needsProgramming(piece: PieceSnap): boolean {
  return piece.programmer_bucket === 'cnc' || piece.programmer_bucket === 'torno'
}

function needsMaquinado(piece: PieceSnap): boolean {
  return piece.programmer_bucket === 'cnc' && piece.programming_exit_kind === 'archivo_adjunto'
}

async function selectInChunks<T>(
  ids: string[],
  load: (chunk: string[]) => Promise<T[]>,
): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < ids.length; i += 80) {
    out.push(...(await load(ids.slice(i, i + 80))))
  }
  return out
}

export async function fetchProduccionProjectCatalog(): Promise<ProduccionProjectPick[]> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('bodega_projects')
    .select('id, folio, nombre')
    .order('updated_at', { ascending: false })
    .limit(800)
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({
    id: String(row.id),
    folio: String(row.folio ?? ''),
    nombre: String(row.nombre ?? ''),
  }))
}

export async function fetchProduccionProjectLive(
  projectIds: string[],
  weekStart: string,
  now = new Date(),
): Promise<Map<string, ProduccionProjectLive>> {
  const ids = [...new Set(projectIds.filter(Boolean))]
  const result = new Map<string, ProduccionProjectLive>()
  if (ids.length === 0) return result

  const sb = getSupabase()
  const window = weekWindow(weekStart, now)
  const projects = await selectInChunks(ids, async (chunk) => {
    const { data, error } = await sb
      .from('bodega_projects')
      .select('id, folio, nombre, status, project_finalized_at')
      .in('id', chunk)
    if (error) throw new Error(error.message)
    return data ?? []
  })
  const pieces = await selectInChunks(ids, async (chunk) => {
    const { data, error } = await sb
      .from('bodega_project_pieces')
      .select('id, project_id, label, sort_order, programmer_bucket, programming_finished_at, maquinado_completed_at, armado_completed_at, programming_exit_kind')
      .in('project_id', chunk)
    if (error) throw new Error(error.message)
    return (data ?? []).map((row) => ({
      id: String(row.id),
      project_id: String(row.project_id),
      label: String(row.label ?? ''),
      sort_order: Number(row.sort_order ?? 0),
      programmer_bucket: row.programmer_bucket != null ? String(row.programmer_bucket) : null,
      programming_finished_at: row.programming_finished_at != null ? String(row.programming_finished_at) : null,
      maquinado_completed_at: row.maquinado_completed_at != null ? String(row.maquinado_completed_at) : null,
      armado_completed_at: row.armado_completed_at != null ? String(row.armado_completed_at) : null,
      programming_exit_kind: row.programming_exit_kind != null ? String(row.programming_exit_kind) : null,
    }))
  })
  const designIntervals = await selectInChunks(ids, async (chunk) => {
    const { data, error } = await sb
      .from('bodega_project_work_intervals')
      .select('project_id, lane, started_at, ended_at')
      .in('project_id', chunk)
      .in('lane', ['diseno', 'armado'])
    if (error) throw new Error(error.message)
    return (data ?? []).map((row) => ({
      ownerId: String(row.project_id),
      lane: String(row.lane),
      started_at: String(row.started_at),
      ended_at: row.ended_at != null ? String(row.ended_at) : null,
    }))
  })
  const pieceIds = pieces.map((piece) => piece.id)
  const pieceIntervals = await selectInChunks(pieceIds, async (chunk) => {
    const { data, error } = await sb
      .from('bodega_piece_work_intervals')
      .select('piece_id, lane, started_at, ended_at')
      .in('piece_id', chunk)
      .in('lane', ['programacion_cnc', 'programacion_torno', 'maquinado', 'armado'])
    if (error) throw new Error(error.message)
    return (data ?? []).map((row) => ({
      ownerId: String(row.piece_id),
      lane: String(row.lane),
      started_at: String(row.started_at),
      ended_at: row.ended_at != null ? String(row.ended_at) : null,
    }))
  })
  const deliveries = await selectInChunks(ids, async (chunk) => {
    const { data, error } = await sb
      .from('project_design_versions')
      .select('project_id, package_category')
      .in('project_id', chunk)
    if (error) throw new Error(error.message)
    return data ?? []
  })

  const delivered = new Set(
    deliveries
      .filter((row) => (row.package_category ?? 'entrega_diseno') === 'entrega_diseno')
      .map((row) => String(row.project_id)),
  )

  for (const project of projects) {
    const id = String(project.id)
    const projectPieces = pieces.filter((piece) => piece.project_id === id)
    const designRows = designIntervals.filter((row) => row.ownerId === id && row.lane === 'diseno')
    const projectArmadoRows = designIntervals.filter((row) => row.ownerId === id && row.lane === 'armado')
    const ownedPieceIds = new Set(projectPieces.map((piece) => piece.id))
    const progRows = pieceIntervals.filter(
      (row) => ownedPieceIds.has(row.ownerId) && (row.lane === 'programacion_cnc' || row.lane === 'programacion_torno'),
    )
    const machineRows = pieceIntervals.filter((row) => ownedPieceIds.has(row.ownerId) && row.lane === 'maquinado')
    const pieceArmadoRows = pieceIntervals.filter((row) => ownedPieceIds.has(row.ownerId) && row.lane === 'armado')
    const finalized = project.project_finalized_at != null && String(project.project_finalized_at).trim() !== ''
    const enFoto = !finalized && project.status === 'en_foto'
    const progPieces = projectPieces.filter(needsProgramming)
    const machinePieces = projectPieces.filter(needsMaquinado)
    const progLines = pieceLines(
      progPieces,
      (piece) => piece.programming_finished_at != null,
      progRows,
      window,
      'business',
    )
    const machineLines = pieceLines(
      machinePieces,
      (piece) => piece.maquinado_completed_at != null,
      machineRows,
      window,
      'wall',
    )
    const lanes: Record<ProduccionTaskLane, ProduccionLiveBadge> = {
      disenadora: disenoBadge({
        finalized,
        enFoto,
        open: designRows.some((row) => row.ended_at == null),
        delivered: delivered.has(id) || designRows.some((row) => row.ended_at != null),
        mins: minutesOf(designRows, window, 'business'),
      }),
      programacion: shopBadge({
        finalized,
        enFoto,
        mins: minutesOf(progRows, window, 'business'),
        finished: progLines.filter((piece) => piece.done).length,
        total: progLines.length,
        pieces: progLines,
        ready: 'Programación lista',
        empty: 'Sin tiempo de programación',
      }),
      maquinado: shopBadge({
        finalized,
        enFoto,
        mins: minutesOf(machineRows, window, 'wall'),
        finished: machineLines.filter((piece) => piece.done).length,
        total: machineLines.length,
        pieces: machineLines,
        ready: 'Maquinado listo',
        empty: 'Sin tiempo de maquinado',
      }),
      armado: armadoBadge({
        finalized,
        enFoto,
        mins:
          minutesAll(pieceArmadoRows, now, 'business') + minutesAll(projectArmadoRows, now, 'business'),
        open:
          pieceArmadoRows.some((row) => row.ended_at == null) ||
          projectArmadoRows.some((row) => row.ended_at == null),
        projectClosed:
          projectArmadoRows.length > 0 && projectArmadoRows.every((row) => row.ended_at != null),
        pieces: pieceLines(
          projectPieces.filter(
            (piece) =>
              piece.armado_completed_at != null || pieceArmadoRows.some((row) => row.ownerId === piece.id),
          ),
          (piece) => piece.armado_completed_at != null,
          pieceArmadoRows,
          { start: new Date(0), end: now, label: weekStart },
          'business',
        ),
      }),
    }
    result.set(id, {
      id,
      folio: String(project.folio ?? ''),
      nombre: String(project.nombre ?? ''),
      lanes,
    })
  }
  return result
}
