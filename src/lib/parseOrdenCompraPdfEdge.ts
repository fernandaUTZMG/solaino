import { getSupabase } from './supabaseClient'
import type { OrdenCompraInferred } from '../../supabase/functions/_shared/ordenCompraTextParse.ts'

export type ParseOrdenCompraPdfEdgeOk = {
  ok: true
  source: 'edge'
  metadataDateIso: string | null
  inferred: OrdenCompraInferred
  cotizacion_lineas: string[]
  textCharCount?: number
}

export type ParseOrdenCompraPdfEdgeErr = {
  ok: false
  error: string
  code?: string
}

export type ParseOrdenCompraPdfEdgeResult = ParseOrdenCompraPdfEdgeOk | ParseOrdenCompraPdfEdgeErr

const INVOKE_TIMEOUT_MS = 180_000

/** En `vite dev`, mismo origen + proxy (ver vite.config). En build, URL absoluta de Supabase. */
function edgeFunctionUrl(functionName: string): string {
  if (import.meta.env.DEV) {
    return `/__supabase-functions/${functionName}`
  }
  const base = (import.meta.env.VITE_SUPABASE_URL as string).replace(/\/$/, '')
  return `${base}/functions/v1/${functionName}`
}

/**
 * Extrae texto y campos de una OC en Supabase Edge Function (PDF.js serverless / unpdf).
 * Requiere función desplegada: `supabase functions deploy parse-orden-compra-pdf`.
 *
 * Usa `fetch` en lugar de `functions.invoke` para poder pasar por el proxy de Vite en desarrollo
 * y evitar errores de CORS en el preflight.
 */
export async function parseOrdenCompraPdfViaEdge(file: File): Promise<ParseOrdenCompraPdfEdgeResult> {
  try {
    const sb = getSupabase()
    const buf = await file.arrayBuffer()
    const { data: sessionData, error: sessionErr } = await sb.auth.getSession()
    if (sessionErr || !sessionData.session?.access_token) {
      return {
        ok: false,
        error: sessionErr?.message ?? 'Inicia sesión para analizar el PDF.',
        code: 'session',
      }
    }

    const url = edgeFunctionUrl('parse-orden-compra-pdf')
    const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), INVOKE_TIMEOUT_MS)

    let res: Response
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`,
          apikey: anon,
          'Content-Type': 'application/pdf',
          'x-filename': encodeURIComponent(file.name || 'orden.pdf'),
        },
        body: buf,
        signal: ac.signal,
      })
    } catch (e) {
      const aborted = e instanceof Error && e.name === 'AbortError'
      let detail = e instanceof Error ? e.message : String(e)
      if (aborted) {
        detail = 'Tiempo de espera agotado al llamar a la función (180s).'
      } else if (/Failed to fetch|Load failed|NetworkError/i.test(detail)) {
        detail +=
          ' Suele pasar si el navegador bloquea la respuesta (CORS), la petición se corta por tiempo, o la función no respondió. En desarrollo usa `npm run dev` (proxy Vite). En el proyecto Supabase, despliega `parse-orden-compra-pdf` con `verify_jwt = false` en `supabase/config.toml` y prueba con un PDF más liviano.'
      }
      return { ok: false, error: detail, code: aborted ? 'timeout' : 'network' }
    } finally {
      clearTimeout(timer)
    }

    const raw = await res.text()
    let parsed: unknown
    try {
      parsed = raw ? JSON.parse(raw) : null
    } catch {
      return {
        ok: false,
        error: `Respuesta no válida (HTTP ${res.status}).`,
        code: 'parse',
      }
    }

    if (!res.ok) {
      let msg =
        parsed &&
        typeof parsed === 'object' &&
        parsed !== null &&
        'error' in parsed &&
        typeof (parsed as { error: unknown }).error === 'string'
          ? (parsed as { error: string }).error
          : `Error HTTP ${res.status}`
      if (res.status === 503 || res.status === 502) {
        msg += `. Suele indicar que la Edge Function en Supabase se quedó sin recursos o reinició (PDF muy grande o muchas páginas). Revisa Edge Functions → Logs en el Dashboard; prueba un PDF más liviano o deja que el navegador lo lea (la app ya intenta eso primero si hay texto).`
      }
      return { ok: false, error: msg, code: 'http' }
    }

    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, error: 'Respuesta vacía del servidor', code: 'empty' }
    }
    if ('ok' in parsed && parsed.ok === false) {
      return {
        ok: false,
        error: (parsed as ParseOrdenCompraPdfEdgeErr).error || 'Error en el servidor',
        code: 'fn',
      }
    }
    const ok = parsed as ParseOrdenCompraPdfEdgeOk
    if (!ok.inferred || !Array.isArray(ok.cotizacion_lineas)) {
      return { ok: false, error: 'Formato de respuesta inválido', code: 'shape' }
    }
    return ok
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error de red', code: 'network' }
  }
}
