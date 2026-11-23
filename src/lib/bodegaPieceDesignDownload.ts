import { sanitizeStorageFileName } from './bodegaOrdenes'
import { readZipEntryBytes } from './designZipContent'
import { resolveDesignVersionEntryPaths, resolveDesignVersionZipBlob } from './designZipPaths'
import { designZipEntriesMatch } from './designZipScope'
import type { ProjectDesignVersionRow } from './designVersionsRepo'
import { downloadBlobAsFile } from './downloadBlobAsFile'
import { isXtDesignVersion } from './xtDesignManifest'
import { labelFromZipPath } from './zipDesignPackage'

const CAD_FILE = /\.(prt|slcprt|sldprt|x_t|xt)$/i

const designBlobByVersion = new Map<string, Blob>()

function samePieceName(a: string, b: string): boolean {
  const left = a.trim()
  const right = b.trim()
  if (!left || !right) return false
  return designZipEntriesMatch(left, right) || left.toLowerCase() === right.toLowerCase()
}

function manifestPieceNames(version: ProjectDesignVersionRow): string[] {
  const raw = version.manifest?.pieceNames ?? version.manifest?.entryPaths
  if (!Array.isArray(raw)) return []
  return raw.filter((n): n is string => typeof n === 'string' && n.trim().length > 0)
}

function cadStem(path: string): string {
  return labelFromZipPath(path).replace(CAD_FILE, '').trim()
}

async function designBlob(version: ProjectDesignVersionRow): Promise<Blob> {
  const cached = designBlobByVersion.get(version.id)
  if (cached) return cached
  const blob = await resolveDesignVersionZipBlob(version)
  designBlobByVersion.set(version.id, blob)
  return blob
}

/**
 * Descarga el archivo de diseño de una sola pieza, y solo de la versión de este proyecto.
 * Un ensamble .x_t se guarda con el nombre de la pieza. Un ZIP entrega únicamente la entrada que coincide.
 */
export async function downloadDesignFileForPiece(args: {
  designVersion: ProjectDesignVersionRow
  pieceLabel: string
  sourcePath: string | null
}): Promise<void> {
  const label = args.pieceLabel.trim()
  const source = args.sourcePath?.trim() ?? ''
  const keys = [label, source].filter((k) => k.length > 0)
  if (keys.length === 0) throw new Error('Esta pieza no tiene nombre para descargar.')

  const version = args.designVersion
  const blob = await designBlob(version)

  if (isXtDesignVersion(version)) {
    const names = manifestPieceNames(version)
    if (names.length > 0 && !names.some((name) => keys.some((key) => samePieceName(name, key)))) {
      throw new Error('Esta pieza no está en el .x_t de este proyecto.')
    }
    const base = sanitizeStorageFileName(label || source || 'pieza')
    downloadBlobAsFile(blob, `${base}.x_t`)
    return
  }

  const paths = (await resolveDesignVersionEntryPaths(version)).filter((p) => CAD_FILE.test(p))
  const hits = paths.filter((path) => {
    if (source && designZipEntriesMatch(path, source)) return true
    const stem = cadStem(path)
    return keys.some((key) => samePieceName(stem, key))
  })
  if (hits.length === 0) {
    throw new Error('No encontré el archivo de esta pieza en el diseño de este proyecto.')
  }
  if (hits.length > 1) {
    throw new Error('Hay más de un archivo con el nombre de esta pieza. No se descargó ninguno.')
  }
  const entry = hits[0]!
  const bytes = await readZipEntryBytes(blob, entry)
  if (!bytes) throw new Error('No se pudo leer el archivo de esta pieza.')
  downloadBlobAsFile(new Blob([bytes as BlobPart]), labelFromZipPath(entry))
}
