import { createSignedUrlForBodegaStorage, BODEGA_PROYECTOS_BUCKET } from './bodegaObjectStorage'
import { getSupabase } from './supabaseClient'
import { sanitizeStorageFileName } from './bodegaOrdenes'
import { assertBodegaProyectosStorageFileAllowed, uploadBodegaProyectosBinary } from './bodegaStorageUpload'
import type { BodegaProjectPieceRow } from './bodegaPiecesRepo'
import { updatePieceDesignDrawing } from './bodegaPiecesRepo'
import { findMatchingPdfPathForPart } from './designZipPiecePairs'
import { isPerfiladoPdfZipPath } from './zipDesignPackage'

export const BODEGA_PIECE_DESIGN_DRAWING_MIGRATION =
  'supabase/patch_bodega_piece_design_drawing.sql'

export function assertDesignDrawingPdfFile(file: File): void {
  assertBodegaProyectosStorageFileAllowed(file)
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    throw new Error('El plano debe ser un archivo PDF (.pdf).')
  }
}

function pieceDesignDrawingStoragePath(folio: string, pieceId: string, fileName: string): string {
  const safe = sanitizeStorageFileName(fileName)
  return `${folio}/diseno/planos/${pieceId}/${crypto.randomUUID()}-${safe}`
}

export async function uploadPieceDesignDrawing(args: {
  projectFolio: string
  pieceId: string
  file: File
}): Promise<{ storagePath: string; fileName: string }> {
  assertDesignDrawingPdfFile(args.file)
  const folio = args.projectFolio.trim()
  if (!folio) throw new Error('Folio de proyecto vacío')
  const path = pieceDesignDrawingStoragePath(folio, args.pieceId, args.file.name)
  const sb = getSupabase()
  await uploadBodegaProyectosBinary(sb, BODEGA_PROYECTOS_BUCKET, path, args.file, 'application/pdf')
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
  const uploaded = await uploadPieceDesignDrawing(args)
  await updatePieceDesignDrawing({
    pieceId: args.pieceId,
    fileStoragePath: uploaded.storagePath,
    fileName: uploaded.fileName,
  })
  return uploaded
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
