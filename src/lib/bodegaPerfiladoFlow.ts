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
  if (p.programmer_bucket === 'perfilado') return 'bg-slate-100 text-slate-800 border-slate-300'
  if (p.programmer_bucket === 'cnc') return 'bg-sky-100 text-section-navy border-sky-300'
  if (p.programmer_bucket === 'torno') return 'bg-slate-100 text-slate-700 border-slate-300'
  return 'bg-slate-100 text-slate-800 border-slate-200'
}
