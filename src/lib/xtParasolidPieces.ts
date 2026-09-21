/**
 * Lee la lista de piezas de un ensamble Parasolid en texto (`.x_t`) exportado por SolidWorks.
 *
 * Formato verificado con SOLIDWORKS 2025 / Parasolid 36.1:
 * - El cuerpo va cortado en columnas de 80 caracteres, así que un nombre puede quedar partido
 *   por un CRLF. Hay que unir las líneas antes de buscar.
 * - Las cadenas se guardan como `<longitud> <id> <texto>`, donde `<longitud>` es el número
 *   exacto de caracteres de `<texto>`. Eso permite leerlas sin adivinar dónde terminan.
 *
 * Los `.x_b` (Parasolid binario) no se pueden leer sin licencia comercial: `format` lo indica.
 */

export type XtPieceCandidate = {
  name: string
  /** Veces que aparece el nombre en el archivo. Hoy siempre 1: el `.x_t` no lleva cantidades. */
  occurrences: number
}

export type XtParseResult = {
  /** Nombre del ensamble según el encabezado (`KEY=`). */
  assemblyKey: string
  /** Aplicación que exportó (`APPL=`), p. ej. `SOLIDWORKS 2025-2025261`. */
  exportedBy: string
  /** `text` es legible; cualquier otro valor significa que no se puede extraer nada. */
  format: string
  pieces: XtPieceCandidate[]
  /** Cadenas con letras que el filtro descartó. Útil para depurar un ensamble nuevo. */
  discarded: string[]
}

/** Cadenas internas de Parasolid / SolidWorks que no son piezas. */
const NOISE_EXACT = new Set([
  'SDL/TYSA_NAME',
  'SDL/TYSA_DENSITY',
  'SWIMPLICITBODYNAME_ID_U',
  'SWIMPLICITBODYNAME_ID',
  'SWEntUnchanged',
  'TexSplitFace',
])

const NOISE_PREFIX = ['SDL/', 'SW', 'SCH_', 'PS_', 'TEX', 'MC_', 'USFLD']

/** Nombres de operaciones de SolidWorks, no de piezas. */
const FEATURE_WORDS = [
  'refrentado',
  'avellanado',
  'agujero',
  'cortar',
  'extruir',
  'redondeo',
  'chaflan',
  'chaflán',
  'taladro',
  'roscado',
  'saliente',
  'revolucion',
  'revolución',
  'nervio',
  'vaciado',
  'matriz',
  'simetria',
  'simetría',
  'barrido',
  'recubrir',
  'croquis',
]

function isNoise(name: string): boolean {
  if (NOISE_EXACT.has(name)) return true
  if (NOISE_PREFIX.some((p) => name.startsWith(p))) return true
  const lower = name.toLowerCase()
  if (FEATURE_WORDS.some((w) => lower.startsWith(w))) return true
  // Las operaciones del asistente de taladro se llaman como una frase («… para tornillo tapón
  // con cabeza plana …»); los nombres de pieza del taller no llevan preposiciones.
  if (/[a-z]/.test(name) && /\s(para|con|de|del|sin|por)\s/i.test(name)) return true
  return false
}

export function looksLikeXtPieceName(name: string): boolean {
  if (name.length < 3 || name.length > 80) return false
  if (name !== name.trim()) return false
  if (!/^[A-Za-zÁ-úñÑ]/.test(name)) return false
  if (/[\u0000-\u001f]/.test(name)) return false
  const letters = name.match(/[A-Za-zÁ-úñÑ]/g) ?? []
  if (letters.length < 3) return false
  if (letters.length / name.length < 0.35) return false
  // `FFF1`, `BAAAAB` y compañía son relleno del formato, no nombres: usan muy pocas letras distintas.
  if (new Set(letters.map((c) => c.toUpperCase())).size < 3) return false
  return !isNoise(name)
}

function isDigits(body: string, start: number, end: number): boolean {
  for (let i = start; i < end; i++) {
    const c = body.charCodeAt(i)
    if (c < 48 || c > 57) return false
  }
  return end > start
}

/**
 * Recorre todos los pares de tokens numéricos consecutivos buscando `<longitud> <id> <texto>`.
 * Un `RegExp` global no sirve: al consumir `84 18` de `84 18 85480 TOPE BASE GUIA IZQ`
 * nunca probaría `18 85480`, que es el par correcto.
 */
function extractStrings(body: string): Map<string, number> {
  /** Posición de inicio -> texto más largo válido ahí (solo hay una cadena real por posición). */
  const byStart = new Map<number, string>()

  let tokenStart = 0
  let prevStart = -1
  let prevEnd = -1

  for (let i = 0; i <= body.length; i++) {
    if (i !== body.length && body.charCodeAt(i) !== 32) continue

    const curStart = tokenStart
    const curEnd = i
    tokenStart = i + 1

    if (!isDigits(body, curStart, curEnd)) {
      prevStart = -1
      prevEnd = -1
      continue
    }

    if (prevStart >= 0 && prevEnd - prevStart <= 4) {
      const len = Number(body.slice(prevStart, prevEnd))
      const start = curEnd + 1
      if (len >= 3 && len <= 80 && start + len < body.length) {
        const text = body.slice(start, start + len)
        const next = body.charCodeAt(start + len)
        // Tras el texto debe venir un dígito: es el inicio del registro siguiente.
        if (next >= 48 && next <= 57 && !/[\u0000-\u001f]/.test(text)) {
          const prev = byStart.get(start)
          if (prev == null || text.length > prev.length) byStart.set(start, text)
        }
      }
    }

    prevStart = curStart
    prevEnd = curEnd
  }

  const found = new Map<string, number>()
  for (const text of byStart.values()) {
    found.set(text, (found.get(text) ?? 0) + 1)
  }
  return found
}

function headerValue(header: string, key: string): string {
  const m = new RegExp(`${key}=([^;]*)`).exec(header)
  return m?.[1]?.trim() ?? ''
}

export function parseXtPieces(raw: string): XtParseResult {
  const headerEnd = raw.indexOf('**END_OF_HEADER')
  const header = headerEnd >= 0 ? raw.slice(0, headerEnd) : ''
  const format = headerValue(header, 'FORMAT') || 'desconocido'
  const result: XtParseResult = {
    assemblyKey: headerValue(header, 'KEY'),
    exportedBy: headerValue(header, 'APPL'),
    format,
    pieces: [],
    discarded: [],
  }
  if (format !== 'text') return result

  // Quitar el corte de línea de 80 columnas para reconstruir el flujo original.
  const body = raw.slice(headerEnd).replace(/\r?\n/g, '')
  const strings = extractStrings(body)

  for (const [name, occurrences] of strings) {
    if (looksLikeXtPieceName(name)) result.pieces.push({ name, occurrences })
    else if (/[A-Za-z]{3}/.test(name)) result.discarded.push(name)
  }
  result.pieces.sort((a, b) => a.name.localeCompare(b.name, 'es'))
  return result
}

export function isXtDesignFile(file: File): boolean {
  return /\.x_t$/i.test(file.name) || (/\.xt$/i.test(file.name) && !/\.x_b$/i.test(file.name))
}

/** Parasolid en texto es ASCII/latin1; `utf-8` rompería los acentos de los nombres. */
export function decodeXtBytes(bytes: ArrayBuffer | Uint8Array): string {
  return new TextDecoder('latin1').decode(bytes)
}

export async function parseXtFile(file: Blob): Promise<XtParseResult> {
  return parseXtPieces(decodeXtBytes(await file.arrayBuffer()))
}
