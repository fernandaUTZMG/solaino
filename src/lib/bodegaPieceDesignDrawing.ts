import { createSignedUrlForBodegaStorage, BODEGA_PROYECTOS_BUCKET } from './bodegaObjectStorage'
import { getSupabase } from './supabaseClient'
import { sanitizeStorageFileName } from './bodegaOrdenes'
import { assertBodegaProyectosStorageFileAllowed, uploadBodegaProyectosBinary } from './bodegaStorageUpload'
import type { BodegaProjectPieceRow } from './bodegaPiecesRepo'
import { updatePieceDesignDrawing, BODEGA_PIECE_DESIGN_DRAWING_MIGRATION } from './bodegaPiecesRepo'
import { findMatchingPdfPathForPart } from './designZipPiecePairs'
import { isPerfiladoPdfZipPath } from './zipDesignPackage'
import { isBodegaR2Enabled } from './bodegaR2Storage'
import { formatStorageUploadError, refreshSessionBeforeStorageUpload } from './bodegaStorageCommon'

export { BODEGA_PIECE_DESIGN_DRAWING_MIGRATION }

export function assertDesignDrawingPdfFile(file: File): void {
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    throw new Error('El plano debe ser un archivo PDF (.pdf).')
  }
  try {
    assertBodegaProyectosStorageFileAllowed(file)
  } catch (e) {
    throw new Error(e instanceof Error ? e.message.replace(/\bZIP\b/gi, 'PDF') : 'Archivo no permitido')
  }
}

function pieceDesignDrawingStoragePath(folio: string, pieceId: string, fileName: string): string {
  const safe = sanitizeStorageFileName(fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`)
  return `${folio}/diseno/planos/${pieceId}/${crypto.randomUUID()}-${safe}`
}

async function uploadPdfToProyectos(path: string, file: File): Promise<void> {
  const sb = getSupabase()
  const contentType = file.type && file.type.includes('pdf') ? file.type : 'application/pdf'
  try {
    await uploadBodegaProyectosBinary(sb, BODEGA_PROYECTOS_BUCKET, path, file, contentType)
    return
  } catch (first) {
    // Reintento en Storage nativo si el PUT a R2 falla (CORS/red).
    if (!isBodegaR2Enabled()) throw first
    const msg = first instanceof Error ? first.message : String(first)
    console.warn('[plano PDF] R2 falló, reintento en Supabase Storage:', msg)
    await refreshSessionBeforeStorageUpload(sb)
    const body = await file.arrayBuffer()
    const { error } = await sb.storage.from(BODEGA_PROYECTOS_BUCKET).upload(path, body, {
      cacheControl: '3600',
      upsert: true,
      contentType: 'application/octet-stream',
    })
    if (error) {
      throw new Error(
        `${formatStorageUploadError(error)} (también falló R2: ${msg.slice(0, 180)})`,
      )
    }
  }
}

export async function uploadPieceDesignDrawing(args: {
  projectFolio: string
  pieceId: string
  file: File
}): Promise<{ storagePath: string; fileName: string }> {
  assertDesignDrawingPdfFile(args.file)
  const folio = args.projectFolio.trim()
  if (!folio) throw new Error('Folio de proyecto vacío')
  if (!args.pieceId) throw new Error('Falta el id de la pieza')
  const path = pieceDesignDrawingStoragePath(folio, args.pieceId, args.file.name)
  await uploadPdfToProyectos(path, args.file)
  return { storagePath: path, fileName: args.file.name }
}

export async function createSignedUrlForPieceDesignDrawing(
  storagePath: string,
  expiresSec = 3600,
): Promise<string | null> {
  return createSignedUrlForBodegaStorage(BODEGA_PROYECTOS_BUCKET, storagePath, expiresSec)
}

export async function attachPieceDesignDrawing(args: {
  projectFolio: string
  pieceId: string
  file: File
}): Promise<{ storagePath: string; fileName: string }> {
  try {
    const uploaded = await uploadPieceDesignDrawing(args)
    try {
      await updatePieceDesignDrawing({
        pieceId: args.pieceId,
        fileStoragePath: uploaded.storagePath,
        fileName: uploaded.fileName,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (/design_drawing|column|schema cache/i.test(msg)) {
        throw new Error(
          `El PDF se subió, pero faltan columnas en la base. En Supabase SQL Editor ejecuta ${BODEGA_PIECE_DESIGN_DRAWING_MIGRATION} y recarga.`,
        )
      }
      throw e
    }
    return uploaded
  } catch (e) {
    if (e instanceof Error) throw e
    throw new Error('No se pudo adjuntar el plano PDF')
  }
}

export type PiecePlanoSource = 'adjunto' | 'zip' | null

export function piecePlanoSource(
  piece: Pick<
    BodegaProjectPieceRow,
    'source_path' | 'design_drawing_storage_path' | 'design_drawing_name'
  >,
  designZipPaths: string[] = [],
): PiecePlanoSource {
  if (piece.design_drawing_storage_path && piece.design_drawing_name) return 'adjunto'
  if (
    piece.source_path &&
    !isPerfiladoPdfZipPath(piece.source_path) &&
    findMatchingPdfPathForPart(piece.source_path, designZipPaths)
  ) {
    return 'zip'
  }
  return null
}

export function pieceHasPlano(
  piece: Pick<
    BodegaProjectPieceRow,
    'source_path' | 'design_drawing_storage_path' | 'design_drawing_name'
  >,
  designZipPaths: string[] = [],
): boolean {
  return piecePlanoSource(piece, designZipPaths) != null
}
