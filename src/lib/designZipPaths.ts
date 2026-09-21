import {
  createSignedUrlForDesignZip,
  type ProjectDesignVersionRow,
} from './designVersionsRepo'
import { designZipKitKey, parseVersionScopedDesignPath, versionScopedDesignPath } from './designZipScope'
import { listZipEntryPathsFromBlob } from './zipDesignPackage'
import { isXtDesignVersion } from './xtDesignManifest'

export { designZipKitKey, parseVersionScopedDesignPath, versionScopedDesignPath } from './designZipScope'

function readManifestEntryPaths(manifest: Record<string, unknown> | null): string[] | null {
  if (!manifest) return null
  const raw = manifest.entryPaths ?? manifest.pieceNames
  if (!Array.isArray(raw)) return null
  const paths = raw.filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
  return paths.length > 0 ? paths : null
}

/** Rutas internas del ZIP de diseño aprobado (manifest o descarga puntual). */
export async function resolveDesignVersionEntryPaths(version: ProjectDesignVersionRow): Promise<string[]> {
  const fromManifest = readManifestEntryPaths(version.manifest)
  if (fromManifest) return fromManifest

  if (isXtDesignVersion(version)) {
    return []
  }

  const url = await createSignedUrlForDesignZip(version.zip_storage_path)
  if (!url) throw new Error('No se pudo abrir el ZIP de diseño en la nube (permisos o ruta).')

  const res = await fetch(url)
  if (!res.ok) throw new Error('No se pudo descargar el ZIP de diseño aprobado.')
  const blob = await res.blob()
  return listZipEntryPathsFromBlob(blob)
}

/** Une rutas de varios ZIP sin duplicar (misma ruta interna). */
export function mergeZipEntryPaths(pathLists: string[][]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const list of pathLists) {
    for (const raw of list) {
      const norm = raw.trim().replaceAll('\\', '/')
      if (!norm || seen.has(norm)) continue
      seen.add(norm)
      out.push(norm)
    }
  }
  return out
}

type KitVersionEntry = {
  kit: string
  version: ProjectDesignVersionRow
  path: string
}

/** Una versión por kit (la más reciente si hay v1 y v5 del mismo ZIP). */
function latestApprovedVersionPerKit(versions: ProjectDesignVersionRow[]): ProjectDesignVersionRow[] {
  const byKit = new Map<string, ProjectDesignVersionRow>()
  for (const v of [...versions].sort((a, b) => a.version - b.version)) {
    byKit.set(designZipKitKey(v.zip_filename), v)
  }
  return [...byKit.values()].sort((a, b) => a.version - b.version)
}

/**
 * Rutas de todas las entregas aprobadas.
 * Si el mismo archivo (p. ej. ESQUINERO GRANDE.SLDPRT) está en CJ2063576 y CJ2064042,
 * genera una ruta por kit (`@cj2064042/SOLID/...`) para no perder piezas al fusionar ZIPs.
 */
export async function resolveApprovedDesignEntregaEntryPaths(
  versions: ProjectDesignVersionRow[],
): Promise<string[]> {
  if (versions.length === 0) return []
  if (versions.length === 1) return resolveDesignVersionEntryPaths(versions[0]!)

  const activeVersions = latestApprovedVersionPerKit(versions)
  const entries: KitVersionEntry[] = []
  for (const version of activeVersions) {
    const kit = designZipKitKey(version.zip_filename)
    const paths = await resolveDesignVersionEntryPaths(version)
    for (const raw of paths) {
      const path = raw.trim().replaceAll('\\', '/')
      if (!path) continue
      entries.push({ kit, version, path })
    }
  }

  const pathKits = new Map<string, Set<string>>()
  for (const e of entries) {
    const kits = pathKits.get(e.path) ?? new Set<string>()
    kits.add(e.kit)
    pathKits.set(e.path, kits)
  }

  const multiKit = activeVersions.length > 1
  const out: string[] = []
  const seen = new Set<string>()
  for (const e of entries) {
    const kits = pathKits.get(e.path)!
    const outPath =
      multiKit || kits.size > 1 ? versionScopedDesignPath(e.kit, e.path) : e.path
    if (seen.has(outPath)) continue
    seen.add(outPath)
    out.push(outPath)
  }
  return out
}

/** Ruta real dentro del ZIP (sin prefijo `@kit/`). */
export function zipEntryPathForStorageLookup(path: string): string {
  return parseVersionScopedDesignPath(path).zipPath
}

/** Descarga el ZIP de diseño (mismo origen que las rutas del manifest). */
export async function resolveDesignVersionZipBlob(version: ProjectDesignVersionRow): Promise<Blob> {
  const url = await createSignedUrlForDesignZip(version.zip_storage_path)
  if (!url) throw new Error('No se pudo abrir el ZIP de diseño en la nube (permisos o ruta).')
  const res = await fetch(url)
  if (!res.ok) throw new Error('No se pudo descargar el ZIP de diseño aprobado.')
  return res.blob()
}
