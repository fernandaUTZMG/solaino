import { splitProduccionSemanalLines } from './bodegaProduccionSemanalFormat'

export type ProduccionTaskLane = 'disenadora' | 'programacion' | 'maquinado' | 'armado'
export type ProduccionTaskManual = 'pendiente' | 'en_proceso' | 'lista'

export type ProduccionSemanalTask = {
  text: string
  projectId: string | null
  manual: ProduccionTaskManual | null
  /** Nombres anotados por encargado o admin. Solo se usa en Armado. */
  helpers: string[]
}

export type ProduccionWeekDayTasks = {
  disenadora_tareas: ProduccionSemanalTask[]
  programacion_tareas: ProduccionSemanalTask[]
  maquinado_tareas: ProduccionSemanalTask[]
  armado_tareas: ProduccionSemanalTask[]
}

export type ProduccionLiveTone = 'done' | 'progress' | 'idle' | 'wait'

export type ProduccionPieceLine = {
  name: string
  done: boolean
  /** Tiempo de esta pieza en la semana, ya formateado. Vacío si no hay reloj. */
  timeLabel: string | null
}

export type ProduccionLiveBadge = {
  label: string
  tone: ProduccionLiveTone
  percent: number | null
  pieces: ProduccionPieceLine[]
}

export type ProduccionProjectLive = {
  id: string
  folio: string
  nombre: string
  lanes: Record<ProduccionTaskLane, ProduccionLiveBadge>
}

export type ProduccionProjectPick = {
  id: string
  folio: string
  nombre: string
}

const MANUALS: ProduccionTaskManual[] = ['pendiente', 'en_proceso', 'lista']

export function isProduccionNoteLine(text: string): boolean {
  const folded = text.replace(/^\*\s*/, '').trim().toLowerCase().replace(/\s+/g, '')
  return folded === 'n/a' || folded === 'na' || folded === 'n.a.' || folded === 'n.a' || folded === '-'
}

function asManual(value: unknown): ProduccionTaskManual | null {
  return MANUALS.includes(value as ProduccionTaskManual) ? (value as ProduccionTaskManual) : null
}

function asHelpers(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of value) {
    const name = String(item ?? '').trim().replace(/\s+/g, ' ').slice(0, 40)
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(name)
    if (out.length >= 8) break
  }
  return out
}

function storedTasks(raw: unknown): ProduccionSemanalTask[] {
  if (!Array.isArray(raw)) return []
  const out: ProduccionSemanalTask[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const text = String(row.text ?? '').trim()
    if (!text) continue
    const projectId = row.project_id != null && String(row.project_id).trim() ? String(row.project_id) : null
    out.push({ text, projectId, manual: asManual(row.manual), helpers: asHelpers(row.helpers) })
  }
  return out
}

/** Alinea el texto de la celda con el vínculo o la marca ya guardados. */
export function reconcileProduccionTasks(text: string, raw: unknown): ProduccionSemanalTask[] {
  const pool = storedTasks(raw)
  return splitProduccionSemanalLines(text).map((line) => {
    const index = pool.findIndex((item) => item.text === line)
    if (index < 0) return { text: line, projectId: null, manual: null, helpers: [] }
    const hit = pool.splice(index, 1)[0]!
    return {
      text: line,
      projectId: hit.projectId,
      manual: hit.projectId ? null : hit.manual,
      helpers: hit.helpers,
    }
  })
}

export function produccionTasksToJson(tasks: ProduccionSemanalTask[]): Array<{
  text: string
  project_id: string | null
  manual: ProduccionTaskManual | null
  helpers: string[]
}> {
  return tasks.map((task) => ({
    text: task.text,
    project_id: task.projectId,
    manual: task.projectId ? null : task.manual,
    helpers: asHelpers(task.helpers),
  }))
}

export function armadoHelpersLabel(helpers: string[]): string | null {
  const names = asHelpers(helpers)
  if (names.length === 0) return null
  return `Ayudó: ${names.join(', ')}`
}

export function produccionLaneTasks(day: ProduccionWeekDayTasks, lane: ProduccionTaskLane): ProduccionSemanalTask[] {
  if (lane === 'disenadora') return day.disenadora_tareas
  if (lane === 'programacion') return day.programacion_tareas
  if (lane === 'maquinado') return day.maquinado_tareas
  return day.armado_tareas
}

export function manualBadge(manual: ProduccionTaskManual | null): ProduccionLiveBadge | null {
  if (manual === 'lista') return { label: '100% · Lista', tone: 'done', percent: 100, pieces: [] }
  if (manual === 'en_proceso') return { label: '50% · En proceso', tone: 'progress', percent: 50, pieces: [] }
  if (manual === 'pendiente') return { label: '0% · Pendiente', tone: 'wait', percent: 0, pieces: [] }
  return null
}

export function taskProgressBadge(
  task: ProduccionSemanalTask,
  lane: ProduccionTaskLane,
  liveByProject: Map<string, ProduccionProjectLive> | undefined,
): ProduccionLiveBadge | null {
  if (isProduccionNoteLine(task.text)) return null
  if (task.projectId) {
    const live = liveByProject?.get(task.projectId)
    if (!live) return { label: 'Cargando avance…', tone: 'idle', percent: null, pieces: [] }
    return live.lanes[lane]
  }
  return manualBadge(task.manual) ?? { label: 'Sin marcar', tone: 'idle', percent: null, pieces: [] }
}

export type ProduccionWeekProgressSummary = {
  tareas: number
  conProyecto: number
  marcadas: number
  sinTocar: number
}

export function summarizeProduccionWeek(days: ProduccionWeekDayTasks[]): ProduccionWeekProgressSummary {
  const summary: ProduccionWeekProgressSummary = { tareas: 0, conProyecto: 0, marcadas: 0, sinTocar: 0 }
  for (const day of days) {
    for (const task of [
      ...day.disenadora_tareas,
      ...day.programacion_tareas,
      ...day.maquinado_tareas,
      ...day.armado_tareas,
    ]) {
      if (isProduccionNoteLine(task.text)) continue
      summary.tareas += 1
      if (task.projectId) summary.conProyecto += 1
      else if (task.manual === 'en_proceso' || task.manual === 'lista') summary.marcadas += 1
      else summary.sinTocar += 1
    }
  }
  return summary
}

const PROGRESS_LANES: Array<{
  key: keyof ProduccionWeekDayTasks
  lane: ProduccionTaskLane
}> = [
  { key: 'disenadora_tareas', lane: 'disenadora' },
  { key: 'programacion_tareas', lane: 'programacion' },
  { key: 'maquinado_tareas', lane: 'maquinado' },
  { key: 'armado_tareas', lane: 'armado' },
]

const LANE_LABEL: Record<ProduccionTaskLane, string> = {
  disenadora: 'Diseño',
  programacion: 'Programación',
  maquinado: 'Maquinado',
  armado: 'Armado',
}

/** 0–100 de lo cumplido en esa tarea. Null solo mientras el avance de Bodega sigue cargando. */
export function taskFulfillmentPercent(
  task: ProduccionSemanalTask,
  lane: ProduccionTaskLane,
  liveByProject: Map<string, ProduccionProjectLive> | undefined,
): number | null {
  if (isProduccionNoteLine(task.text)) return null
  const badge = taskProgressBadge(task, lane, liveByProject)
  if (!badge || badge.label === 'Cargando avance…') return null
  if (badge.percent != null) return badge.percent
  return 0
}

export type ProduccionDayGoal = {
  lane: string
  text: string
}

export type ProduccionDayLine = {
  lane: string
  text: string
  detail: string
}

export type ProduccionDayScore = {
  /** 100 si el día tiene tareas. Null si el día está vacío. */
  meta: number | null
  real: number | null
  goals: ProduccionDayGoal[]
  done: ProduccionDayLine[]
  missing: ProduccionDayLine[]
  gaps: string[]
}

function gapReason(task: ProduccionSemanalTask, lane: ProduccionTaskLane, liveByProject: Map<string, ProduccionProjectLive> | undefined): string {
  const badge = taskProgressBadge(task, lane, liveByProject)
  const missing = badge?.pieces.filter((piece) => !piece.done).map((piece) => piece.name) ?? []
  if (missing.length > 0) return `Falta ${missing.join(', ')}`
  if (!badge || badge.label === 'Sin marcar') return 'Sin marcar'
  return badge.label.replace(/^\d+% · /, '')
}

export function produccionDayScore(
  day: ProduccionWeekDayTasks,
  liveByProject: Map<string, ProduccionProjectLive> | undefined,
): ProduccionDayScore {
  const percents: number[] = []
  const goals: ProduccionDayGoal[] = []
  const done: ProduccionDayLine[] = []
  const missing: ProduccionDayLine[] = []
  const gaps: string[] = []
  for (const column of PROGRESS_LANES) {
    for (const task of day[column.key]) {
      if (isProduccionNoteLine(task.text)) continue
      const lane = LANE_LABEL[column.lane]
      goals.push({ lane, text: task.text })
      const percent = taskFulfillmentPercent(task, column.lane, liveByProject)
      if (percent == null) continue
      percents.push(percent)
      const badge = taskProgressBadge(task, column.lane, liveByProject)
      const donePieces = badge?.pieces.filter((piece) => piece.done).map((piece) => piece.name) ?? []
      const missingPieces = badge?.pieces.filter((piece) => !piece.done).map((piece) => piece.name) ?? []
      if (percent >= 100) {
        done.push({ lane, text: task.text, detail: donePieces.length > 0 ? donePieces.join(', ') : 'Lista' })
        continue
      }
      if (donePieces.length > 0) {
        done.push({ lane, text: task.text, detail: donePieces.join(', ') })
      }
      const detail = missingPieces.length > 0 ? missingPieces.join(', ') : gapReason(task, column.lane, liveByProject)
      missing.push({ lane, text: task.text, detail })
      gaps.push(`${lane} · ${task.text}: ${percent}% · ${detail}`)
    }
  }
  if (goals.length === 0) return { meta: null, real: null, goals: [], done: [], missing: [], gaps: [] }
  const real = percents.length === 0 ? null : Math.round(percents.reduce((sum, value) => sum + value, 0) / percents.length)
  return { meta: 100, real, goals, done, missing, gaps }
}

export function produccionWeekScore(
  days: ProduccionWeekDayTasks[],
  liveByProject: Map<string, ProduccionProjectLive> | undefined,
): { meta: number | null; real: number | null } {
  const daily = days
    .map((day) => produccionDayScore(day, liveByProject))
    .filter((day) => day.real != null)
  if (daily.length === 0) return { meta: null, real: null }
  const real = Math.round(daily.reduce((sum, day) => sum + (day.real ?? 0), 0) / daily.length)
  return { meta: 100, real }
}

export function averageProduccionProgress(
  days: ProduccionWeekDayTasks[],
  liveByProject: Map<string, ProduccionProjectLive> | undefined,
): number | null {
  let sum = 0
  let count = 0
  for (const day of days) {
    for (const column of PROGRESS_LANES) {
      for (const task of day[column.key]) {
        const badge = taskProgressBadge(task, column.lane, liveByProject)
        if (badge?.percent == null) continue
        sum += badge.percent
        count += 1
      }
    }
  }
  if (count === 0) return null
  return Math.round(sum / count)
}

export function taskProgressPdfBlock(
  task: ProduccionSemanalTask,
  lane: ProduccionTaskLane,
  liveByProject: Map<string, ProduccionProjectLive> | undefined,
): string {
  const badge = taskProgressBadge(task, lane, liveByProject)
  const helped = armadoHelpersLabel(task.helpers)
  if (!badge || badge.label === 'Cargando avance…' || badge.label === 'Sin marcar') {
    return helped ? `${task.text}\n${helped}` : task.text
  }
  const lines = [task.text, badge.label]
  if (helped) lines.push(helped)
  for (const piece of badge.pieces) {
    const status = piece.done ? 'Lista' : 'Falta'
    lines.push([status, piece.name, piece.timeLabel].filter(Boolean).join('  ·  '))
  }
  return lines.join('\n')
}
