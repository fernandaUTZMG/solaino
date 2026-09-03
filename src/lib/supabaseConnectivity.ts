import { isSupabaseConfigured } from '../env'

export type ConnectivityResult = {
  ok: boolean
  message: string
  detail?: string
}

function supabaseBaseUrl(): string {
  return String(import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '')
}

/** Prueba si esta app (Electron o navegador) puede llegar a Supabase. */
export async function testSupabaseConnectivity(): Promise<ConnectivityResult> {
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      message:
        'Esta copia de SOLAINO no trae configurado Supabase. Reinstala con el instalador oficial (no copies solo el .exe suelto).',
    }
  }

  const url = supabaseBaseUrl()
  const key = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? '')
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 15_000)

  try {
    const res = await fetch(`${url}/auth/v1/health`, {
      method: 'GET',
      headers: { apikey: key },
      signal: ac.signal,
    })
    if (res.ok) {
      return {
        ok: true,
        message: `Conexión correcta con ${url}`,
      }
    }
    const body = await res.text().catch(() => '')
    return {
      ok: false,
      message: `Supabase respondió HTTP ${res.status}. La red llega, pero hubo un error del servidor.`,
      detail: body.slice(0, 200) || undefined,
    }
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e)
    const aborted = e instanceof Error && e.name === 'AbortError'
    return {
      ok: false,
      message: aborted
        ? 'Tiempo de espera agotado (15 s). Firewall, antivirus o red de la planta bloquean SOLAINO.'
        : /failed to fetch|load failed|networkerror/i.test(raw)
          ? 'No hay conexión desde SOLAINO (Failed to fetch). El navegador puede abrir Supabase pero esta app está bloqueada: firewall, antivirus o red.'
          : `Error de red: ${raw}`,
      detail: url,
    }
  } finally {
    clearTimeout(timer)
  }
}
