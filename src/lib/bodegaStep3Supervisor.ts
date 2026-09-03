import { designZipImportFolderKey, groupDesignPathsByImportFolder } from './designZipImportFolders'
import { displayLabelFromDesignPath } from './designZipScope'
import { filterSwPartZipPaths } from './zipDesignPackage'

/** Rutas del ZIP que pertenecen a carpetas confirmadas por el encargado. */
export function filterPathsToConfirmedFolders(paths: string[], confirmedFolderKeys: Set<string>): string[] {
  if (confirmedFolderKeys.size === 0) return []
  return paths.filter((p) => confirmedFolderKeys.has(designZipImportFolderKey(p)))
}

export type Step3FolderConfirmStatus = {
  partPaths: string[]
  folderGroups: ReturnType<typeof groupDesignPathsByImportFolder>
  confirmedCount: number
  totalFolders: number
  complete: boolean
}

/** Paso 3 encargado: todas las carpetas del diseño aprobado están confirmadas. */
export function computeStep3FolderConfirmStatus(
  designZipPaths: string[],
  confirmedFolderKeys: Set<string>,
  kitLabels?: ReadonlyMap<string, string> | Record<string, string>,
): Step3FolderConfirmStatus {
  const partPaths = filterSwPartZipPaths(designZipPaths)
  const folderGroups = groupDesignPathsByImportFolder(partPaths, kitLabels)
  const totalFolders = folderGroups.length
  const confirmedCount = folderGroups.filter((g) => confirmedFolderKeys.has(g.folderKey)).length
  const complete = totalFolders > 0 && confirmedCount === totalFolders
  return { partPaths, folderGroups, confirmedCount, totalFolders, complete }
}

export function pieceDisplayLabel(p: { label: string; source_path?: string | null }): string {
  if (p.source_path) return displayLabelFromDesignPath(p.source_path)
  return p.label
}
