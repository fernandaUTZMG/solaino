import { pieceDesignApproved } from './bodegaDesignPieceReview'
import type { BodegaProjectPieceRow } from './bodegaPiecesRepo'
import { displayLabelFromDesignPath, designZipEntriesMatch, parseVersionScopedDesignPath } from './designZipScope'
import { isPerfiladoPdfZipPath, isSwPartZipPath } from './zipDesignPackage'

/** Nombre de archivo sin extensión (comparación insensible a mayúsculas). */
export function zipPathStem(pathOrLabel: string): string {
  const { zipPath } = parseVersionScopedDesignPath(pathOrLabel)
  const base = zipPath.split('/').pop()?.trim() ?? zipPath.trim()
  const dot = base.lastIndexOf('.')
  const stem = dot > 0 ? base.slice(0, dot) : base
  return stem.toLowerCase().replace(/\s+/g, ' ').trim()
}

export type DesignZipPiecePair = {
  partPath: string
  partLabel: string
  pdfPath: string | null
  pdfLabel: string | null
}

/** Piezas .PRT/.SLDPRT del ZIP sin PDF emparejado (misma base de nombre). */
export function findDesignZipPiecesMissingPlanos(paths: string[]): DesignZipPiecePair[] {
  return buildDesignZipPiecePairs(paths).filter((p) => !p.pdfPath)
}

function designPairingKey(path: string): string {
  const { scopeKey, zipPath } = parseVersionScopedDesignPath(path)
  const folder = zipPath.includes('/')
    ? zipPath.slice(0, zipPath.lastIndexOf('/')).toLowerCase()
    : ''
  return `${scopeKey ?? ''}|${folder}|${zipPathStem(path)}`
}

/** Agrupa cada pieza SolidWorks con su PDF de plano (misma base de nombre). */
export function buildDesignZipPiecePairs(paths: string[]): DesignZipPiecePair[] {
  const partPaths = paths.filter((p) => isSwPartZipPath(p))
  const pdfPaths = paths.filter((p) => isPerfiladoPdfZipPath(p))
  const pdfByKey = new Map<string, string[]>()

  for (const pdf of pdfPaths) {
    const key = designPairingKey(pdf)
    const list = pdfByKey.get(key) ?? []
    list.push(pdf)
    pdfByKey.set(key, list)
  }

  const usedPdf = new Set<string>()

  const pairs: DesignZipPiecePair[] = partPaths.map((partPath) => {
    const key = designPairingKey(partPath)
    const candidates = (pdfByKey.get(key) ?? []).filter((p) => !usedPdf.has(p))
    const pdfPath = candidates[0] ?? null
    if (pdfPath) usedPdf.add(pdfPath)
    return {
      partPath,
      partLabel: displayLabelFromDesignPath(partPath),
      pdfPath,
      pdfLabel: pdfPath ? displayLabelFromDesignPath(pdfPath) : null,
    }
  })

  return pairs
}

/** PDF en el ZIP sin pieza .PRT/.SLCPRT/.SLDPRT con el mismo nombre. */
export function orphanPerfiladoPdfPaths(paths: string[]): string[] {
  const pairs = buildDesignZipPiecePairs(paths)
  const paired = new Set(pairs.map((x) => x.pdfPath).filter(Boolean) as string[])
  return paths.filter((p) => isPerfiladoPdfZipPath(p) && !paired.has(p))
}

function compactPairStem(s: string): string {
  return s.toLowerCase().replace(/[\s_\-().]+/g, '').trim()
}

export function findMatchingPdfPathForPart(partPath: string, paths: string[]): string | null {
  const partKey = designPairingKey(partPath)
  const partStem = zipPathStem(partPath)
  const compactPart = compactPairStem(partStem)
  const { scopeKey: partKit } = parseVersionScopedDesignPath(partPath)
  let fallback: string | null = null
  let suffixMatch: string | null = null
  for (const pdf of paths) {
    if (!isPerfiladoPdfZipPath(pdf)) continue
    if (designPairingKey(pdf) === partKey) return pdf
    const { scopeKey: pdfKit } = parseVersionScopedDesignPath(pdf)
    if (partKit && pdfKit && partKit !== pdfKit) continue
    const pdfStem = zipPathStem(pdf)
    const compactPdf = compactPairStem(pdfStem)
    if (!suffixMatch && compactPart && (compactPdf === compactPart + 't' || compactPdf === compactPart + 'p')) {
      suffixMatch = pdf
      continue
    }
    if (pdfStem !== partStem) continue
    if (!fallback) fallback = pdf
  }
  return suffixMatch ?? fallback
}

/** Pieza cuyo `source_path` es un PDF emparejado con una pieza SW (no debe listarse aparte). */
export function isRedundantPairedPdfPiece(
  piece: Pick<BodegaProjectPieceRow, 'id' | 'source_path'>,
  pieces: Pick<BodegaProjectPieceRow, 'id' | 'source_path'>[],
  designPaths: string[] = [],
): boolean {
  if (!piece.source_path || !isPerfiladoPdfZipPath(piece.source_path)) return false
  const stem = zipPathStem(piece.source_path)

  const swInPieces = pieces.some(
    (p) =>
      p.id !== piece.id &&
      p.source_path &&
      isSwPartZipPath(p.source_path) &&
      zipPathStem(p.source_path) === stem,
  )
  if (swInPieces) return true

  return designPaths.some((p) => isSwPartZipPath(p) && zipPathStem(p) === stem)
}

export function visibleDesignPieces(
  pieces: BodegaProjectPieceRow[],
  designPaths: string[] = [],
): BodegaProjectPieceRow[] {
  return pieces.filter((p) => !isRedundantPairedPdfPiece(p, pieces, designPaths))
}

/** Piezas visibles cuyo diseño ya fue aprobado (excluye pendientes de corrección). */
export function designApprovedVisiblePieces(
  pieces: BodegaProjectPieceRow[],
  designPaths: string[] = [],
): BodegaProjectPieceRow[] {
  return visibleDesignPieces(pieces, designPaths).filter((p) => pieceDesignApproved(p))
}

/**
 * Rutas efectivas para programación y paso 3.
 * Si ya hay piezas importadas en el proyecto, solo esas (y sus PDF), no todo el ZIP.
 */
export function designPathsForApprovedPieces(
  pieces: BodegaProjectPieceRow[],
  designPaths: string[],
): string[] {
  const importedSw = pieces.filter(
    (p) => pieceDesignApproved(p) && p.source_path && isSwPartZipPath(p.source_path),
  )
  if (importedSw.length === 0) return designPaths

  const out: string[] = []
  const seen = new Set<string>()
  const add = (path: string) => {
    const norm = path.trim().replaceAll('\\', '/')
    if (!norm || seen.has(norm)) return
    seen.add(norm)
    out.push(norm)
  }

  for (const piece of importedSw) {
    const src = piece.source_path!
    add(src)
    for (const dp of designPaths) {
      if (isSwPartZipPath(dp) && designZipEntriesMatch(dp, src)) add(dp)
    }
    const pdf = findMatchingPdfPathForPart(src, designPaths)
    if (pdf) add(pdf)
  }

  return out
}
