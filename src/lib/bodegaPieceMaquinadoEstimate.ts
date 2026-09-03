import { createSignedUrlForBodegaStorage, BODEGA_PROYECTOS_BUCKET } from './bodegaObjectStorage'
import { getSupabase } from './supabaseClient'
import { sanitizeStorageFileName } from './bodegaOrdenes'
import {
  assertBodegaProyectosStorageFileAllowed,
  guessImageContentType,
  isImageLikeFile,
  uploadBodegaProyectosBinary,
} from './bodegaStorageUpload'
import { parseHmsToSeconds } from './maquinadoEstimatedTime'
import { updatePieceMaquinadoEstimate } from './bodegaPiecesRepo'

export const BODEGA_PIECE_MAQUINADO_ESTIMATE_PATCH = 'supabase/patch_bodega_piece_maquinado_estimate.sql'

function pieceTimeSheetStoragePath(folio: string, pieceId: string, fileName: string): string {
  const safe = sanitizeStorageFileName(fileName)
  return `${folio}/programacion/tiempos-maquina/${pieceId}/${crypto.randomUUID()}-${safe}`
}

export function assertMaquinadoTimeSheetFile(file: File): void {
  assertBodegaProyectosStorageFileAllowed(file)
  if (!isImageLikeFile(file) && !file.name.toLowerCase().endsWith('.pdf')) {
    throw new Error('Adjunta una imagen (PNG, JPG, etc.) o PDF del listado de operaciones.')
  }
}

export async function uploadPieceMaquinadoTimeSheet(args: {
  projectFolio: string
  pieceId: string
  file: File
}): Promise<{ storagePath: string; fileName: string }> {
  assertMaquinadoTimeSheetFile(args.file)
  const folio = args.projectFolio.trim()
  if (!folio) throw new Error('Folio de proyecto vacío')
  const path = pieceTimeSheetStoragePath(folio, args.pieceId, args.file.name)
  const sb = getSupabase()
  const contentType = args.file.name.toLowerCase().endsWith('.pdf')
    ? 'application/pdf'
    : guessImageContentType(args.file)
  await uploadBodegaProyectosBinary(sb, BODEGA_PROYECTOS_BUCKET, path, args.file, contentType)
  return { storagePath: path, fileName: args.file.name }
}

export async function createSignedUrlForMaquinadoTimeSheet(
  storagePath: string,
  expiresSec = 3600,
): Promise<string | null> {
  return createSignedUrlForBodegaStorage(BODEGA_PROYECTOS_BUCKET, storagePath, expiresSec)
}

export async function savePieceMaquinadoEstimate(args: {
  projectFolio: string
  pieceId: string
  estimatedLabel: string
  timeSheetFile?: File | null
  varianceNotes?: string | null
}): Promise<void> {
  const parsed = parseHmsToSeconds(args.estimatedLabel)
  if (parsed == null) {
    throw new Error('Escribe el tiempo estimado en formato H:M:S (ej. 1:21:4 del Overall Cycle Time).')
  }

  let sheetPath: string | undefined
  let sheetName: string | undefined
  if (args.timeSheetFile) {
    const up = await uploadPieceMaquinadoTimeSheet({
      projectFolio: args.projectFolio,
      pieceId: args.pieceId,
      file: args.timeSheetFile,
    })
    sheetPath = up.storagePath
    sheetName = up.fileName
  }

  await updatePieceMaquinadoEstimate({
    pieceId: args.pieceId,
    estimatedSeconds: parsed,
    estimatedLabel: args.estimatedLabel.trim(),
    timeSheetStoragePath: sheetPath,
    timeSheetName: sheetName,
    varianceNotes: args.varianceNotes ?? undefined,
  })
}
