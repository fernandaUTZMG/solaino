/**
 * Parser puro desde texto plano de una OC (Coupa/Jabil y similares).
 * Compartido entre el cliente (Vite) y la Edge Function de Supabase.
 */

export type OrdenCompraInferred = {
  numero: string
  fechaIso: string | null
  empresaHint: string | null
  requisitorHint: string | null
}

function collapseWs(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

/** DD/MM/YYYY o DD-MM-YYYY (México). */
export function parseMxDateToIso(raw: string): string | null {
  const s = raw.trim()
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
  if (!m) return null
  let d = Number(m[1])
  let mo = Number(m[2])
  let y = Number(m[3])
  if (y < 100) y += 2000
  if (!Number.isFinite(d) || !Number.isFinite(mo) || !Number.isFinite(y)) return null
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  const dt = new Date(Date.UTC(y, mo - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function firstLineValue(afterLabel: string, text: string): string | null {
  const idx = text.toLowerCase().indexOf(afterLabel.toLowerCase())
  if (idx === -1) return null
  const rest = text.slice(idx + afterLabel.length)
  const chunk = rest.slice(0, 280)
  const line = chunk.split(/\n/)[0] ?? chunk
  const val = collapseWs(line.replace(/^[\s:.\-_]+/, ''))
  if (val.length < 2 || val.length > 200) return null
  return val
}

function findDateNearKeywords(text: string): string | null {
  const head = text.slice(0, 3500)
  const re = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/g
  const keywords = [
    'fecha',
    'emision',
    'emisión',
    'expedic',
    'orden',
    'compra',
    'elabor',
    'date',
    'po number',
    'purchase',
  ]
  let best: { iso: string; dist: number } | null = null
  let m: RegExpExecArray | null
  while ((m = re.exec(head)) !== null) {
    const iso = parseMxDateToIso(m[0])
    if (!iso) continue
    const start = m.index
    const win = head.slice(Math.max(0, start - 60), Math.min(head.length, start + 60)).toLowerCase()
    const dist = keywords.reduce((acc, k) => (win.includes(k) ? acc + 1 : acc), 0)
    if (!best || dist > best.dist) best = { iso, dist }
  }
  if (best && best.dist > 0) return best.iso
  const first = head.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/)
  return first ? parseMxDateToIso(first[0]) : null
}

function extractNumeroFromText(text: string, fallbackFromName: string): string {
  const upper = text.toUpperCase()
  const patterns = [
    /PO\s*#\s*\/\s*Número\s+de\s+Orden\s+de\s+Compra\s*:?\s*([A-Z][A-Z0-9]{4,})/i,
    /Número\s+de\s+Orden\s+de\s+Compra\s*:?\s*([A-Z][A-Z0-9]{4,})/i,
    /PO\s+Number\s*\/\s*No\.?\s*De\s+Orden\s+de\s+Compra:\s*([A-Z0-9]+)/i,
    /PO\s*NUMBER\s*[:\s]*\s*(C-\d{6,})/i,
    /C-\d{6,}/,
    /OC\s*[#:]?\s*([A-Z0-9\-]{4,})/i,
    /ORDEN\s+DE\s+COMPRA\s*[#:]?\s*([A-Z0-9\-]{4,})/i,
    /N[°º]?\s*(?:OC|ORDEN)\s*[#:]?\s*([A-Z0-9\-]{4,})/i,
  ]
  for (const p of patterns) {
    const m = upper.match(p) ?? text.match(p)
    if (m) return (m[1] ?? m[0]).replace(/\s+/g, '').toUpperCase()
  }
  return fallbackFromName.toUpperCase()
}

const EMPRESA_LABELS = [
  'razón social',
  'razon social',
  'nombre del cliente',
  'cliente',
  'nombre comercial',
  'empresa',
]

const REQUISITOR_LABELS = [
  'solicitante',
  'requisitor',
  'requisitó',
  'requisito',
  'solicita',
  'atención',
  'atencion',
  'comprador',
  'elaboró',
  'elaboro',
  'preparó',
  'preparo',
  'autoriza',
]

function hintFromLabels(text: string, labels: string[]): string | null {
  const t = text.replace(/\r/g, '\n')
  for (const label of labels) {
    const v = firstLineValue(label, t)
    if (v && !/^[\d.\s\-\/]+$/.test(v)) return v
  }
  return null
}

function linesAfterLabel(
  full: string,
  labelPattern: RegExp,
  endPattern: RegExp | null,
  maxChars = 1200,
): string[] {
  const m = full.match(labelPattern)
  if (!m || m.index === undefined) return []
  let rest = full.slice(m.index + m[0].length, m.index + m[0].length + maxChars)
  if (endPattern) {
    const end = rest.search(endPattern)
    if (end > 15) rest = rest.slice(0, end)
  }
  return rest
    .split(/\n/)
    .map((l) => collapseWs(l))
    .filter((l) => l.length > 0)
    .slice(0, 18)
}

function pickBuyerCompanyFromLines(lines: string[]): string | null {
  for (const line of lines) {
    if (line.length < 5) continue
    if (/@/.test(line)) continue
    if (/^attn\b|^contact\b|^tel\b|^phone\b|^email\b/i.test(line)) continue
    if (looksLikeStreetOnly(line)) continue
    if (/\b(SA|CV|RL|INC\.?|LLC|S\.?\s*DE\s+R\.?L\.?|S\.?\s*A\.?|CIRCUIT)\b/i.test(line)) return line
  }
  for (const line of lines) {
    if (line.length < 8) continue
    if (/@/.test(line)) continue
    if (/^attn\b|^contact\b/i.test(line)) continue
    if (looksLikeStreetOnly(line)) continue
    return line
  }
  return null
}

/** Normaliza razón social larga duplicada en una sola línea (Coupa/Jabil). */
function normalizeEmpresaHint(raw: string | null): string | null {
  if (!raw) return null
  let s = collapseWs(raw)
  const m = s.match(/\b(Jabil\s+Circuit\s+de\s+Mexico|JABIL\s+Circuit\s+de\s+Mexico)\b/i)
  if (m) return 'Jabil Circuit de Mexico'
  const f = s.match(/\b(Flextronics Technologies[^,\n]{0,100}(?:,\s*S\.\s*de\s*R\.?\s*L\.?\s*de\s*C\.?\s*V\.?)?)\b/i)
  if (f) return collapseWs(f[1])
  if (s.length > 88) s = s.slice(0, 88).trim()
  return s || null
}

function extractEmpresaFromEnglishBlocks(full: string): string | null {
  const flexOnly = /\bFlextronics\b/i.test(full) && /\bDesc\s*\/\s*Descripción\s*:/i.test(full)
  if (flexOnly) {
    const m = full.match(
      /\bFlextronics Technologies[^,\n]{0,120}(?:,\s*S\.\s*de\s*R\.?\s*L\.?\s*de\s*C\.?\s*V\.?)?/i,
    )
    if (m) return normalizeEmpresaHint(m[0])
  }

  const shipLines = linesAfterLabel(full, /\bShip\s+To\b/i, /\n\s*Dear\s+Supplier\b/i)
  const fromShip = pickBuyerCompanyFromLines(shipLines)
  const billLines = linesAfterLabel(full, /\bBill\s+To\b/i, /\n\s*Ship\s+To\b/i)
  const fromBill = pickBuyerCompanyFromLines(billLines)

  const shipOk = fromShip && !/@/.test(fromShip) && /\b(jabil|circuit|mexico)\b/i.test(fromShip)
  const billHasEmail = fromBill ? /@/.test(fromBill) || /\bsolaino\b/i.test(fromBill) : false

  if (shipOk) return normalizeEmpresaHint(fromShip)
  if (fromBill && !/@/.test(fromBill) && /\b(SA|CV|RL|CIRCUIT)\b/i.test(fromBill) && !/\bsolaino\b/i.test(fromBill)) {
    return normalizeEmpresaHint(fromBill)
  }
  if (fromShip && !/@/.test(fromShip)) return normalizeEmpresaHint(fromShip)
  if (billHasEmail && fromShip) return normalizeEmpresaHint(fromShip)
  if (fromBill && !/@/.test(fromBill)) return normalizeEmpresaHint(fromBill)
  return normalizeEmpresaHint(fromShip ?? fromBill)
}

function looksLikeStreetOnly(s: string): boolean {
  if (/^(TECHNOLOGY|PASEO|CALLE|AV\.|AVE\.|BLVD|CP\s|\d{5})/i.test(s)) return true
  if (/^\d{1,5}\s+[A-ZÁÉÍÓÚÑ]/i.test(s) && !/\b(SA|CV|RL|INC|LLC|S\.?\s*A\.?)\b/i.test(s)) return true
  return false
}

function extractContactEnglish(full: string): string | null {
  const patterns = [
    /\bCONTACT\s*[:\s]+\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s.'-]{2,70}?)(?=\s+[A-Za-z0-9._%+-]+@|\s{2,}|\n|$)/i,
    /\bCONTACT\s*[:\s]*\n\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s.'-]{2,70})/i,
  ]
  for (const p of patterns) {
    const m = full.match(p)
    if (m) {
      const v = collapseWs(m[1])
      if (v.length < 3) continue
      if (/^vendor|ship|bill|purchase|payment|currency$/i.test(v)) continue
      return v
    }
  }
  return null
}

function scoreAttnCandidate(s: string): number {
  const v = collapseWs(s).replace(/,$/, '')
  if (v.length < 4 || v.length > 90) return -1
  if (/@/.test(v)) return -1
  if (/^(TECHNOLOGY|PASEO|VALLE|GUADALUPE|MX\d)/i.test(v)) return -1
  const words = v.split(/\s+/).filter(Boolean)
  const letters = v.replace(/[^a-záéíóúñ]/gi, '')
  const oneBlob = words.length <= 2 && letters.length > 18 && /^[A-Z0-9\s,]+$/i.test(v)
  if (oneBlob) return 0
  if (words.length >= 2 && /[a-záéíóúñ]/.test(v)) return 12
  if (words.length >= 2) return 6
  return 1
}

/** Varias líneas «Attn:» en Ship To; prioriza nombre de persona (p. ej. Juan Carlos Uribe). */
function extractBestAttnInShipTo(full: string): string | null {
  const idx = full.search(/\bShip\s+To\b/i)
  if (idx === -1) return null
  const chunk = full.slice(idx, idx + 2200)
  const re = /\bAttn\s*[:\s]*\s*([^\n]+)/gi
  let best: { v: string; score: number } | null = null
  let m: RegExpExecArray | null
  while ((m = re.exec(chunk)) !== null) {
    const v = collapseWs(m[1])
    const sc = scoreAttnCandidate(v)
    if (sc < 0) continue
    if (!best || sc > best.score || (sc === best.score && v.length > best.v.length)) best = { v, score: sc }
  }
  return best && best.score > 0 ? best.v : null
}

/** Coupa/Jabil: nombre tras «CURRENCY» en la misma franja que el encabezado. */
function extractNameAfterCurrency(full: string): string | null {
  const head = full.slice(0, 3500)
  const m = head.match(/\bCURRENCY\s+([A-Za-zÀ-ÿÁÉÍÓÚÑáéíóúñ]+(?:\s+[A-Za-zÀ-ÿÁÉÍÓÚÑáéíóúñ.]+){1,5})(?=\s|$)/i)
  if (!m) return null
  let v = collapseWs(m[1])
  if (v.length < 5 || v.length > 80) return null
  if (/@|\d{5}/.test(v)) return null
  if (/^(USD|EUR|MXN|NET|STD|EXW)\b/i.test(v)) return null
  v = v
    .replace(/\s+(Tlajornulco|Zapopan|Guadalajara|Monterrey|Jalisco)(\s+de\s+[^\s]+)?\b.*$/i, '')
    .replace(/\s+(México|Mexico)\b.*$/i, '')
  v = collapseWs(v)
  if (v.length < 5) return null
  return v
}

function extractFechaEnglishNearPo(full: string): string | null {
  const m = full.match(/\bDATE\s*[:\s]+\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\b/i)
  if (m) return parseMxDateToIso(m[1])
  return null
}

function extractFlexPoDate(raw: string): string | null {
  const m = raw.match(/PO\s+Date\s*\/\s*Fecha\s+de\s+Orden\s+de\s+Compra:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i)
  if (!m) return null
  const p = m[1].split('/')
  if (p.length !== 3) return null
  let mo = Number(p[0])
  let d = Number(p[1])
  let y = Number(p[2])
  if (y < 100) y += 2000
  if (!Number.isFinite(mo) || !Number.isFinite(d) || !Number.isFinite(y)) return null
  // Plantilla Flex en inglés: M/D/YYYY (p. ej. 4/10/2026 = 10-abr-2026, no 4-oct-2026).
  if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
    const dt = new Date(Date.UTC(y, mo - 1, d))
    if (dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d) {
      return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    }
  }
  return parseMxDateToIso(m[1])
}

function extractFlexRequestorName(raw: string): string | null {
  if (!/\bFlextronics\b/i.test(raw)) return null
  const m = raw.match(/Requestor Name \/ Nombre del\s+solicitante:\s*([^\n\r]+)/i)
  if (!m) return null
  const v = collapseWs(m[1].replace(/\s+aQuire.*$/i, '').trim())
  return v.length >= 3 ? v : null
}

/** Fecha en metadatos PDF: D:YYYYMMDDHHmmSS o D:YYYYMMDDHHmmSSZ */
export function parsePdfMetaDate(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  const m = s.match(/^D:(\d{4})(\d{2})(\d{2})/i)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  return null
}

export function parseOrdenCompraFromText(fullText: string, filenameBase: string): OrdenCompraInferred {
  const raw = fullText.replace(/\r/g, '\n').replace(/\u00a0/g, ' ')
  const text = collapseWs(raw)
  const numero = extractNumeroFromText(text, filenameBase)
  let fechaIso: string | null =
    extractFlexPoDate(raw) ?? extractFechaEnglishNearPo(raw) ?? extractFechaEnglishNearPo(text)
  if (!fechaIso) {
    for (const label of ['fecha de orden', 'fecha orden', 'fecha de emisión', 'fecha de emision', 'fecha']) {
      const line = firstLineValue(label, text)
      if (line) {
        const datePart = line.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/)
        if (datePart) {
          fechaIso = parseMxDateToIso(datePart[1])
          if (fechaIso) break
        }
      }
    }
  }
  if (!fechaIso) fechaIso = findDateNearKeywords(text)

  const englishEmpresa = extractEmpresaFromEnglishBlocks(raw)
  const spanishEmpresa = hintFromLabels(raw.replace(/\r/g, '\n'), EMPRESA_LABELS)
  let empresaHint = englishEmpresa ?? spanishEmpresa
  if (empresaHint && /solaino/i.test(empresaHint) && englishEmpresa && !/solaino/i.test(englishEmpresa)) {
    empresaHint = englishEmpresa
  }

  const contactEn = extractContactEnglish(raw)
  const currencyName = extractNameAfterCurrency(raw)
  const attnShip = extractBestAttnInShipTo(raw)
  const flexReq = extractFlexRequestorName(raw)
  const requisitorHint =
    flexReq ?? currencyName ?? contactEn ?? attnShip ?? hintFromLabels(raw.replace(/\r/g, '\n'), REQUISITOR_LABELS)

  return { numero, fechaIso, empresaHint, requisitorHint }
}

const COTIZ_LINE_NOISE =
  /^(EXW|STD|USD|NET|Payment|Currency|PO\s|DATE|PAYMENT|Chart|HTS|0401|G03|General\s+Expense|ORIGIN|Asset\s+Tags|Inco\s+Terms|MASTER\s+VENDOR|Qty|Quantity|Unit\s+price|Amount|UOM|Ship\s+to|Bill\s+to|Line\b|#\b)/i

/** Totales Coupa/Jabil («Units 2,550.00 USD») — no son partidas de producto. */
export function isCotizacionAmountSummaryLine(raw: string): boolean {
  const s = collapseWs(raw)
  if (!s) return true
  if (/^Units\s+[\d,. ]+\s*(USD|EUR|MXN|CAD)$/i.test(s)) return true
  if (/^(?:Total|Subtotal|Grand\s+total|Net\s+total)\b/i.test(s)) return true
  // Solo monto + moneda, sin palabras de producto (p. ej. «2,550.00 USD»).
  if (/^[\d,. ]+\s*(USD|EUR|MXN|CAD)$/i.test(s)) return true
  const withoutMoney = s.replace(/\b(?:Units|USD|EUR|MXN|CAD|\$)\b/gi, '').replace(/[\d,.\s-]/g, '')
  if (/^Units\s+[\d,. ]+/i.test(s) && withoutMoney.length < 3) return true
  return false
}

export function filterCotizacionLineas(lines: string[] | null | undefined): string[] {
  if (!lines?.length) return []
  return lines.map((x) => String(x).trim()).filter((s) => s.length > 0 && !isCotizacionAmountSummaryLine(s))
}

/**
 * OC Flextronics (formato bilingüe): texto de «Desc / Descripción:» hasta la siguiente partida
 * (`20 1.0000 EA`, etc.) o el siguiente «Desc / Descripción:», para incluir continuación tras VPN.
 */
function extractFlexPoLineDescriptions(raw: string): string[] | null {
  const t = raw.replace(/\r/g, '\n')
  if (!/\bFlextronics\b/i.test(t)) return null
  if (!/\bDesc\s*\/\s*Descripción\s*:/i.test(t)) return null

  const label = /\bDesc\s*\/\s*Descripción\s*:/gi
  const out: string[] = []
  const seen = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = label.exec(t)) !== null) {
    const start = m.index + m[0].length
    const rest = t.slice(start)
    const nextDesc = rest.search(/\bDesc\s*\/\s*Descripción\s*:/i)
    const nextLineItem = rest.search(/\n\d{2}\s+1[\d.]+\s+EA\b/i)
    const stopLegal = rest.search(/\n(?:Discount Total|Supplier instructions|\*\*PURCHASE)/i)
    let len = rest.length
    if (nextDesc > 15) len = Math.min(len, nextDesc)
    if (nextLineItem > 15) len = Math.min(len, nextLineItem)
    if (stopLegal > 40) len = Math.min(len, stopLegal)

    let chunk = rest.slice(0, len)
    chunk = chunk.replace(/\s*Requestor Name[\s\S]*$/i, '')

    let s = collapseWs(chunk.replace(/\s*VPN\s*:\s*\S+/gi, ' '))
    s = s.replace(/\bAdditional Info\.?\s*\/\s*Información adicional\s*:\s*/gi, ' ')
    s = collapseWs(s.replace(/\s+/g, ' '))
    s = s.replace(/^\s*0\s+/g, '').trim()
    s = s.replace(/\s+Existe en catalogo.*$/i, '').trim()
    s = s.replace(/\s+Fixed Assets\s*$/i, '').trim()
    if (s.length < 15) continue
    const k = s.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(s)
    if (out.length >= 40) break
  }
  return out.length >= 1 ? out : null
}

/**
 * Líneas tipo Jabil/Coupa: «Line N … Description» y «N Asset Tags: descripción».
 * Evita falsos positivos del modo «Description» genérico.
 */
function extractJabilCoupaStyleLines(raw: string): string[] | null {
  const text = raw.replace(/\r/g, '\n')
  const byNum = new Map<number, string>()

  const reLine = /\bLine\s+(\d+)\s+(.+?)(?=\s+Description\b)/gi
  let m: RegExpExecArray | null
  while ((m = reLine.exec(text)) !== null) {
    const n = Number.parseInt(m[1], 10)
    if (n < 1 || n > 40) continue
    const desc = cleanCotizacionLine(m[2])
    if (desc.length >= 4 && !isCotizacionAmountSummaryLine(desc)) byNum.set(n, desc)
  }

  const reAsset = /(?:^|\n)\s*(\d+)\s+Asset\s+Tags:\s*([^\n]+)/gi
  while ((m = reAsset.exec(text)) !== null) {
    const n = Number.parseInt(m[1], 10)
    if (n < 1 || n > 40) continue
    const desc = cleanCotizacionLine(m[2])
    if (desc.length < 3 || isCotizacionAmountSummaryLine(desc)) continue
    const prev = byNum.get(n)
    if (!prev || desc.length > prev.length) byNum.set(n, desc)
  }

  if (byNum.size < 1) return null
  const keys = [...byNum.keys()].sort((a, b) => a - b)
  const out: string[] = []
  for (const k of keys) {
    const v = byNum.get(k)
    if (v) out.push(v)
  }
  return out.length >= 1 ? out : null
}

function cleanCotizacionLine(raw: string): string {
  let s = collapseWs(raw.replace(/\|/g, ' '))
  s = s.replace(/\s+\d+(?:\s+\d+(?:\.\d+)?)?\s*(?:Each|EA|PCS)(?:\s*\(SAP\))?.*$/i, '').trim()
  s = s.replace(/\s+\d+(\.\d+)?\s*$/, '').trim()
  return s
}

function extractCotizacionFromBlob(blob: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const push = (raw: string) => {
    const s = cleanCotizacionLine(raw)
    if (s.length < 10 || s.length > 280) return
    if (COTIZ_LINE_NOISE.test(s)) return
    if (isCotizacionAmountSummaryLine(s)) return
    if (/^[\d\s.,$€-]+$/.test(s)) return
    if (/soluciones\s+integrales\s+solaino/i.test(s)) return
    const k = s.toLowerCase()
    if (seen.has(k)) return
    seen.add(k)
    out.push(s)
  }

  const re =
    /\b(\d{1,2})\s+([A-Za-zÀ-ÿÁÉÍÓÚÑáéíóúñ][^|]{10,240}?)(?=\s+\d{1,2}\s+[A-Za-zÀ-ÿÁÉÍÓÚÑáéíóúñ0-9]|\s+Asset\s+Tags|\s+Chart\s+of\s+Account|\s+Inco\s+Terms\b|\s+EXW\b|\s+HTS\b|\s+0401\b|\s+G03\b|$)/gi
  let mm: RegExpExecArray | null
  while ((mm = re.exec(blob)) !== null) {
    const n = Number.parseInt(mm[1], 10)
    if (n >= 1 && n <= 99) push(mm[2])
    if (out.length >= 50) break
  }
  return out
}

export function extractCotizacionLineDescriptions(fullText: string): string[] {
  const raw = fullText.replace(/\r/g, '\n')
  const jabil = extractJabilCoupaStyleLines(raw)
  if (jabil && jabil.length >= 1) return filterCotizacionLineas(jabil).slice(0, 50)

  const flex = extractFlexPoLineDescriptions(raw)
  if (flex && flex.length >= 1) return flex.slice(0, 40)

  const out: string[] = []
  const seen = new Set<string>()
  const push = (raw: string) => {
    const s = cleanCotizacionLine(raw)
    if (s.length < 10 || s.length > 280) return
    if (COTIZ_LINE_NOISE.test(s)) return
    if (isCotizacionAmountSummaryLine(s)) return
    if (/^[\d\s.,$€-]+$/.test(s)) return
    if (/soluciones\s+integrales\s+solaino/i.test(s)) return
    const k = s.toLowerCase()
    if (seen.has(k)) return
    seen.add(k)
    out.push(s)
  }

  const lines = raw.split('\n').map((l) => collapseWs(l))

  let mode: 'seek' | 'rows' = 'seek'
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (mode === 'seek') {
      if (/^Description$/i.test(line)) {
        mode = 'rows'
        continue
      }
      if (/\bDescription\b/i.test(line)) {
        if (line.length < 120 && !/^\d{1,2}\s+[A-Za-zÀ-ÿ]/.test(line)) {
          mode = 'rows'
          continue
        }
        const afterDesc = line.replace(/^.*?\bDescription\b/i, '').trim()
        const m0 = afterDesc.match(/^\s*(\d{1,2})\s+(.+)/)
        if (m0) {
          mode = 'rows'
          const n = Number.parseInt(m0[1], 10)
          if (n >= 1 && n <= 99) push(m0[2])
          continue
        }
        mode = 'rows'
        continue
      }
      continue
    }
    const m = line.match(/^\s*(\d{1,3})\s+(.+)$/)
    if (m) {
      const n = Number.parseInt(m[1], 10)
      if (n >= 1 && n <= 99) push(m[2])
      continue
    }
    if (line.length === 0) continue
    if (/^(Total|Subtotal|Tax|Grand\s+total)/i.test(line)) break
  }

  if (out.length === 0) {
    const blob = collapseWs(raw)
    for (const s of extractCotizacionFromBlob(blob)) push(s)
  }

  if (out.length === 0) {
    for (const line of lines) {
      const m = line.match(/^\s*(\d{1,2})\s+(.{18,})$/)
      if (!m) continue
      const n = Number.parseInt(m[1], 10)
      if (n < 1 || n > 40) continue
      if (!/[a-záéíóúñ]{3,}/i.test(m[2])) continue
      push(m[2])
      if (out.length >= 50) break
    }
  }

  return filterCotizacionLineas(out).slice(0, 50)
}
