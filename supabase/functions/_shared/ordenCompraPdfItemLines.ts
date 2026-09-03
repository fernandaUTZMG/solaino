/**
 * Reconstruye líneas desde items de PDF.js (posición X/Y) para tablas tipo Coupa.
 * Compartido entre cliente (pdfjs-dist) y Edge Function (unpdf / PDF.js serverless).
 */

export type TextItemLike = { str?: string; transform?: number[] }

function textFromPdfPageItemsAsLines(
  items: Array<TextItemLike | Record<string, unknown>>,
  yTolerance = 6,
): string {
  const withPos = items
    .map((it) => {
      if (!('str' in it) || typeof it.str !== 'string' || !it.str.trim()) return null
      const tr = Array.isArray(it.transform) ? it.transform : []
      const x = typeof tr[4] === 'number' ? tr[4] : 0
      const y = typeof tr[5] === 'number' ? tr[5] : 0
      return { s: it.str.trim(), x, y }
    })
    .filter((v): v is { s: string; x: number; y: number } => v != null)
  if (withPos.length === 0) return ''
  withPos.sort((a, b) => (Math.abs(a.y - b.y) > yTolerance ? b.y - a.y : a.x - b.x))

  const lineChunks: { s: string; x: number; y: number }[][] = []
  let cur: typeof withPos = []
  let anchorY: number | null = null
  const flush = () => {
    if (cur.length === 0) return
    cur.sort((a, b) => a.x - b.x)
    lineChunks.push([...cur])
    cur = []
    anchorY = null
  }
  for (const p of withPos) {
    if (anchorY === null || Math.abs(p.y - anchorY) <= yTolerance) {
      cur.push(p)
      anchorY = anchorY === null ? p.y : anchorY * 0.65 + p.y * 0.35
    } else {
      flush()
      cur.push(p)
      anchorY = p.y
    }
  }
  flush()
  return lineChunks.map((chunks) => chunks.map((c) => c.s).join(' ')).join('\n')
}

function bestMultilineFromPdfItems(items: Array<TextItemLike | Record<string, unknown>>): string {
  let best = ''
  let bestScore = -1
  for (const tol of [4, 7, 10, 14, 18, 24]) {
    const t = textFromPdfPageItemsAsLines(items, tol)
    if (!t.trim()) continue
    const nl = (t.match(/\n/g) ?? []).length
    const desc = /\bDescription\b/i.test(t) ? 20 : 0
    const score = nl + desc
    if (score > bestScore) {
      bestScore = score
      best = t
    }
  }
  return best
}

function textFromItemsReadingOrder(items: Array<TextItemLike | Record<string, unknown>>): string {
  const multiline = textFromPdfPageItemsAsLines(items, 6)
  if (multiline.trim().length > 0) return multiline
  const withPos = items
    .map((it) => {
      if (!('str' in it) || typeof it.str !== 'string' || !it.str.trim()) return null
      const tr = Array.isArray(it.transform) ? it.transform : []
      const x = typeof tr[4] === 'number' ? tr[4] : 0
      const y = typeof tr[5] === 'number' ? tr[5] : 0
      return { s: it.str, x, y }
    })
    .filter((v): v is { s: string; x: number; y: number } => v != null)
  if (withPos.length === 0) return ''
  withPos.sort((a, b) => {
    const band = 4
    if (Math.abs(a.y - b.y) > band) return b.y - a.y
    return a.x - b.x
  })
  return withPos.map((p) => p.s).join(' ')
}

export type PdfPageTextContent = {
  getTextContent: (params?: {
    disableNormalization?: boolean
    includeMarkedContent?: boolean
  }) => Promise<{ items: Array<TextItemLike | Record<string, unknown>> }>
}

export async function extractPagePlainTextFromPdfJs(page: PdfPageTextContent): Promise<string> {
  const optionSets = [{}, { disableNormalization: true as const }, { includeMarkedContent: true as const }] as const
  for (const params of optionSets) {
    const content = await page.getTextContent(params)
    const multiline = bestMultilineFromPdfItems(content.items)
    if (multiline.trim().length > 0) return multiline
    const sorted = textFromItemsReadingOrder(content.items)
    if (sorted.trim().length > 0) return sorted
    const line = content.items
      .map((it) => ('str' in it && typeof it.str === 'string' ? it.str : ''))
      .join(' ')
    if (line.trim().length > 0) return line
  }
  return ''
}
