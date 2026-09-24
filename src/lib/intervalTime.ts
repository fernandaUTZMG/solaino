/** Parsea timestamps de Postgres/Supabase a ms Unix. */
export function parseIntervalMs(value: string | null | undefined): number | null {
  if (value == null) return null
  const raw = String(value).trim()
  if (!raw) return null

  let iso = raw.includes('T') ? raw : raw.replace(' ', 'T')
  iso = iso.replace(/\.(\d{3})\d+/, '.$1')
  iso = iso.replace(/([+-]\d{2})$/, '$1:00')
  iso = iso.replace(/([+-]\d{2})(\d{2})$/, '$1:$2')

  if (!/[zZ]|[+-]\d{2}:\d{2}$/.test(iso)) iso += 'Z'

  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : null
}

export function intervalDate(value: string | null | undefined): Date | null {
  const ms = parseIntervalMs(value)
  return ms == null ? null : new Date(ms)
}

/** Segundos entre inicio y fin. Si el inicio queda después del fin, cuenta el tramo igual (misma cifra que los minutos). */
export function spanSeconds(startedAt: string, endedAt: string | null | undefined, nowMs: number): number {
  const start = parseIntervalMs(startedAt)
  if (start == null) return 0
  const end = endedAt ? parseIntervalMs(endedAt) : nowMs
  if (end == null) return 0
  return Math.floor(Math.abs(end - start) / 1000)
}
