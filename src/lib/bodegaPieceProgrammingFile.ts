import { createSignedUrlForBodegaStorage, BODEGA_PROYECTOS_BUCKET } from './bodegaObjectStorage'
import { getSupabase } from './supabaseClient'
import { sanitizeStorageFileName } from './bodegaOrdenes'
import { assertBodegaProyectosStorageFileAllowed, uploadBodegaProyectosBinary } from './bodegaStorageUpload'
import type { BodegaPieceLane } from './bodegaPieceIntervalsRepo'
import {
  endPieceInterval,
  pieceHasOpenInterval,
  startPieceInterval,
  type BodegaPieceIntervalRow,
} from './bodegaPieceIntervalsRepo'
import type { ProgrammingExitKind } from './bodegaPiecesRepo'
import { updateProgrammingFinish, updateProgrammingPieceFile } from './bodegaPiecesRepo'

export const BODEGA_PIECE_PROGRAMMING_FILE_MIGRATION =
  'supabase/patch_bodega_piece_programming_file.sql'

function pieceProgrammingStoragePath(folio: string, pieceId: string, fileName: string): string {
  const safe = sanitizeStorageFileName(fileName)
  return `${folio}/programacion/piezas/${pieceId}/${crypto.randomUUID()}-${safe}`
}

function guessPieceProgrammingContentType(file: File): string {
  if (file.type && file.type !== 'application/octet-stream') return file.type
  const n = file.name.toLowerCase()
  if (n.endsWith('.zip')) return 'application/zip'
  if (n.endsWith('.pdf')) return 'application/pdf'
  if (n.endsWith('.nc') || n.endsWith('.tap') || n.endsWith('.gcode')) return 'text/plain'
  return 'application/octet-stream'
}

export async function uploadPieceProgrammingFile(args: {
  projectFolio: string
  pieceId: string
  file: File
}): Promise<{ storagePath: string; fileName: string }> {
  assertBodegaProyectosStorageFileAllowed(args.file)
  const folio = args.projectFolio.trim()
  if (!folio) throw new Error('Folio de proyecto vacío')
  const path = pieceProgrammingStoragePath(folio, args.pieceId, args.file.name)
  const sb = getSupabase()
  await uploadBodegaProyectosBinary(sb, BODEGA_PROYECTOS_BUCKET, path, args.file, guessPieceProgrammingContentType(args.file))
  return { storagePath: path, fileName: args.file.name }
}

export async function finishPieceProgramming(args: {
  projectFolio: string
  pieceId: string
  lane: BodegaPieceLane
  exitKind: ProgrammingExitKind
  file: File
  /** Si no hay reloj activo, lo inicia antes de cerrar (útil en lote con el mismo archivo). */
  startIfNeeded?: boolean
  intervals?: BodegaPieceIntervalRow[]
}): Promise<void> {
  if (args.startIfNeeded) {
    const open =
      args.intervals != null
        ? pieceHasOpenInterval(args.intervals, args.pieceId, args.lane)
        : false
    if (!open) {
      await startPieceInterval(args.pieceId, args.lane)
    }
  }
  const { storagePath, fileName } = await uploadPieceProgrammingFile({
    projectFolio: args.projectFolio,
    pieceId: args.pieceId,
    file: args.file,
  })
  await endPieceInterval(args.pieceId, args.lane)
  await updateProgrammingFinish({
    pieceId: args.pieceId,
    exitKind: args.exitKind,
    fileStoragePath: storagePath,
    fileName,
  })
}

export async function replacePieceProgrammingFile(args: {
  projectFolio: string
  pieceId: string
  file: File
}): Promise<void> {
  const { storagePath, fileName } = await uploadPieceProgrammingFile(args)
  await updateProgrammingPieceFile({
    pieceId: args.pieceId,
    fileStoragePath: storagePath,
    fileName,
  })
}

export async function createSignedUrlForPieceProgrammingFile(
  storagePath: string,
  expiresSec = 3600,
): Promise<string | null> {
  return createSignedUrlForBodegaStorage(BODEGA_PROYECTOS_BUCKET, storagePath, expiresSec)
}
