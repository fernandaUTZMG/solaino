import type { ProjectDesignVersionRow } from './designVersionsRepo'
import { approvedDesignEntregaVersions, fetchDesignVersions } from './designVersionsRepo'
import { readZipEntryBytes } from './designZipContent'
import {
  designZipKitKey,
  parseVersionScopedDesignPath,
  resolveDesignVersionEntryPaths,
  resolveDesignVersionZipBlob,
  zipEntryPathForStorageLookup,
} from './designZipPaths'
import { BODEGA_PROYECTOS_BUCKET } from './bodegaObjectStorage'
import { sanitizeStorageFileName } from './bodegaOrdenes'
import { getSupabase } from './supabaseClient'
import { uploadBodegaProyectosBinary } from './bodegaStorageUpload'
import { isXtDesignVersion } from './xtDesignManifest'
import { labelFromZipPath } from './zipDesignPackage'

const designZipBlobByVersion = new Map<string, Blob>()

async function designZipBlobForVersion(version: ProjectDesignVersionRow): Promise<Blob> {
  const cached = designZipBlobByVersion.get(version.id)
  if (cached) return cached
  const blob = await resolveDesignVersionZipBlob(version)
  designZipBlobByVersion.set(version.id, blob)
  return blob
}

async function findDesignVersionContainingPath(
  versions: ProjectDesignVersionRow[],
  designPath: string,
): Promise<ProjectDesignVersionRow | null> {
  const { scopeKey, zipPath } = parseVersionScopedDesignPath(designPath)
  const want = zipPath.trim().replaceAll('\\', '/')
  if (scopeKey) {
    const scoped = versions.find((v) => designZipKitKey(v.zip_filename) === scopeKey)
    if (scoped) return scoped
  }
  for (const version of versions) {
    if (isXtDesignVersion(version)) {
      const names = (version.manifest?.pieceNames ?? version.manifest?.entryPaths) as unknown
      const list = Array.isArray(names)
        ? names.filter((p): p is string => typeof p === 'string')
        : []
      if (list.some((p) => p.trim().replaceAll('\\', '/').toLowerCase() === want.toLowerCase())) {
        return version
      }
      continue
    }
    const paths = await resolveDesignVersionEntryPaths(version)
    if (paths.some((p) => p.trim().replaceAll('\\', '/') === want)) return version
  }
  return versions[versions.length - 1] ?? null
}

function accesorioStoragePath(folio: string, pieceId: string, fileName: string): string {
  const safe = sanitizeStorageFileName(fileName)
  return `${folio}/accesorios/${pieceId}/${crypto.randomUUID()}-${safe}`
}

export async function archiveAccesorioFromDesignZip(args: {
  projectId: string
  projectFolio: string
  pieceId: string
  sourcePath: string
}): Promise<{ storagePath: string; fileName: string }> {
  const folio = args.projectFolio.trim()
  if (!folio) throw new Error('Folio de proyecto vacío')

  const norm = args.sourcePath.trim().replaceAll('\\', '/')
  if (!norm) throw new Error('Ruta de archivo vacía')

  const versionsAll = await fetchDesignVersions(args.projectId)
  const versions = approvedDesignEntregaVersions(versionsAll)
  if (versions.length === 0) {
    throw new Error('No hay diseño aprobado para archivar el accesorio en la nube.')
  }

  const version = await findDesignVersionContainingPath(versions, norm)
  if (!version) throw new Error('No se encontró el archivo de diseño que contiene esta pieza.')

  const designBlob = await designZipBlobForVersion(version)
  let fileBytes: BlobPart
  let fileName: string

  if (isXtDesignVersion(version)) {
    // Un .x_t es un ensamble, no un ZIP: se archiva el mismo archivo con el nombre de la pieza.
    fileBytes = designBlob
    const base = labelFromZipPath(norm).replace(/\.(x_t|xt)$/i, '').trim() || 'pieza'
    fileName = `${sanitizeStorageFileName(base)}.x_t`
  } else {
    const bytes = await readZipEntryBytes(designBlob, zipEntryPathForStorageLookup(norm))
    if (!bytes) {
      throw new Error('No se pudo leer el archivo dentro del ZIP de diseño.')
    }
    fileBytes = bytes as BlobPart
    fileName = labelFromZipPath(norm)
  }

  const storagePath = accesorioStoragePath(folio, args.pieceId, fileName)
  const file = new File([fileBytes], fileName, { type: 'application/octet-stream' })
  const sb = getSupabase()
  await uploadBodegaProyectosBinary(sb, BODEGA_PROYECTOS_BUCKET, storagePath, file, 'application/octet-stream')

  return { storagePath, fileName }
}
