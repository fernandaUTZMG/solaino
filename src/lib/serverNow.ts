import { isSupabaseConfigured } from '../env'
import { parseIntervalMs } from './intervalTime'

/** Desfase PC ↔ Supabase. Positivo = la PC está atrasada. */
let offsetMs = 0
let syncing: Promise<void> | null = null

export function nowMs(): number {
  return Date.now() + offsetMs
}

export function nowDate(): Date {
  return new Date(nowMs())
}

export function serverClockOffsetMs(): number {
  return offsetMs
}

function applyOffset(serverMs: number, t0: number, t1: number) {
  const mid = t0 + (t1 - t0) / 2
  offsetMs = serverMs - mid
}

/**
 * Alinea el reloj del cliente con el de Supabase para que los cronómetros
 * midan el mismo instante que `started_at` / `now()` en la base.
 */
export function syncServerClock(): Promise<void> {
  if (syncing) return syncing
  syncing = (async () => {
    try {
      await syncFromSupabase()
    } finally {
      syncing = null
    }
  })()
  return syncing
}

async function syncFromSupabase(): Promise<void> {
  if (!isSupabaseConfigured()) return

  try {
    const { getSupabase } = await import('./supabaseClient')
    const t0 = Date.now()
    const { data, error } = await getSupabase().rpc('bodega_server_now')
    const t1 = Date.now()
    if (!error && data != null) {
      const server = parseIntervalMs(String(data))
      if (server != null) {
        applyOffset(server, t0, t1)
        return
      }
    }
  } catch {
    /* fallback HTTP Date */
  }

  const url = String(import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '')
  const key = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? '')
  if (!url || !key) return

  const t0 = Date.now()
  const res = await fetch(`${url}/auth/v1/health`, {
    method: 'GET',
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  const t1 = Date.now()
  const hdr = res.headers.get('date')
  const fromHeader = hdr ? Date.parse(hdr) : NaN
  if (Number.isFinite(fromHeader)) {
    applyOffset(fromHeader, t0, t1)
  }
}
