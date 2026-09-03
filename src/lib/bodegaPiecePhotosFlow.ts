import type { BodegaProjectPieceRow } from './bodegaPiecesRepo'
import type { ProjectPiecePhotoRow } from './piecePhotosRepo'

/** Pieza lista para fotos de cierre: detallado terminado en taller. */
export function pieceEligibleForProjectPhotos(p: BodegaProjectPieceRow): boolean {
  return p.detallado_completed_at != null
}

export function photosForPiece(photos: ProjectPiecePhotoRow[], pieceId: string): ProjectPiecePhotoRow[] {
  return photos.filter((ph) => ph.piece_id === pieceId)
}

export type ProjectPieceClosureProgress = {
  totalPieces: number
  detalladoDone: number
  withPhoto: number
  missingDetalladoPieceIds: string[]
  missingPhotoPieceIds: string[]
}

/** Avance de cierre sobre **todas** las piezas del proyecto (no solo las ya en detallado). */
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

/** Programadora: solicitar revisión solo cuando todas las piezas terminaron detallado. */
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
