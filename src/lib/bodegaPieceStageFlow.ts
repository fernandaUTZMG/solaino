import type { BodegaProjectPieceRow } from './bodegaPiecesRepo'

/** Etiqueta de origen para colas de taller (CNC, Torno, Perfilado). */
export function pieceStageOriginLabel(p: BodegaProjectPieceRow): string {
  if (p.programmer_bucket === 'cnc') return 'CNC'
  if (p.programmer_bucket === 'torno') return 'Torno'
  if (p.programmer_bucket === 'perfilado') return 'Perfilado'
  if (p.programmer_bucket === 'accesorios') return 'Accesorios'
  return '—'
}

export function pieceStageOriginTone(p: BodegaProjectPieceRow): string {
  if (p.programmer_bucket === 'cnc') return 'bg-sky-100 text-section-navy border-sky-300'
  if (p.programmer_bucket === 'torno') return 'bg-slate-100 text-slate-800 border-slate-300'
  if (p.programmer_bucket === 'perfilado') return 'bg-slate-100 text-slate-700 border-slate-300'
  if (p.programmer_bucket === 'accesorios') return 'bg-slate-200 text-slate-900 border-slate-400'
  return 'bg-slate-100 text-slate-800 border-slate-200'
}

export type PieceStageWorkStatus = 'pendiente' | 'en_curso'

export function pieceStageWorkStatusLabel(status: PieceStageWorkStatus): string {
  return status === 'en_curso' ? 'En curso' : 'Pendiente'
}

export function pieceStageWorkStatusTone(status: PieceStageWorkStatus): string {
  return status === 'en_curso'
    ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
    : 'bg-slate-100 text-slate-700 border-slate-200'
}
