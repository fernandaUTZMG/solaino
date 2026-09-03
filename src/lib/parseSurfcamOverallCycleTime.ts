import { parseHmsToSeconds, formatSecondsAsHms } from './maquinadoEstimatedTime'

const HMS_RE = /\d{1,3}\s*[:.]\s*\d{1,2}\s*[:.]\s*\d{1,2}/g
const MS_RE = /\d{1,3}\s*[:.]\s*\d{1,2}(?!\s*[:.])/g
const OVERALL_RE = /over\s*all|0ver\s*all|overall/i

function normalizeHmsToken(raw: string): string {
  return raw.replace(/[\s.]+/g, ':').replace(/[lI|]/g, '1').replace(/O/g, '0')
}

function extractHmsTokens(line: string): string[] {
  const hms = [...line.matchAll(HMS_RE)].map((m) => normalizeHmsToken(m[0]!))
  if (hms.length > 0) return hms
  return [...line.matchAll(MS_RE)].map((m) => normalizeHmsToken(m[0]!))
}

function looksLikeOverallToken(line: string): boolean {
  const compact = line.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (!compact) return false
  if (compact === 'overall' || compact === 'overa11' || compact === '0verall') return true
  if (/overall/.test(compact)) return true
  if (/^over/.test(compact) && /all/.test(compact)) return true
  if (/^0ver/.test(compact) && /all/.test(compact)) return true
  return false
}

function isSurfcamOperationsSheet(text: string): boolean {
  return /surfcam|operations\s*list|setup\s*sheet|cycle\s*time/i.test(text)
}

function pickLongestHms(tokens: string[]): string | null {
  let best: string | null = null
  let bestSec = -1
  for (const t of tokens) {
    const sec = parseHmsToSeconds(t)
    if (sec == null || sec <= bestSec) continue
    bestSec = sec
    best = t
  }
  return best
}

function allHmsInText(text: string): string[] {
  const hms = [...text.matchAll(HMS_RE)].map((m) => normalizeHmsToken(m[0]!))
  if (hms.length > 0) return hms
  return [...text.matchAll(MS_RE)].map((m) => normalizeHmsToken(m[0]!))
}

/** Primer tiempo H:M:S que aparece después de la palabra Overall en el texto OCR. */
function firstHmsAfterOverallMarker(text: string): string | null {
  const m = OVERALL_RE.exec(text)
  if (!m) return null
  const tail = text.slice(m.index + m[0].length)
  const tokens = allHmsInText(tail)
  return tokens[0] ?? null
}

/** Extrae el Cycle Time de la fila «Overall» (SURFCAM u hojas similares). */
export function parseOverallCycleTimeFromOcrText(text: string): string | null {
  if (!text.trim()) return null

  const compact = text.replace(/\r/g, '\n')
  const lines = compact.split('\n').map((l) => l.trim()).filter(Boolean)

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (!looksLikeOverallToken(line)) continue

    const overallMatch = line.match(OVERALL_RE)
    if (overallMatch && overallMatch.index != null) {
      const afterLabel = line.slice(overallMatch.index + overallMatch[0].length)
      const onTail = extractHmsTokens(afterLabel)
      if (onTail.length > 0) return onTail[onTail.length - 1]!
    }

    const onLine = extractHmsTokens(line)
    if (onLine.length > 0) return onLine[onLine.length - 1]!

    for (let j = i + 1; j <= Math.min(i + 3, lines.length - 1); j++) {
      const next = extractHmsTokens(lines[j]!)
      if (next.length > 0) return next[next.length - 1]!
    }
  }

  const afterOverall = firstHmsAfterOverallMarker(compact)
  if (afterOverall) return afterOverall

  const all = allHmsInText(compact)
  if (all.length === 0) return null
  if (all.length === 1) return all[0]!

  if (isSurfcamOperationsSheet(compact)) {
    const last = all[all.length - 1]!
    const longest = pickLongestHms(all)
    if (longest && parseHmsToSeconds(longest)! >= (parseHmsToSeconds(last) ?? 0)) {
      return longest
    }
    return last
  }

  const afterCycleTime = compact.split(/cycle\s*time/i)[1]
  if (afterCycleTime) {
    const inCol = allHmsInText(afterCycleTime)
    const last = inCol[inCol.length - 1]
    if (last) return last
  }

  return pickLongestHms(all)
}

export function parseOverallCycleTimeSeconds(text: string): number | null {
  const label = parseOverallCycleTimeFromOcrText(text)
  if (!label) return null
  return parseHmsToSeconds(label)
}

/** Para mensajes de error: tiempos que sí leyó el OCR. */
export function summarizeDetectedCycleTimes(text: string, max = 6): string {
  const all = allHmsInText(text)
  const unique = [...new Set(all)]
  const sorted = unique
    .map((t) => ({ t, s: parseHmsToSeconds(t) ?? 0 }))
    .sort((a, b) => b.s - a.s)
    .slice(0, max)
    .map((x) => x.t)
  if (sorted.length === 0) return ''
  const guess = firstHmsAfterOverallMarker(text) ?? pickLongestHms(unique) ?? sorted[0]
  const hint = guess ? ` (¿Overall ≈ ${guess}?)` : ''
  return `${sorted.join(', ')}${hint}`
}

export function formatOverallGuessForDisplay(text: string): string | null {
  const label = parseOverallCycleTimeFromOcrText(text)
  if (!label) return null
  const sec = parseHmsToSeconds(label)
  if (sec == null) return label
  return formatSecondsAsHms(sec)
}
