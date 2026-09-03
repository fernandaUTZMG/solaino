import type { BodegaPieceIntervalRow } from './bodegaPieceIntervalsRepo'
import { pieceDesignApproved } from './bodegaDesignPieceReview'
import { pieceAwaitingPostPerfiladoProgramming } from './bodegaPostPerfiladoProgramming'
import type { BodegaProjectPieceRow } from './bodegaPiecesRepo'
import type { CncModuleKind } from './machineVersionsRepo'
import { isPerfiladoPdfZipPath, isSwPartZipPath } from './zipDesignPackage'

/** Piezas con diseño aprobado (excluye pendientes de corrección). */
export function programmingEligiblePieces(pieces: BodegaProjectPieceRow[]): BodegaProjectPieceRow[] {
  return pieces.filter((p) => pieceDesignApproved(p))
}

/** Piezas .PRT/.SLCPRT asignadas a un módulo CNC oficina. */
export function piecesForCncModule(
  pieces: BodegaProjectPieceRow[],
  module: 'programacion' | 'torno',
): BodegaProjectPieceRow[] {
  const bucket = module === 'programacion' ? 'cnc' : 'torno'
  return programmingEligiblePieces(pieces)
    .filter((p) => p.programmer_bucket === bucket)
    .sort((a, b) => a.label.localeCompare(b.label, 'es'))
}

export function piecesForPerfiladoBucket(pieces: BodegaProjectPieceRow[]): BodegaProjectPieceRow[] {
  return programmingEligiblePieces(pieces)
    .filter((p) => p.programmer_bucket === 'perfilado')
    .sort((a, b) => a.label.localeCompare(b.label, 'es'))
}

/** Piezas marcadas como accesorio: sin proceso CNC/Torno/Perfilado. */
export function piecesForAccesoriosBucket(pieces: BodegaProjectPieceRow[]): BodegaProjectPieceRow[] {
  return programmingEligiblePieces(pieces)
    .filter((p) => p.programmer_bucket === 'accesorios')
    .sort((a, b) => a.label.localeCompare(b.label, 'es'))
}

export function pieceAssignedToAccesorios(p: BodegaProjectPieceRow): boolean {
  return p.programmer_bucket === 'accesorios'
}

export function cncModuleForPiece(p: BodegaProjectPieceRow): 'programacion' | 'torno' | null {
  if (p.programmer_bucket === 'cnc') return 'programacion'
  if (p.programmer_bucket === 'torno') return 'torno'
  return null
}

/** Pieza asignada a Perfilado en paso 4: sin programación CNC/Torno, va a taller perfilado. */
export function pieceAssignedToPerfiladoColumn(p: BodegaProjectPieceRow): boolean {
  return p.programmer_bucket === 'perfilado'
}

/** @deprecated Usar pieceAssignedToPerfiladoColumn */
export function pieceSkipsProgrammingGoesToMaquinado(p: BodegaProjectPieceRow): boolean {
  return pieceAssignedToPerfiladoColumn(p)
}

/** Todas las piezas de producción tienen destino CNC, Torno, Perfilado o Accesorios. */
export function isSwPartsAssignmentComplete(
  pieces: BodegaProjectPieceRow[],
  _designZipPaths?: string[],
): boolean {
  const eligible = programmingEligiblePieces(pieces).filter(
    (p) => p.source_path && isSwPartZipPath(p.source_path),
  )
  if (eligible.length === 0) return false
  return eligible.every(
    (p) =>
      p.programmer_bucket === 'cnc' ||
      p.programmer_bucket === 'torno' ||
      p.programmer_bucket === 'perfilado' ||
      p.programmer_bucket === 'accesorios',
  )
}

export function programmerCncModulesWithPieces(
  pieces: BodegaProjectPieceRow[],
): Array<'programacion' | 'torno'> {
  const out: Array<'programacion' | 'torno'> = []
  if (piecesForCncModule(pieces, 'programacion').length > 0) out.push('programacion')
  if (piecesForCncModule(pieces, 'torno').length > 0) out.push('torno')
  return out
}

export function pieceLaneForModule(module: 'programacion' | 'torno'): 'programacion_cnc' | 'programacion_torno' {
  return module === 'programacion' ? 'programacion_cnc' : 'programacion_torno'
}

export function workIntervalLaneForCncModule(module: CncModuleKind): 'cnc_programacion' | 'cnc_torno' | 'cnc_perfilado' {
  if (module === 'torno') return 'cnc_torno'
  if (module === 'perfilado') return 'cnc_perfilado'
  return 'cnc_programacion'
}

export function isMachiningPiece(p: BodegaProjectPieceRow): boolean {
  if (pieceAssignedToPerfiladoColumn(p) || pieceAssignedToAccesorios(p)) return false
  return Boolean(
    p.source_path && !isPerfiladoPdfZipPath(p.source_path) && (p.programmer_bucket === 'cnc' || p.programmer_bucket === 'torno'),
  )
}

/** Motivo por el que no se puede cambiar CNC ↔ Torno (null = sí se puede). */
export function reassignProgrammerCncTornoBlockedReason(
  p: BodegaProjectPieceRow,
  intervals?: BodegaPieceIntervalRow[],
): string | null {
  if (p.programmer_bucket !== 'cnc' && p.programmer_bucket !== 'torno') return null
  if (p.maquinado_completed_at) return 'La pieza ya terminó maquinado.'
  if (p.perfilado_completed_at && !pieceAwaitingPostPerfiladoProgramming(p)) {
    return 'La pieza ya terminó perfilado en taller.'
  }
  if (p.armado_completed_at || p.detallado_completed_at) return 'La pieza ya avanzó en armado o detallado.'
  if (p.programming_exit_kind === 'a_perfilado' && !pieceAwaitingPostPerfiladoProgramming(p)) {
    return 'Se envió a perfilado; no aplica cambiar entre CNC y Torno.'
  }
  if (intervals) {
    for (const r of intervals) {
      if (r.piece_id !== p.id || r.ended_at) continue
      if (r.lane === 'programacion_cnc' || r.lane === 'programacion_torno') {
        return 'Detén el tiempo de programación antes de cambiar el destino.'
      }
      if (r.lane === 'maquinado') return 'Maquinado en curso; no se puede cambiar el destino.'
    }
  }
  return null
}

export function canReassignProgrammerCncTorno(
  p: BodegaProjectPieceRow,
  intervals?: BodegaPieceIntervalRow[],
): boolean {
  if (p.programmer_bucket !== 'cnc' && p.programmer_bucket !== 'torno') return false
  return reassignProgrammerCncTornoBlockedReason(p, intervals) === null
}
