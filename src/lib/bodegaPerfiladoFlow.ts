import { pieceAwaitingPostPerfiladoProgramming } from './bodegaPostPerfiladoProgramming'
import type { BodegaProjectPieceRow } from './bodegaPiecesRepo'

/** Origen de la pieza en cola de perfilado en taller (tras programación CNC/Torno). */
export function perfiladoOriginLabel(p: BodegaProjectPieceRow): string {
  if (p.programmer_bucket === 'perfilado') return 'Asignación Perfilado'
  if (p.programming_exit_kind === 'a_perfilado') {
    if (p.programmer_bucket === 'torno') return 'Torno → Perfilado'
    return 'CNC → Perfilado'
  }
  if (pieceAwaitingPostPerfiladoProgramming(p)) {
    return p.programmer_bucket === 'torno' ? 'Pend. Torno' : 'Pend. CNC'
  }
  return '—'
}

export function perfiladoOriginTone(p: BodegaProjectPieceRow): string {
  if (p.programmer_bucket === 'perfilado') return 'bg-teal-100 text-teal-900 border-teal-300'
  if (p.programmer_bucket === 'cnc') return 'bg-violet-100 text-violet-900 border-violet-200'
  if (p.programmer_bucket === 'torno') return 'bg-sky-100 text-sky-900 border-sky-200'
  return 'bg-teal-100 text-teal-900 border-teal-200'
}
