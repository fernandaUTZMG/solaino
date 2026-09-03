import { createSignedUrlForBodegaStorage, BODEGA_PROYECTOS_BUCKET } from './bodegaObjectStorage'
import { getSupabase } from './supabaseClient'
import { sanitizeStorageFileName } from './bodegaOrdenes'
import {
  assertBodegaProyectosStorageFileAllowed,
  guessImageContentType,
  isImageLikeFile,
  uploadBodegaProyectosBinary,
} from './bodegaStorageUpload'
import { updatePieceMaquinadoRealCapture } from './bodegaPiecesRepo'
import { ocrImageFileAsText } from './ocrImageText'
import { ocrPdfFirstPagesAsText } from './ocrScannedPdfText'
import {
  parseOverallCycleTimeFromOcrText,
  summarizeDetectedCycleTimes,
} from './parseSurfcamOverallCycleTime'

export const BODEGA_PIECE_MAQUINADO_REAL_CAPTURE_PATCH =
  'supabase/patch_bodega_piece_maquinado_real_capture.sql'

export const BODEGA_PROYECTOS_STORAGE_MAQUINADO_PATCH =
  'supabase/patch_bodega_proyectos_storage_maquinado_paths.sql'

function pieceRealSheetStoragePath(folio: string, pieceId: string, fileName: string): string {
  const safe = sanitizeStorageFileName(fileName)
  return `${folio}/maquinado/tiempos-reales/${pieceId}/${crypto.randomUUID()}-${safe}`
}

export function assertMaquinadoRealCaptureFile(file: File): void {
  assertBodegaProyectosStorageFileAllowed(file)
  if (!isImageLikeFile(file) && !file.name.toLowerCase().endsWith('.pdf')) {
    throw new Error('Adjunta una imagen (PNG, JPG, etc.) o PDF de la pantalla o del listado SURFCAM.')
  }
}

async function ocrMaquinadoCaptureFile(file: File): Promise<string> {
  if (file.name.toLowerCase().endsWith('.pdf')) {
    return ocrPdfFirstPagesAsText(file, { maxPages: 1, scale: 2.5 })
  }
  return ocrImageFileAsText(file)
}

export async function uploadPieceMaquinadoRealSheet(args: {
  projectFolio: string
  pieceId: string
  file: File
}): Promise<{ storagePath: string; fileName: string }> {
  assertMaquinadoRealCaptureFile(args.file)
  const folio = args.projectFolio.trim()
  if (!folio) throw new Error('Folio de proyecto vacío')
  const path = pieceRealSheetStoragePath(folio, args.pieceId, args.file.name)
  const sb = getSupabase()
  const contentType = args.file.name.toLowerCase().endsWith('.pdf')
    ? 'application/pdf'
    : guessImageContentType(args.file)
  await uploadBodegaProyectosBinary(sb, BODEGA_PROYECTOS_BUCKET, path, args.file, contentType)
  return { storagePath: path, fileName: args.file.name }
}

export async function createSignedUrlForMaquinadoRealSheet(
  storagePath: string,
  expiresSec = 3600,
): Promise<string | null> {
  return createSignedUrlForBodegaStorage(BODEGA_PROYECTOS_BUCKET, storagePath, expiresSec)
}

/** Lee Overall Cycle Time de la captura (OCR) y guarda tiempo real + imagen. */
export async function savePieceMaquinadoRealFromCapture(args: {
  projectFolio: string
  pieceId: string
  file: File
  manualLabel?: string | null
}): Promise<{ realLabel: string }> {
  let realLabel = args.manualLabel?.trim() ?? ''
  if (!realLabel) {
    const ocrText = await ocrMaquinadoCaptureFile(args.file)
    const parsed = parseOverallCycleTimeFromOcrText(ocrText)
    if (!parsed) {
      const detected = summarizeDetectedCycleTimes(ocrText)
      const hint = detected
        ? ` Tiempos leídos: ${detected}. Si el correcto es el más largo, escríbelo abajo.`
        : ' Recorta la captura para que se vea la tabla con la fila Overall y Cycle Time.'
      throw new Error(
        `No se detectó el tiempo Overall en la imagen.${hint} También puedes escribir el tiempo a mano (ej. 1:21:4).`,
      )
    }
    realLabel = parsed
  }

  const up = await uploadPieceMaquinadoRealSheet({
    projectFolio: args.projectFolio,
    pieceId: args.pieceId,
    file: args.file,
  })

  await updatePieceMaquinadoRealCapture({
    pieceId: args.pieceId,
    realLabel,
    realSheetStoragePath: up.storagePath,
    realSheetName: up.fileName,
  })

  return { realLabel }
}

/** Misma captura SURFCAM (mismo Overall) en varias piezas iguales: OCR una vez, archivo en cada pieza. */
export async function batchSaveMaquinadoRealFromCapture(args: {
  pieces: Array<{ id: string; label: string; bodega_projects?: { folio?: string | null } | null }>
  file: File
  manualLabel?: string | null
}): Promise<{ updated: number; skipped: number; errors: string[]; realLabel: string }> {
  let realLabel = args.manualLabel?.trim() ?? ''
  if (!realLabel) {
    const ocrText = await ocrMaquinadoCaptureFile(args.file)
    const parsed = parseOverallCycleTimeFromOcrText(ocrText)
    if (!parsed) {
      const detected = summarizeDetectedCycleTimes(ocrText)
      const hint = detected
        ? ` Tiempos leídos: ${detected}. Si el correcto es el más largo, escríbelo abajo.`
        : ' Recorta la captura para que se vea la fila Overall y Cycle Time.'
      throw new Error(
        `No se detectó el tiempo Overall en la imagen.${hint} También puedes escribir el tiempo a mano (ej. 1:21:4).`,
      )
    }
    realLabel = parsed
  }

  let updated = 0
  let skipped = 0
  const errors: string[] = []

  for (const p of args.pieces) {
    const folio = p.bodega_projects?.folio?.trim()
    if (!folio) {
      skipped += 1
      errors.push(`${p.label}: sin folio de proyecto`)
      continue
    }
    try {
      const up = await uploadPieceMaquinadoRealSheet({
        projectFolio: folio,
        pieceId: p.id,
        file: args.file,
      })
      await updatePieceMaquinadoRealCapture({
        pieceId: p.id,
        realLabel,
        realSheetStoragePath: up.storagePath,
        realSheetName: up.fileName,
      })
      updated += 1
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al guardar'
      errors.push(`${p.label}: ${msg}`)
    }
  }

  return { updated, skipped, errors, realLabel }
}
