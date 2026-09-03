import type { BodegaProjectPieceRow, PostMaquinadoRoute } from './bodegaPiecesRepo'

export function maquinadoOriginLabel(p: BodegaProjectPieceRow): string {
  if (p.programmer_bucket === 'cnc') return 'CNC'
  if (p.programmer_bucket === 'torno') return 'Torno'
  if (p.programmer_bucket === 'perfilado') return 'Perfilado'
  return '—'
}

export function maquinadoOriginTone(p: BodegaProjectPieceRow): string {
  if (p.programmer_bucket === 'cnc') return 'bg-amber-200 text-amber-950 border-amber-400'
  if (p.programmer_bucket === 'torno') return 'bg-orange-200 text-orange-950 border-orange-400'
  if (p.programmer_bucket === 'perfilado') return 'bg-teal-100 text-teal-950 border-teal-300'
  return 'bg-slate-100 text-slate-800 border-slate-200'
}

export function postMaquinadoRouteLabelEs(route: PostMaquinadoRoute | null | undefined): string {
  if (route === 'detallado') return 'Detallado'
  return 'Armado'
}

export type MaquinadoPieceUiStatus = 'pendiente' | 'en_curso'

export function maquinadoPieceUiStatus(active: boolean): MaquinadoPieceUiStatus {
  return active ? 'en_curso' : 'pendiente'
}

export function maquinadoPieceStatusLabel(status: MaquinadoPieceUiStatus): string {
  return status === 'en_curso' ? 'Maquinando' : 'Pendiente'
}

export function maquinadoPieceStatusTone(status: MaquinadoPieceUiStatus): string {
  return status === 'en_curso'
    ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
    : 'bg-amber-100 text-amber-900 border-amber-300'
}
