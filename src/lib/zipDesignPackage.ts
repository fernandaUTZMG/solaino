import JSZip from 'jszip'
import { parseVersionScopedDesignPath } from './designZipScope'

export type ZipDesignManifest = {
  fileCount: number
  totalBytes: number
  extensionCounts: Record<string, number>
  topLevelFolders: string[]
  hasHtml: boolean
  hasPdf: boolean
  hasSolidworks: boolean
  /** Rutas internas del ZIP (para asignación de piezas sin volver a subir el archivo). */
  entryPaths?: string[]
  /** Entrega de ensamble Parasolid (`.x_t`) en lugar de ZIP. */
  kind?: 'zip' | 'xt'
  assemblyKey?: string
  exportedBy?: string
  pieceNames?: string[]
}

export type ZipDesignAnalysis = {
  entryHtmlPath: string | null
  manifest: ZipDesignManifest
}

function extLower(path: string): string {
  const name = path.split('/').pop() ?? path
  const idx = name.lastIndexOf('.')
  if (idx <= 0) return ''
  return name.slice(idx + 1).toLowerCase()
}

function pickEntrypointHtml(files: { path: string; size: number }[]): string | null {
  const html = files.filter((f) => ['html', 'htm'].includes(extLower(f.path)))
  if (html.length === 0) return null

  const norm = (p: string) => p.trim().replaceAll('\\', '/')

  // Prefer common entrypoints first.
  const preferred = new Set(['index.html', 'index.htm'])
  const preferredFound = html
    .map((f) => ({ ...f, p: norm(f.path) }))
    .find((f) => preferred.has((f.p.split('/').pop() ?? '').toLowerCase()))
  if (preferredFound) return preferredFound.p

  // Otherwise, pick the largest HTML (often the actual assembly preview export).
  let best = html[0]
  for (const f of html) if ((f.size ?? 0) > (best.size ?? 0)) best = f
  return norm(best.path)
}

function topLevelFoldersFromPaths(paths: string[]): string[] {
  const s = new Set<string>()
  for (const p of paths) {
    const norm = p.trim().replaceAll('\\', '/')
    const parts = norm.split('/').filter(Boolean)
    if (parts.length >= 2) s.add(parts[0])
  }
  return Array.from(s).sort((a, b) => a.localeCompare(b, 'es'))
}

/**
 * Analiza un ZIP de entrega (diseño/CNC) sin extraerlo a disco.
 * - Detecta un `entryHtmlPath` si existe cualquier HTML (no asume `/index.html`).
 * - Construye un manifest resumido (conteos/extensiones/tamaño).
 *
 * Nota: JSZip carga el directorio central y permite leer metadatos. Para ZIPs muy grandes,
 * esto puede tardar; la UI debe mostrar “Analizando…” y permitir cancelar en el futuro.
 */
export async function analyzeDesignZip(file: File): Promise<ZipDesignAnalysis> {
  const zip = await JSZip.loadAsync(file)

  const files: { path: string; size: number }[] = []
  const extensionCounts: Record<string, number> = {}
  let totalBytes = 0

  for (const [path, entry] of Object.entries(zip.files)) {
    if (!path || entry.dir) continue
    const raw = entry as unknown as { _data?: { uncompressedSize?: unknown } }
    const size = typeof raw._data?.uncompressedSize === 'number' ? raw._data.uncompressedSize : 0
    files.push({ path, size })
    totalBytes += size
    const ex = extLower(path)
    extensionCounts[ex || '(sin_ext)'] = (extensionCounts[ex || '(sin_ext)'] ?? 0) + 1
  }

  const entryHtmlPath = pickEntrypointHtml(files)
  const topLevelFolders = topLevelFoldersFromPaths(files.map((f) => f.path))

  const hasHtml = files.some((f) => ['html', 'htm'].includes(extLower(f.path)))
  const hasPdf = files.some((f) => extLower(f.path) === 'pdf')
  const hasSolidworks = files.some((f) => {
    const e = extLower(f.path)
    return e === 'sldprt' || e === 'sldasm' || e === 'slddrw'
  })

  const entryPaths = files.map((f) => f.path.trim().replaceAll('\\', '/')).filter(Boolean)

  return {
    entryHtmlPath,
    manifest: {
      fileCount: files.length,
      totalBytes,
      extensionCounts,
      topLevelFolders,
      hasHtml,
      hasPdf,
      hasSolidworks,
      entryPaths,
    },
  }
}

const DRAG_PATH_MIME = 'application/x-solaino-zip-entry-path'

/** MIME para DataTransfer al arrastrar una ruta del ZIP hacia una pieza. */
export const BODEGA_ZIP_ENTRY_DRAG_MIME = DRAG_PATH_MIME

/**
 * Lista rutas internas de un ZIP (solo metadatos; no extrae contenido).
 * Útil para que la programadora asigne `source_path` por pieza sin volver a subir el paquete.
 */
export async function listZipEntryPaths(
  file: File,
  opts?: { maxFiles?: number },
): Promise<string[]> {
  return listZipEntryPathsFromBlob(file, opts)
}

export async function listZipEntryPathsFromBlob(
  blob: Blob,
  opts?: { maxFiles?: number },
): Promise<string[]> {
  const maxFiles = Math.min(Math.max(opts?.maxFiles ?? 12_000, 100), 25_000)
  const zip = await JSZip.loadAsync(blob)
  const out: string[] = []
  for (const [path, entry] of Object.entries(zip.files)) {
    if (!path || entry.dir) continue
    const norm = path.trim().replaceAll('\\', '/')
    if (!norm) continue
    out.push(norm)
    if (out.length >= maxFiles) break
  }
  out.sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
  return out
}

export const CAD_LIKE_PATH_RE =
  /\.(sldprt|sldasm|slddrw|step|stp|iges|igs|dxf|dwg|stl|3dm|f3d|ipt|iam|prt|catpart|catproduct)$/i

/** Piezas SolidWorks en el ZIP (.PRT, .SLCPRT, .SLDPRT). */
export const SW_PART_PATH_RE = /\.(prt|slcprt|sldprt)$/i

/** Planos PDF de la carpeta de diseño (emparejados con la pieza .PRT/.SLDPRT). */
export const PERFILADO_PDF_PATH_RE = /\.pdf$/i

export function isCadLikeZipPath(path: string): boolean {
  return CAD_LIKE_PATH_RE.test(path.trim())
}

export function isSwPartZipPath(path: string): boolean {
  const p = path.trim()
  if (SW_PART_PATH_RE.test(p)) return true
  if (/\.x_t$/i.test(p) && !p.includes('/')) return true
  // Pieza leída de un ensamble Parasolid: nombre de componente, sin ruta ni extensión CAD.
  return Boolean(p) && !p.includes('/') && !/\.[a-z0-9]{1,8}$/i.test(p)
}

export function filterSwPartZipPaths(paths: string[]): string[] {
  return paths
    .filter((p) => isSwPartZipPath(p))
    .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
}

/** @deprecated Usar isSwPartZipPath */
export function isXtPieceZipPath(path: string): boolean {
  return isSwPartZipPath(path)
}

export function isPerfiladoPdfZipPath(path: string): boolean {
  return PERFILADO_PDF_PATH_RE.test(path.trim())
}

/** Archivos visibles en programación: piezas .PRT/.SLCPRT y PDF de perfilado. */
export function isProgrammerFolderZipPath(path: string): boolean {
  const p = path.trim()
  return isSwPartZipPath(p) || isPerfiladoPdfZipPath(p)
}

/** Pieza en carpeta ACCESORIOS del ZIP (no lleva CNC, torno ni perfilado). */
export function isAccesorioDesignZipPath(path: string): boolean {
  const { zipPath } = parseVersionScopedDesignPath(path.trim().replaceAll('\\', '/'))
  const segments = zipPath.split('/').filter(Boolean)
  return segments.some((s) => /accesorio/i.test(s))
}

export function filterZipPathsForProgrammerBucket(
  paths: string[],
  _bucket?: 'cnc' | 'torno' | 'perfilado' | 'accesorios',
): string[] {
  return paths.filter((p) => isSwPartZipPath(p))
}

export function isZipPathAllowedForProgrammerBucket(
  path: string,
  _bucket?: 'cnc' | 'torno' | 'perfilado' | 'accesorios',
): boolean {
  return isSwPartZipPath(path)
}

export function labelFromZipPath(path: string): string {
  const { zipPath } = parseVersionScopedDesignPath(path)
  const base = zipPath.split('/').pop()?.trim() || zipPath
  return base.slice(0, 200)
}

