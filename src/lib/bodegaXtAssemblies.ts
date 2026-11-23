import type { BodegaProjectPieceRow } from './bodegaPiecesRepo'
import { designZipEntriesMatch } from './designZipScope'
import { isPerfiladoPdfZipPath, isXtPieceZipPath, labelFromZipPath } from './zipDesignPackage'

function normPath(path: string): string {
  return path.trim().replaceAll('\\', '/')
}

function dirname(path: string): string {
  const parts = normPath(path).split('/').filter(Boolean)
  parts.pop()
  return parts.join('/')
}

/**
 * Ensamblaje contenedor: p. ej. `Ensamblaje1.x_t`.
 * No confundir con piezas como `Ensamblaje1 marco.x_t` (llevan nombre extra).
 */
export function isXtAssemblyPath(path: string): boolean {
  const base = labelFromZipPath(path).toLowerCase().replace(/\.x_t$/i, '').trim()
  if (/^ensamblaje\d*$/i.test(base)) return true
  if (base === 'assembly' || base === 'ensamblaje') return true
  return false
}

/** Pieza .x_T suelta en el ZIP (incluye las que van dentro de un ensamblaje en CAD). */
export function isXtPartFilePath(path: string): boolean {
  return isXtPieceZipPath(path) && !isXtAssemblyPath(path)
}

export type XtAssemblyGroup = {
  assemblyPath: string
  assemblyLabel: string
  /** Archivos .x_T de pieza en la misma carpeta (exportadas desde el ensamblaje). */
  partPathsInZip: string[]
}

/** Rutas .x_T que llevan acabado / asignación CNC–Torno (piezas visibles para la programadora). */
export function assignableXtPathsForGroup(group: XtAssemblyGroup): string[] {
  if (group.partPathsInZip.length > 0) return group.partPathsInZip
  return [group.assemblyPath]
}

export function buildXtAssemblyGroups(designZipPaths: string[]): XtAssemblyGroup[] {
  const xtPaths = designZipPaths.filter((p) => isXtPieceZipPath(p)).map(normPath)
  const assemblies = xtPaths.filter((p) => isXtAssemblyPath(p))
  const looseParts = xtPaths.filter((p) => isXtPartFilePath(p))

  const assemblyPaths = assemblies.length > 0 ? assemblies : xtPaths

  const groups: XtAssemblyGroup[] = []
  const usedParts = new Set<string>()

  for (const assemblyPath of assemblyPaths) {
    const dir = dirname(assemblyPath)
    const partPathsInZip = looseParts.filter((p) => {
      if (usedParts.has(p)) return false
      const sameDir = dirname(p) === dir
      const inSubfolder = dir.length > 0 && p.startsWith(`${dir}/`)
      const ok = sameDir || inSubfolder
      if (ok) usedParts.add(p)
      return ok
    })
    groups.push({
      assemblyPath,
      assemblyLabel: labelFromZipPath(assemblyPath),
      partPathsInZip,
    })
  }

  for (const p of looseParts) {
    if (usedParts.has(p)) continue
    groups.push({
      assemblyPath: p,
      assemblyLabel: labelFromZipPath(p),
      partPathsInZip: [],
    })
    usedParts.add(p)
  }

  return groups
}

/** Piezas cuyo nombre está en el .x_t de este proyecto. Las de otro ensamble no entran. */
export function piecesBelongingToDesignPaths<T extends { source_path: string | null; label: string }>(
  pieces: T[],
  paths: string[],
): T[] {
  if (paths.length === 0) return []
  return pieces.filter((piece) => {
    const src = piece.source_path || piece.label
    return paths.some((path) => designZipEntriesMatch(src, path))
  })
}

export function pieceForZipPath(
  pieces: BodegaProjectPieceRow[],
  zipPath: string,
): BodegaProjectPieceRow | undefined {
  const norm = normPath(zipPath)
  const matches = pieces.filter((p) => {
    const src = p.source_path || p.label
    if (!src) return false
    return normPath(src) === norm || designZipEntriesMatch(src, norm)
  })
  return matches.find((p) => p.programmer_bucket != null) ?? matches[0]
}

export function isPdfPiece(p: BodegaProjectPieceRow): boolean {
  return Boolean(p.source_path && isPerfiladoPdfZipPath(p.source_path))
}
