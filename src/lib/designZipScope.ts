/** Clave de «kit» a partir del nombre del ZIP (agrupa v1/v5 del mismo producto). */
export function designZipKitKey(zipFilename: string): string {
  const base = zipFilename.replace(/\.zip$/i, '').trim().toLowerCase()
  if (base.includes('cj2064042')) return 'cj2064042'
  if (base.includes('cj2063576')) return 'cj2063576'
  const slug = base.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  return slug.slice(0, 48) || 'diseno'
}

/** Ruta interna del ZIP con prefijo de kit cuando el mismo archivo existe en varios ZIP. */
export function versionScopedDesignPath(scopeKey: string, zipPath: string): string {
  const norm = zipPath.trim().replaceAll('\\', '/')
  return `@${scopeKey}/${norm}`
}

export function parseVersionScopedDesignPath(path: string): { scopeKey: string | null; zipPath: string } {
  const norm = path.trim().replaceAll('\\', '/')
  const m = norm.match(/^@([^/]+)\/(.+)$/)
  if (!m) return { scopeKey: null, zipPath: norm }
  return { scopeKey: m[1]!, zipPath: m[2]! }
}

/** Ruta interna del ZIP sin prefijo `@kit/` (comparación insensible a mayúsculas). */
export function designZipEntryKey(path: string): string {
  return parseVersionScopedDesignPath(path.trim().replaceAll('\\', '/')).zipPath.toLowerCase()
}

/** Misma pieza en ZIP aunque una ruta lleve prefijo de kit y la otra no. */
export function designZipEntriesMatch(a: string, b: string): boolean {
  return designZipEntryKey(a) === designZipEntryKey(b)
}

/** Etiqueta legible del modelo / entrega a partir del nombre del ZIP. */
export function designKitLabelFromZipFilename(zipFilename: string): string {
  const base = zipFilename.replace(/\.zip$/i, '').trim()
  const cj = base.match(/cj\d+/i)?.[0]
  if (cj) return cj.toUpperCase()
  const sol = base.match(/sol\d+/i)?.[0]
  if (sol) return sol.toUpperCase()
  const trimmed = base.replace(/[_\s]+/g, ' ').trim()
  return trimmed.slice(0, 48) || 'Modelo'
}

export function designKitLabelFromScopeKey(
  scopeKey: string,
  kitLabels?: ReadonlyMap<string, string> | Record<string, string>,
): string {
  const fromMap =
    kitLabels instanceof Map
      ? kitLabels.get(scopeKey)
      : kitLabels
        ? (kitLabels as Record<string, string>)[scopeKey]
        : undefined
  if (fromMap) return fromMap
  return scopeKey.toUpperCase()
}

function innerFolderFromZipPath(zipPath: string): string | null {
  const segments = zipPath.trim().replaceAll('\\', '/').split('/').filter(Boolean)
  if (segments.length <= 1) return null
  segments.pop()
  return segments.join('/')
}

/**
 * Título visible para la diseñadora: modelo + carpeta + archivo.
 * Ej.: `CJ2064042 · SOL26040/BASE.SLDPRT` en lugar de solo `BASE.SLDPRT`.
 */
export function displayLabelFromDesignPath(
  path: string,
  kitLabels?: ReadonlyMap<string, string> | Record<string, string>,
): string {
  const { scopeKey, zipPath } = parseVersionScopedDesignPath(path)
  const norm = zipPath.trim().replaceAll('\\', '/')
  const file = norm.split('/').pop()?.trim() || norm
  const folder = innerFolderFromZipPath(norm)
  const parts: string[] = []
  if (scopeKey) parts.push(designKitLabelFromScopeKey(scopeKey, kitLabels))
  if (folder) parts.push(`${folder}/${file}`)
  else parts.push(file)
  return parts.join(' · ')
}

/** Badge corto del modelo (null si solo hay un ZIP sin prefijo). */
export function designPathModelBadge(
  path: string,
  kitLabels?: ReadonlyMap<string, string> | Record<string, string>,
): string | null {
  const { scopeKey } = parseVersionScopedDesignPath(path)
  if (!scopeKey) return null
  return designKitLabelFromScopeKey(scopeKey, kitLabels)
}

export type DesignPathKitGroup<T> = {
  scopeKey: string | null
  label: string
  items: T[]
}

/** Agrupa rutas o piezas por modelo cuando hay varias entregas en el mismo proyecto. */
/** Mapa kit → nombre legible del ZIP de diseño. */
export function buildDesignKitLabelMap(
  versions: ReadonlyArray<{ zip_filename: string }>,
): Map<string, string> {
  const m = new Map<string, string>()
  for (const v of versions) {
    const kit = designZipKitKey(v.zip_filename)
    m.set(kit, designKitLabelFromZipFilename(v.zip_filename))
  }
  return m
}

export function groupDesignItemsByKit<T>(
  items: T[],
  pathForItem: (item: T) => string,
  kitLabels?: ReadonlyMap<string, string> | Record<string, string>,
): DesignPathKitGroup<T>[] {
  const order: Array<string | null> = []
  const buckets = new Map<string | null, T[]>()
  for (const item of items) {
    const { scopeKey } = parseVersionScopedDesignPath(pathForItem(item))
    if (!buckets.has(scopeKey)) {
      buckets.set(scopeKey, [])
      order.push(scopeKey)
    }
    buckets.get(scopeKey)!.push(item)
  }
  return order.map((scopeKey) => ({
    scopeKey,
    label: scopeKey ? designKitLabelFromScopeKey(scopeKey, kitLabels) : 'Diseño',
    items: buckets.get(scopeKey) ?? [],
  }))
}
