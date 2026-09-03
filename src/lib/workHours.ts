export type WorkSchedule = {

  weekDays: number[] // 1..5 = lun..vie

  start: { hour: number; minute: number }

  end: { hour: number; minute: number }

  /** Zona IANA; por defecto planta SOLAINO (Hermosillo). */

  timeZone?: string

}



export const DEFAULT_SOLAINO_SCHEDULE: WorkSchedule = {

  weekDays: [1, 2, 3, 4, 5],

  start: { hour: 8, minute: 0 },

  end: { hour: 17, minute: 30 },

  timeZone: 'America/Mexico_City',

}



const FALLBACK_TIME_ZONE = 'America/Mexico_City'



function toMinutes(h: number, m: number): number {

  return h * 60 + m

}



function resolveTimeZone(schedule: WorkSchedule): string {

  const tz = schedule.timeZone?.trim()

  return tz || FALLBACK_TIME_ZONE

}



type ZonedParts = {

  year: number

  month: number

  day: number

  hour: number

  minute: number

  dowMon1: number

}



function getZonedParts(instant: Date, timeZone: string): ZonedParts {

  const fmt = new Intl.DateTimeFormat('en-US', {

    timeZone,

    year: 'numeric',

    month: '2-digit',

    day: '2-digit',

    hour: '2-digit',

    minute: '2-digit',

    hour12: false,

    weekday: 'short',

  })

  const map: Record<string, string> = {}

  for (const p of fmt.formatToParts(instant)) {

    if (p.type !== 'literal') map[p.type] = p.value

  }

  const wdMap: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }

  return {

    year: Number(map.year),

    month: Number(map.month),

    day: Number(map.day),

    hour: Number(map.hour),

    minute: Number(map.minute),

    dowMon1: wdMap[map.weekday ?? 'Mon'] ?? 1,

  }

}



/** Convierte fecha/hora «de pared» en la zona dada a instante UTC. */

function zonedLocalToInstant(

  year: number,

  month: number,

  day: number,

  hour: number,

  minute: number,

  timeZone: string,

): Date {

  let t = Date.UTC(year, month - 1, day, hour, minute, 0)

  for (let i = 0; i < 6; i++) {

    const p = getZonedParts(new Date(t), timeZone)

    const wantKey = year * 10000 + month * 100 + day

    const gotKey = p.year * 10000 + p.month * 100 + p.day

    const dayDelta = wantKey - gotKey

    const minDelta = hour * 60 + minute - (p.hour * 60 + p.minute)

    const adjustMin = dayDelta * 1440 + minDelta

    if (adjustMin === 0) break

    t += adjustMin * 60_000

  }

  return new Date(t)

}



function addCalendarDays(y: number, m: number, d: number, delta: number): { y: number; m: number; d: number } {

  const dt = new Date(Date.UTC(y, m - 1, d + delta))

  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() }

}



function calendarKey(y: number, m: number, d: number): number {

  return y * 10000 + m * 100 + d

}



/**

 * Calcula minutos dentro de horario laboral entre `start` y `end`.

 * - Lun–Vie 08:00–17:30 por defecto en `America/Mexico_City`.

 * - Ignora sábados/domingos.

 */

export function businessMinutesBetween(start: Date, end: Date, schedule: WorkSchedule = DEFAULT_SOLAINO_SCHEDULE): number {

  const tz = resolveTimeZone(schedule)

  const a = start.getTime() <= end.getTime() ? start : end

  const b = start.getTime() <= end.getTime() ? end : start



  if (!Number.isFinite(a.getTime()) || !Number.isFinite(b.getTime())) return 0

  if (a.getTime() === b.getTime()) return 0



  const startMin = toMinutes(schedule.start.hour, schedule.start.minute)

  const endMin = toMinutes(schedule.end.hour, schedule.end.minute)

  if (endMin <= startMin) return 0



  const startParts = getZonedParts(a, tz)

  const endParts = getZonedParts(b, tz)

  const endKey = calendarKey(endParts.year, endParts.month, endParts.day)



  let y = startParts.year

  let m = startParts.month

  let d = startParts.day

  let total = 0



  while (true) {

    const key = calendarKey(y, m, d)

    const noon = zonedLocalToInstant(y, m, d, 12, 0, tz)

    const dow = getZonedParts(noon, tz).dowMon1

    if (schedule.weekDays.includes(dow)) {

      const dayStart = zonedLocalToInstant(y, m, d, schedule.start.hour, schedule.start.minute, tz)

      const dayEnd = zonedLocalToInstant(y, m, d, schedule.end.hour, schedule.end.minute, tz)

      const segStart = new Date(Math.max(dayStart.getTime(), a.getTime()))

      const segEnd = new Date(Math.min(dayEnd.getTime(), b.getTime()))

      const ms = segEnd.getTime() - segStart.getTime()

      if (ms > 0) total += Math.round(ms / 60000)

    }

    if (key >= endKey) break

    ;({ y, m, d } = addCalendarDays(y, m, d, 1))

  }



  return total

}



/** Horas decimales dentro del horario laboral (misma lógica que `businessMinutesBetween`). */

export function businessHoursBetween(

  start: Date,

  end: Date,

  schedule: WorkSchedule = DEFAULT_SOLAINO_SCHEDULE,

): number {

  return businessMinutesBetween(start, end, schedule) / 60

}


