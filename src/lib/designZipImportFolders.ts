import { designKitLabelFromScopeKey, parseVersionScopedDesignPath } from './designZipScope'

const ROOT_FOLDER_KEY = '__root__'

/** Clave estable: modelo (kit) + carpeta de primer nivel dentro del ZIP. */
export function designZipImportFolderKey(path: string): string {
  const { scopeKey, zipPath } = parseVersionScopedDesignPath(path.trim().replaceAll('\\', '/'))
  const segments = zipPath.split('/').filter(Boolean)
  const topFolder = segments.length > 1 ? segments[0]!.toLowerCase() : ROOT_FOLDER_KEY
  return `${scopeKey ?? ''}|${topFolder}`
}

function topFolderDisplayName(path: string): string {
  const { zipPath } = parseVersionScopedDesignPath(path.trim().replaceAll('\\', '/'))
  const segments = zipPath.split('/').filter(Boolean)
  if (segments.length <= 1) return 'Raíz del ZIP'
  return segments[0]!
}

export function designZipImportFolderLabel(
  folderKey: string,
  samplePath: string,
  kitLabels?: ReadonlyMap<string, string> | Record<string, string>,
): string {
  const [scopeRaw] = folderKey.split('|')
  const scopeKey = scopeRaw || null
  const folder = topFolderDisplayName(samplePath)
  if (scopeKey) {
    const kit = designKitLabelFromScopeKey(scopeKey, kitLabels)
    return `${kit} · ${folder}`
  }
  return folder
}

export type DesignZipImportFolderGroup = {
  folderKey: string
  label: string
  paths: string[]
}

/** Agrupa rutas .PRT/.SLDPRT por carpeta de primer nivel (y modelo si hay varios ZIP). */
export function groupDesignPathsByImportFolder(
  paths: string[],
  kitLabels?: ReadonlyMap<string, string> | Record<string, string>,
): DesignZipImportFolderGroup[] {
  const buckets = new Map<string, string[]>()
  const order: string[] = []
  for (const raw of paths) {
    const path = raw.trim().replaceAll('\\', '/')
    if (!path) continue
    const key = designZipImportFolderKey(path)
    if (!buckets.has(key)) {
      buckets.set(key, [])
      order.push(key)
    }
    buckets.get(key)!.push(path)
  }
  return order.map((folderKey) => {
    const folderPaths = buckets.get(folderKey) ?? []
    return {
      folderKey,
      label: designZipImportFolderLabel(folderKey, folderPaths[0] ?? '', kitLabels),
      paths: folderPaths,
    }
  })
}

export function pathBelongsToImportFolder(path: string, folderKey: string): boolean {
  return designZipImportFolderKey(path) === folderKey
}
