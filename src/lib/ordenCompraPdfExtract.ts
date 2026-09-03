import * as pdfjs from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import {
  extractCotizacionLineDescriptions,
  filterCotizacionLineas,
  isCotizacionAmountSummaryLine,
  parseMxDateToIso,
  parseOrdenCompraFromText,
  parsePdfMetaDate,
  type OrdenCompraInferred,
} from '../../supabase/functions/_shared/ordenCompraTextParse.ts'
import { extractPagePlainTextFromPdfJs } from '../../supabase/functions/_shared/ordenCompraPdfItemLines.ts'

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc

export type CatalogOpt = { id: string; nombre: string }

export type { OrdenCompraInferred }
export { parseMxDateToIso, parsePdfMetaDate, parseOrdenCompraFromText, extractCotizacionLineDescriptions, filterCotizacionLineas, isCotizacionAmountSummaryLine }

function collapseWs(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

function normalizeKey(s: string): string {
  return collapseWs(s)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
}

export type PdfExtractResult = {
  text: string
  metadataDateIso: string | null
}

export async function extractPdfPlainText(file: File): Promise<PdfExtractResult> {
  const data = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data }).promise

  let metadataDateIso: string | null = null
  try {
    const meta = await pdf.getMetadata()
    const info = meta?.info as Record<string, unknown> | undefined
    metadataDateIso = parsePdfMetaDate(info?.CreationDate) ?? parsePdfMetaDate(info?.ModDate)
  } catch {
    // sin metadatos
  }

  const parts: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    parts.push(await extractPagePlainTextFromPdfJs(page))
  }
  return { text: parts.join('\n\n'), metadataDateIso }
}

export function matchCatalogByName(hint: string | null | undefined, opts: CatalogOpt[]): string {
  if (!hint) return ''
  const h = normalizeKey(hint)
  if (h.length < 2) return ''

  for (const o of opts) {
    if (normalizeKey(o.nombre) === h) return o.id
  }
  for (const o of opts) {
    const n = normalizeKey(o.nombre)
    if (n.length >= 4 && (n.includes(h) || h.includes(n))) return o.id
  }

  const hWords = new Set(h.split(' ').filter((w) => w.length > 2))
  let best: { id: string; score: number } | null = null
  for (const o of opts) {
    const words = normalizeKey(o.nombre)
      .split(' ')
      .filter((w) => w.length > 2)
    let common = 0
    for (const w of words) {
      if (hWords.has(w)) common++
    }
    const score = common * 10 + (words.length ? 0 : 0)
    if (common >= 2 && (!best || score > best.score)) best = { id: o.id, score }
  }
  if (best && best.score >= 20) return best.id

  const sigWords = (s: string) => s.split(' ').filter((w) => w.length > 2)
  const hintWords = sigWords(h)
  if (hintWords.length >= 2) {
    for (const o of opts) {
      const nw = sigWords(normalizeKey(o.nombre))
      if (nw.length >= 2 && nw.every((w) => h.includes(w))) return o.id
    }
  }

  const firstStrong = h.split(/\s+/).find((w) => w.replace(/[^a-z0-9áéíóúñ]/gi, '').length >= 4)
  if (firstStrong) {
    for (const o of opts) {
      const n = normalizeKey(o.nombre)
      if (n.includes(firstStrong) || firstStrong.includes(n.slice(0, Math.min(14, n.length)))) return o.id
    }
  }

  if (hintWords.length >= 1) {
    for (const o of opts) {
      const n = normalizeKey(o.nombre)
      let hits = 0
      for (const w of hintWords) {
        if (w.length >= 4 && n.includes(w)) hits++
      }
      if (hits >= 2 || (hintWords.length === 1 && hits === 1 && hintWords[0].length >= 5)) return o.id
    }
  }

  return ''
}
