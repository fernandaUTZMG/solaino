import type { BodegaProjectPieceRow } from './bodegaPiecesRepo'
import {
  buildXtAssemblyGroups,
  isXtAssemblyPath,
  isXtPartFilePath,
} from './bodegaXtAssemblies'
import { readZipEntryBytes, readZipEntryTexts } from './designZipContent'
import { labelFromZipPath } from './zipDesignPackage'

export const BODEGA_ASSEMBLY_CHILD_DRAG_MIME = 'application/x-solaino-assembly-child-key'

export type AssemblyChildCandidate = {
  /** Clave estable para drag / DB (ruta zip o ensamblaje::nombre). */
  key: string
  label: string
  sourcePath: string | null
  assemblyPath: string
  /** zip_xt = archivo en ZIP; el resto = detectado dentro del paquete / ensamblaje. */
  origin: 'zip_xt' | 'internal' | 'html' | 'bom_xml' | 'xt_text' | 'step'
}

const TECH_TOKENS =
  /^(body|edge|face|vertex|surface|curve|assembly|parasolid|schema|transf|null|true|false|\d+)$/i

function normPath(path: string): string {
  return path.trim().replaceAll('\\', '/')
}

function dirname(path: string): string {
  const parts = normPath(path).split('/').filter(Boolean)
  parts.pop()
  return parts.join('/')
}

function isLikelyPartName(name: string): boolean {
  const s = name.trim()
  if (s.length < 2 || s.length > 120) return false
  if (TECH_TOKENS.test(s)) return false
  if (/^[\d._\-]+$/.test(s)) return false
  if (/^(solidworks|parasolid|microsoft)/i.test(s)) return false
  return /[A-Za-zÁ-ú]/.test(s)
}

/** Nombres de pieza en HTML de paquetes SolidWorks / eDrawings. */
export function parsePartNamesFromDesignHtml(html: string): string[] {
  const names = new Set<string>()
  const linkRe = /href\s*=\s*["']([^"']+\.x_t)["'][^>]*>([^<]{1,120})</gi
  let m: RegExpExecArray | null
  while ((m = linkRe.exec(html))) {
    const label = (m[2] ?? '').replace(/\s+/g, ' ').trim() || labelFromZipPath(m[1]!)
    if (isLikelyPartName(label)) names.add(label)
  }
  const attrRe = /(?:title|data-name|data-title)\s*=\s*["']([^"']{2,120})["']/gi
  while ((m = attrRe.exec(html))) {
    const label = m[1]!.trim()
    if (isLikelyPartName(label) && !/\.x_t$/i.test(label)) names.add(label)
  }
  return [...names]
}

/** Intenta leer nombres embebidos en .x_T de texto Parasolid. */
export function parsePartNamesFromXtBytes(bytes: Uint8Array): string[] {
  const sample = bytes.slice(0, Math.min(bytes.length, 2_000_000))
  const text = new TextDecoder('utf-8', { fatal: false }).decode(sample)
  let printable = 0
  for (let i = 0; i < Math.min(text.length, 8000); i++) {
    const c = text.charCodeAt(i)
    if (c === 9 || c === 10 || c === 13 || (c >= 32 && c < 127)) printable++
  }
  if (printable / Math.min(text.length, 8000) < 0.55) return []

  const names = new Set<string>()
  const patterns = [
    /'([A-Za-zÁ-ú][A-Za-z0-9_\- áéíóúÁÉÍÓÚñÑ.,()]{1,100})'/g,
    /"([A-Za-zÁ-ú][A-Za-z0-9_\- áéíóúÁÉÍÓÚñÑ.,()]{1,100})"/g,
    /(?:NAME|name|LABEL)\s*=\s*'([^']{2,100})'/g,
  ]
  for (const re of patterns) {
    let m: RegExpExecArray | null
    while ((m = re.exec(text))) {
      const label = m[1]!.trim()
      if (isLikelyPartName(label)) names.add(label)
    }
  }
  return [...names].slice(0, 200)
}

function childKey(assemblyPath: string, label: string, sourcePath: string | null): string {
  return sourcePath ?? `${normPath(assemblyPath)}::${label}`
}

function zipPartCandidates(assemblyPath: string, zipPaths: string[]): AssemblyChildCandidate[] {
  const dir = dirname(assemblyPath)
  const asmNorm = normPath(assemblyPath)
  return zipPaths
    .filter((p) => {
      if (!isXtPartFilePath(p)) return false
      const n = normPath(p)
      if (n === asmNorm) return false
      const pDir = dirname(n)
      return pDir === dir || (dir.length > 0 && n.startsWith(`${dir}/`))
    })
    .map((p) => ({
      key: childKey(assemblyPath, labelFromZipPath(p), p),
      label: labelFromZipPath(p),
      sourcePath: normPath(p),
      assemblyPath: asmNorm,
      origin: 'zip_xt' as const,
    }))
}

/**
 * Descubre piezas del ensamblaje: archivos .x_T hermanos en el ZIP + nombres dentro del .x_T / HTML.
 */
export async function discoverAssemblyChildren(
  assemblyPath: string,
  zipPaths: string[],
  zipBlob: Blob | null,
): Promise<AssemblyChildCandidate[]> {
  const asmNorm = normPath(assemblyPath)
  const byKey = new Map<string, AssemblyChildCandidate>()

  for (const c of zipPartCandidates(assemblyPath, zipPaths)) {
    byKey.set(c.key, c)
  }

  if (zipBlob) {
    const htmlPaths = zipPaths.filter((p) => /\.(html?|htm)$/i.test(p))
    const htmlTexts = await readZipEntryTexts(zipBlob, htmlPaths, (p) => /\.(html?|htm)$/i.test(p))
    for (const html of htmlTexts.values()) {
      for (const name of parsePartNamesFromDesignHtml(html)) {
        const key = childKey(assemblyPath, name, null)
        if (!byKey.has(key)) {
          byKey.set(key, {
            key,
            label: name,
            sourcePath: null,
            assemblyPath: asmNorm,
            origin: 'internal',
          })
        }
      }
    }

    const xtBytes = await readZipEntryBytes(zipBlob, asmNorm)
    if (xtBytes) {
      for (const name of parsePartNamesFromXtBytes(xtBytes)) {
        const key = childKey(assemblyPath, name, null)
        if (!byKey.has(key)) {
          byKey.set(key, {
            key,
            label: name,
            sourcePath: null,
            assemblyPath: asmNorm,
            origin: 'internal',
          })
        }
      }
    }
  }

  return [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label, 'es'))
}

export async function discoverAllAssemblyChildren(
  zipPaths: string[],
  zipBlob: Blob | null,
): Promise<Map<string, AssemblyChildCandidate[]>> {
  const groups = buildXtAssemblyGroups(zipPaths)
  const map = new Map<string, AssemblyChildCandidate[]>()
  for (const g of groups) {
    if (!isXtAssemblyPath(g.assemblyPath)) continue
    const children = await discoverAssemblyChildren(g.assemblyPath, zipPaths, zipBlob)
    map.set(g.assemblyPath, children)
  }
  return map
}

/** Ruta sintética persistente para piezas solo dentro del ensamblaje (sin archivo suelto). */
export function syntheticSourcePath(assemblyPath: string, label: string): string {
  return `${normPath(assemblyPath)}::${encodeURIComponent(label.trim())}`
}

export function isSyntheticAssemblySourcePath(path: string): boolean {
  return path.includes('::')
}

export function labelFromSyntheticSourcePath(path: string): string {
  const idx = path.indexOf('::')
  if (idx < 0) return path
  try {
    return decodeURIComponent(path.slice(idx + 2))
  } catch {
    return path.slice(idx + 2)
  }
}

export function sourcePathForChild(child: AssemblyChildCandidate): string {
  return child.sourcePath ?? syntheticSourcePath(child.assemblyPath, child.label)
}

export function pieceForAssemblyChild(
  pieces: BodegaProjectPieceRow[],
  child: AssemblyChildCandidate,
): BodegaProjectPieceRow | undefined {
  const path = sourcePathForChild(child)
  const norm = normPath(path)
  return pieces.find((p) => p.source_path && normPath(p.source_path) === norm)
}
