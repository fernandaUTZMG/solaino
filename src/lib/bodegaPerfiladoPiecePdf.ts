import type { ProjectDesignVersionRow } from './designVersionsRepo'
import { approvedDesignEntregaVersions, fetchDesignVersions } from './designVersionsRepo'
import {
  designZipKitKey,
  parseVersionScopedDesignPath,
  resolveApprovedDesignEntregaEntryPaths,
  resolveDesignVersionEntryPaths,
  resolveDesignVersionZipBlob,
  zipEntryPathForStorageLookup,
} from './designZipPaths'
import { readZipEntryBytes } from './designZipContent'
import type { BodegaProjectPieceRow } from './bodegaPiecesRepo'
import { createSignedUrlForPieceDesignDrawing } from './bodegaPieceDesignDrawing'
import { findMatchingPdfPathForPart, zipPathStem } from './designZipPiecePairs'
import { isPerfiladoPdfZipPath, labelFromZipPath } from './zipDesignPackage'

const designZipBlobByVersion = new Map<string, Blob>()

/** PDF del ZIP de diseño que corresponde a la pieza (misma base de nombre o ruta PDF directa). */
export function resolvePerfiladoPdfPathForPiece(
  piece: Pick<
    BodegaProjectPieceRow,
    'source_path' | 'label' | 'design_drawing_storage_path' | 'design_drawing_name'
  >,
  entryPaths: string[],
): string | null {
  if (piece.design_drawing_storage_path && piece.design_drawing_name) return null
  if (piece.source_path && isPerfiladoPdfZipPath(piece.source_path)) {
    const norm = piece.source_path.replaceAll('\\', '/')
    return entryPaths.find((p) => p.replaceAll('\\', '/') === norm) ?? null
  }

  if (piece.source_path && !isPerfiladoPdfZipPath(piece.source_path)) {
    const paired = findMatchingPdfPathForPart(piece.source_path, entryPaths)
    if (paired) return paired
  }

  const want = new Set<string>()
  if (piece.source_path) want.add(zipPathStem(piece.source_path))
  want.add(zipPathStem(piece.label))

  const pdfPaths = entryPaths.filter((p) => isPerfiladoPdfZipPath(p))
  for (const pdf of pdfPaths) {
    if (want.has(zipPathStem(pdf))) return pdf
  }

  for (const pdf of pdfPaths) {
    const ps = zipPathStem(pdf)
    for (const s of want) {
      if (s.length >= 3 && (ps.includes(s) || s.includes(ps))) return pdf
    }
  }

  return null
}

export async function fetchApprovedDesignEntregaVersions(
  projectId: string,
): Promise<ProjectDesignVersionRow[]> {
  const versions = await fetchDesignVersions(projectId)
  return approvedDesignEntregaVersions(versions)
}

/** @deprecated Usar fetchApprovedDesignEntregaVersions */
export async function fetchApprovedDesignEntregaVersion(
  projectId: string,
): Promise<ProjectDesignVersionRow | null> {
  const approved = await fetchApprovedDesignEntregaVersions(projectId)
  return approved.length > 0 ? approved[approved.length - 1]! : null
}

export type PerfiladoPiecePdfResolve = {
  pdfPath: string | null
  pdfLabel: string | null
  missingReason: string | null
  /** Plano subido aparte (Storage), no dentro del ZIP. */
  attachedStoragePath?: string | null
}

/** Comprueba si hay PDF en el diseño aprobado sin descargar el binario del PDF. */
export async function resolvePerfiladoPiecePdfMeta(
  projectId: string,
  piece: Pick<
    BodegaProjectPieceRow,
    'source_path' | 'label' | 'design_drawing_storage_path' | 'design_drawing_name'
  >,
): Promise<PerfiladoPiecePdfResolve> {
  if (piece.design_drawing_storage_path && piece.design_drawing_name) {
    return {
      pdfPath: null,
      pdfLabel: piece.design_drawing_name,
      missingReason: null,
      attachedStoragePath: piece.design_drawing_storage_path,
    }
  }

  const versions = await fetchApprovedDesignEntregaVersions(projectId)
  if (versions.length === 0) {
    return {
      pdfPath: null,
      pdfLabel: null,
      missingReason:
        'Sin plano: sube el PDF en la pieza (Diseño o Piezas) o inclúyelo en el ZIP de diseño aprobado.',
    }
  }
  const paths = await resolveApprovedDesignEntregaEntryPaths(versions)
  const pdfPath = resolvePerfiladoPdfPathForPiece(piece, paths)
  if (!pdfPath) {
    return {
      pdfPath: null,
      pdfLabel: null,
      missingReason:
        'No hay PDF en el diseño con el mismo nombre. Adjunta el plano en la ficha de la pieza (botón «Subir plano»).',
    }
  }
  return { pdfPath, pdfLabel: labelFromZipPath(pdfPath), missingReason: null }
}

async function designZipBlobForVersion(version: ProjectDesignVersionRow): Promise<Blob> {
  const cached = designZipBlobByVersion.get(version.id)
  if (cached) return cached
  const blob = await resolveDesignVersionZipBlob(version)
  designZipBlobByVersion.set(version.id, blob)
  return blob
}

async function findDesignVersionContainingPath(
  versions: ProjectDesignVersionRow[],
  pdfPath: string,
): Promise<ProjectDesignVersionRow | null> {
  const { scopeKey, zipPath } = parseVersionScopedDesignPath(pdfPath)
  const want = zipPath.trim().replaceAll('\\', '/')
  if (scopeKey) {
    const scoped = versions.find((v) => designZipKitKey(v.zip_filename) === scopeKey)
    if (scoped) return scoped
  }
  for (const version of versions) {
    const paths = await resolveDesignVersionEntryPaths(version)
    if (paths.some((p) => p.trim().replaceAll('\\', '/') === want)) return version
  }
  return versions[versions.length - 1] ?? null
}

/** Extrae el PDF del ZIP de diseño y devuelve URL blob para visor o nueva pestaña. */
export async function loadPerfiladoPiecePdfObjectUrl(
  projectId: string,
  piece: Pick<
    BodegaProjectPieceRow,
    'source_path' | 'label' | 'design_drawing_storage_path' | 'design_drawing_name'
  >,
): Promise<{ url: string; pdfPath: string; pdfLabel: string }> {
  const meta = await resolvePerfiladoPiecePdfMeta(projectId, piece)

  if (meta.attachedStoragePath) {
    const signed = await createSignedUrlForPieceDesignDrawing(meta.attachedStoragePath)
    if (!signed) throw new Error('No se pudo abrir el plano adjunto.')
    return {
      url: signed,
      pdfPath: meta.attachedStoragePath,
      pdfLabel: meta.pdfLabel ?? piece.design_drawing_name ?? 'Plano.pdf',
    }
  }

  if (!meta.pdfPath) {
    throw new Error(meta.missingReason ?? 'PDF no disponible')
  }
  const versions = await fetchApprovedDesignEntregaVersions(projectId)
  if (versions.length === 0) throw new Error('Diseño aprobado no encontrado')

  const version = await findDesignVersionContainingPath(versions, meta.pdfPath)
  if (!version) throw new Error('ZIP de diseño no encontrado para el plano')

  const zipBlob = await designZipBlobForVersion(version)
  const bytes = await readZipEntryBytes(zipBlob, zipEntryPathForStorageLookup(meta.pdfPath))
  if (!bytes) throw new Error('No se pudo leer el PDF dentro del ZIP de diseño.')

  const pdfBlob = new Blob([bytes as BlobPart], { type: 'application/pdf' })
  const url = URL.createObjectURL(pdfBlob)
  return { url, pdfPath: meta.pdfPath, pdfLabel: meta.pdfLabel ?? labelFromZipPath(meta.pdfPath) }
}

export function revokePerfiladoPiecePdfObjectUrl(url: string | null | undefined): void {
  if (url) URL.revokeObjectURL(url)
}
