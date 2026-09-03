/**
 * Edge Function: lee un PDF de orden de compra en el servidor (PDF.js vía unpdf),
 * reconstruye líneas con coordenadas (tablas Coupa) y devuelve JSON para autollenado.
 *
 * Despliegue (incluye verify_jwt desde supabase/config.toml):
 *   supabase functions deploy parse-orden-compra-pdf
 *
 * Si el navegador marca CORS en preflight, en Dashboard comprueba que esta función
 * tenga JWT verification desactivada (o vuelve a desplegar con config.toml actual).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { extractPagePlainTextFromPdfJs } from '../_shared/ordenCompraPdfItemLines.ts'
import {
  extractCotizacionLineDescriptions,
  parseOrdenCompraFromText,
  parsePdfMetaDate,
} from '../_shared/ordenCompraTextParse.ts'

const MAX_BYTES = 12 * 1024 * 1024
/** Límite de páginas en Edge (memoria ~256 MB); PDFs más largos: partir archivo o usar solo el navegador. */
const MAX_PAGES = 35

/** CORS: refleja los encabezados del preflight para que el cliente de Supabase no falle. */
function corsHeaders(req: Request): Record<string, string> {
  const requested = req.headers.get('Access-Control-Request-Headers')
  const allowHeaders =
    requested?.trim() ||
    'authorization, x-client-info, apikey, content-type, prefer, x-supabase-authorization, x-filename, accept'
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': allowHeaders,
    'Access-Control-Max-Age': '86400',
  }
}

function json(req: Request, body: unknown, status: number): Response {
  const h = corsHeaders(req)
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...h, 'Content-Type': 'application/json' },
  })
}

function numeroFromFilename(name: string): string {
  const base = (name.split(/[/\\]/).pop() ?? name).replace(/\.[^.]+$/, '')
  const m = base.match(/(C-\d{6,}|[A-Z0-9]{4,})/i)
  return (m?.[1] ?? base).toUpperCase().replace(/\s+/g, '')
}

async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req) })
  }
  if (req.method !== 'POST') {
    return json(req, { ok: false, error: 'Method not allowed' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !anonKey) {
    return json(req, { ok: false, error: 'Faltan variables de entorno en la función' }, 500)
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return json(req, { ok: false, error: 'Sin autorización' }, 401)
  }

  const jwt = authHeader.slice('Bearer '.length).trim()
  if (!jwt) {
    return json(req, { ok: false, error: 'Token vacío' }, 401)
  }

  const userClient = createClient(supabaseUrl, anonKey)
  const { data: userData, error: userErr } = await userClient.auth.getUser(jwt)
  if (userErr || !userData.user) {
    return json(req, { ok: false, error: 'Sesión inválida' }, 401)
  }

  const { data: prof, error: profErr } = await userClient
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .maybeSingle()

  if (profErr || !prof) {
    return json(req, { ok: false, error: 'No se pudo verificar el perfil' }, 403)
  }

  const role = String((prof as { role?: string }).role ?? '')
  if (role !== 'admin' && role !== 'encargado') {
    return json(req, { ok: false, error: 'Solo admin o encargado pueden analizar PDF de OC' }, 403)
  }

  const ct = (req.headers.get('content-type') ?? '').toLowerCase()
  if (!ct.includes('pdf') && !ct.includes('octet-stream')) {
    return json(req, { ok: false, error: 'Content-Type debe ser application/pdf' }, 400)
  }

  const buf = new Uint8Array(await req.arrayBuffer())
  if (buf.byteLength === 0) {
    return json(req, { ok: false, error: 'Cuerpo vacío' }, 400)
  }
  if (buf.byteLength > MAX_BYTES) {
    return json(req, { ok: false, error: 'PDF demasiado grande (máx. 12 MB)' }, 413)
  }

  const encName = req.headers.get('x-filename')
  let filename = 'orden.pdf'
  if (encName) {
    try {
      filename = decodeURIComponent(encName)
    } catch {
      filename = encName
    }
  }

  const baseNumero = numeroFromFilename(filename)

  let metadataDateIso: string | null = null
  let text = ''

  try {
    // Import dinámico: si falla unpdf, al menos OPTIONS y auth ya respondieron con CORS.
    const { getResolvedPDFJS } = await import('npm:unpdf@1.6.2')
    const { getDocument } = await getResolvedPDFJS()
    const pdf = await getDocument({ data: buf }).promise

    try {
      const meta = await pdf.getMetadata()
      const info = meta?.info as Record<string, unknown> | undefined
      metadataDateIso = parsePdfMetaDate(info?.CreationDate) ?? parsePdfMetaDate(info?.ModDate)
    } catch {
      // sin metadatos
    }

    const n = pdf.numPages
    if (n > MAX_PAGES) {
      return json(
        req,
        {
          ok: false,
          error: `Este PDF tiene ${n} páginas; el límite en servidor es ${MAX_PAGES}. Usa un PDF más corto, divídelo, o deja que la app lo lea solo en el navegador.`,
        },
        413,
      )
    }
    const partsOrdered: string[] = new Array(n)
    // Una página a la vez reduce picos de memoria (evita 503 por OOM en Edge).
    for (let pageNum = 1; pageNum <= n; pageNum++) {
      const page = await pdf.getPage(pageNum)
      partsOrdered[pageNum - 1] = await extractPagePlainTextFromPdfJs(page)
    }
    text = partsOrdered.join('\n\n')
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'No se pudo leer el PDF'
    return json(req, { ok: false, error: msg }, 422)
  }

  const inferred = parseOrdenCompraFromText(text, baseNumero)
  const cotizacion_lineas = extractCotizacionLineDescriptions(text)

  return json(
    req,
    {
      ok: true as const,
      source: 'edge' as const,
      metadataDateIso,
      inferred,
      cotizacion_lineas,
      textCharCount: text.length,
    },
    200,
  )
}

Deno.serve(async (req) => {
  try {
    return await handle(req)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error interno'
    return json(req, { ok: false, error: msg }, 500)
  }
})
