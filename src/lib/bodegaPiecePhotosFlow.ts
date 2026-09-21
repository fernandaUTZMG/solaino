import type { BodegaProjectPieceRow } from './bodegaPiecesRepo'
import type { ProjectPiecePhotoRow } from './piecePhotosRepo'

/**
 * Piezas listas para foto de cierre:
 * - Torno / perfilado / accesorios: diseño las dirige sin proceso CNC → aparecen al asignarlas.
 * - CNC: tras terminar detallado en taller.
 */
export function pieceSkipsManufacturingForPhotos(
  p: Pick<BodegaProjectPieceRow, 'programmer_bucket'>,
): boolean {
  return (
    p.programmer_bucket === 'torno' ||
    p.programmer_bucket === 'perfilado' ||
    p.programmer_bucket === 'accesorios'
  )
}

export function pieceEligibleForProjectPhotos(p: BodegaProjectPieceRow): boolean {
  if (pieceSkipsManufacturingForPhotos(p)) return true
  return p.detallado_completed_at != null
}

export function photosForPiece(photos: ProjectPiecePhotoRow[], pieceId: string): ProjectPiecePhotoRow[] {
  return photos.filter((ph) => ph.piece_id === pieceId)
}

export type ProjectPieceClosureProgress = {
  totalPieces: number
  /** Piezas ya elegibles para subir foto (antes: solo detallado). */
  detalladoDone: number
  withPhoto: number
  missingDetalladoPieceIds: string[]
  missingPhotoPieceIds: string[]
}

/** Avance de cierre sobre **todas** las piezas del proyecto. */
export function computeProjectPieceClosureProgress(
  pieces: BodegaProjectPieceRow[],
  photos: ProjectPiecePhotoRow[],
): ProjectPieceClosureProgress {
  const missingDetalladoPieceIds: string[] = []
  const missingPhotoPieceIds: string[] = []
  let detalladoDone = 0
  let withPhoto = 0
  for (const p of pieces) {
    if (pieceEligibleForProjectPhotos(p)) {
      detalladoDone++
      if (photosForPiece(photos, p.id).length > 0) withPhoto++
      else missingPhotoPieceIds.push(p.id)
    } else {
      missingDetalladoPieceIds.push(p.id)
    }
  }
  return {
    totalPieces: pieces.length,
    detalladoDone,
    withPhoto,
    missingDetalladoPieceIds,
    missingPhotoPieceIds,
  }
}

export function allProjectPiecesDetalladoComplete(pieces: BodegaProjectPieceRow[]): boolean {
  if (pieces.length === 0) return false
  return pieces.every(pieceEligibleForProjectPhotos)
}

/** Programadora: solicitar revisión cuando todas las piezas están listas para foto. */
export function canProgramadoraSolicitarCierre(pieces: BodegaProjectPieceRow[]): boolean {
  return allProjectPiecesDetalladoComplete(pieces)
}

export function piecePhotoCoverage(args: {
  pieces: BodegaProjectPieceRow[]
  photos: ProjectPiecePhotoRow[]
}): { withPhoto: number; total: number; detalladoDone: number; missingPieceIds: string[] } {
  const prog = computeProjectPieceClosureProgress(args.pieces, args.photos)
  return {
    withPhoto: prog.withPhoto,
    total: prog.totalPieces,
    detalladoDone: prog.detalladoDone,
    missingPieceIds: prog.missingPhotoPieceIds,
  }
}

export function canSupervisorFinalizeWithPiecePhotos(args: {
  pieces: BodegaProjectPieceRow[]
  photos: ProjectPiecePhotoRow[]
  alreadyFinalized: boolean
}): boolean {
  if (args.alreadyFinalized) return false
  const prog = computeProjectPieceClosureProgress(args.pieces, args.photos)
  if (prog.totalPieces === 0) return false
  return prog.detalladoDone === prog.totalPieces && prog.withPhoto === prog.totalPieces
}
