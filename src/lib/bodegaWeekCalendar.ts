/** Lunes de la semana (fecha local) como YYYY-MM-DD. */
export function weekMondayKey(d: Date): string {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const day = (x.getDay() + 6) % 7
  x.setDate(x.getDate() - day)
  const y = x.getFullYear()
  const m = String(x.getMonth() + 1).padStart(2, '0')
  const dayNum = String(x.getDate()).padStart(2, '0')
  return `${y}-${m}-${dayNum}`
}

export function parseWeekMondayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

export function addWeeksToMondayKey(key: string, deltaWeeks: number): string {
  const d = parseWeekMondayKey(key)
  d.setDate(d.getDate() + deltaWeeks * 7)
  return weekMondayKey(d)
}

export function formatWeekRangeEs(weekStartKey: string): string {
  const start = parseWeekMondayKey(weekStartKey)
  const end = new Date(start)
  end.setDate(end.getDate() + 4)
  const fmt = (dt: Date) =>
    dt.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
  return `${fmt(start)} – ${fmt(end)}`
}

export const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'] as const

/** Lista de lunes (YYYY-MM-DD) para selector de exportación: pasado + futuro cercano. */
export function listSelectableWeekKeys(anchorMondayKey: string, pastWeeks = 16, futureWeeks = 4): string[] {
  const keys: string[] = []
  for (let i = pastWeeks; i >= 1; i--) {
    keys.push(addWeeksToMondayKey(anchorMondayKey, -i))
  }
  keys.push(anchorMondayKey)
  for (let i = 1; i <= futureWeeks; i++) {
    keys.push(addWeeksToMondayKey(anchorMondayKey, i))
  }
  return keys
}
