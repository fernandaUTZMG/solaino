import { parseWeekMondayKey } from './bodegaWeekCalendar'

export const PRODUCCION_SEMANAL_WEEKDAYS = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
] as const

export type ProduccionSemanalDayIndex = 0 | 1 | 2 | 3 | 4

/** Ej. «15-19 DE JUNIO 2026» (como el Excel de planta). */
export function formatProduccionSemanalTitleRange(weekStartKey: string): string {
  const start = parseWeekMondayKey(weekStartKey)
  const end = new Date(start)
  end.setDate(end.getDate() + 4)
  const month = end.toLocaleDateString('es-MX', { month: 'long' }).toUpperCase()
  return `${start.getDate()}-${end.getDate()} DE ${month} ${end.getFullYear()}`
}

/** Líneas no vacías para mostrar en celdas (una tarea por línea). */
export function splitProduccionSemanalLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
}

/** Texto para PDF: una tarea por línea (solo ASCII; Helvetica no dibuja bien ────). */
export function produccionSemanalTasksForPdf(text: string): string {
  const lines = splitProduccionSemanalLines(text)
  if (lines.length === 0) return '—'
  if (lines.length === 1) return lines[0]
  return lines.join('\n----------\n')
}
