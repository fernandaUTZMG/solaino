/** Paleta amarillo / naranja para maquinado por pieza. */

export const maquinadoUi = {
  section: 'overflow-hidden rounded-2xl border-2 border-amber-300/90 bg-white shadow-md ring-1 ring-amber-900/[0.04]',
  header:
    'border-b border-amber-200/80 bg-gradient-to-r from-amber-700 via-orange-600 to-amber-800 px-5 py-5 sm:px-6',
  headerKicker: 'text-[11px] font-bold uppercase tracking-[0.14em] text-amber-100',
  headerTitle: 'text-[18px] font-bold text-white sm:text-[20px]',
  headerBody: 'mt-2 max-w-2xl text-[13px] leading-relaxed text-amber-50/95',
  statChip: 'rounded-lg bg-white/20 px-3 py-1.5 text-[12px] font-semibold text-white',
  statChipActive: 'rounded-lg bg-emerald-500/30 px-3 py-1.5 text-[12px] font-semibold text-emerald-50',
  statChipMuted: 'rounded-lg bg-white/12 px-3 py-1.5 text-[12px] text-amber-100',
  flowCard: 'rounded-xl border border-amber-200/90 bg-gradient-to-br from-amber-50/95 to-orange-50/40 p-4',
  flowTitle: 'text-[12px] font-bold uppercase tracking-wide text-amber-950',
  flowText: 'mt-2 text-[13px] leading-relaxed text-amber-950/90',
  filterActive: 'bg-orange-600 text-white shadow-sm',
  filterIdle: 'border border-amber-200 bg-white text-amber-950 hover:bg-amber-50',
  listSection: 'overflow-hidden rounded-2xl border border-amber-200/90 bg-white shadow-sm ring-1 ring-amber-900/[0.03]',
  listHeader: 'border-b border-amber-100 bg-amber-50/80 px-4 py-3 sm:px-5',
  listSelected: 'bg-amber-100 ring-2 ring-inset ring-orange-400/80',
  listHover: 'hover:bg-amber-50/90',
  empty: 'rounded-2xl border border-dashed border-amber-300 bg-amber-50/60 px-6 py-14 text-center',
  panel: 'overflow-hidden rounded-2xl border border-amber-300/80 bg-gradient-to-br from-amber-50/95 to-white shadow-sm ring-1 ring-amber-900/[0.05]',
  panelHeader: 'border-b border-amber-200/80 bg-gradient-to-r from-amber-800 to-orange-700 px-5 py-4 sm:px-6',
  panelKicker: 'text-[11px] font-bold uppercase tracking-[0.14em] text-amber-100',
  panelTitle: 'mt-1 text-[17px] font-bold leading-snug text-white',
  stepCurrent: 'border-amber-400 bg-amber-50/90',
  stepBadgeDone: 'bg-orange-600 text-white',
  stepBadgeCurrent: 'bg-amber-200 text-amber-950 ring-2 ring-orange-500',
  btnStart: 'bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-md hover:from-amber-700 hover:to-orange-700',
  btnArmado: 'bg-gradient-to-r from-amber-800 to-orange-800 text-white shadow-md hover:from-amber-900 hover:to-orange-900',
  btnDetallado: 'bg-gradient-to-r from-amber-800 to-orange-800 text-white shadow-md hover:from-amber-900 hover:to-orange-900',
  docBtn: 'border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100',
} as const

export function maquinadoOriginBadge(bucket: 'cnc' | 'torno' | null): string {
  if (bucket === 'cnc') return 'bg-amber-200 text-amber-950 border-amber-400'
  if (bucket === 'torno') return 'bg-orange-200 text-orange-950 border-orange-400'
  return 'bg-slate-100 text-slate-800 border-slate-200'
}

export function maquinadoStatusBadge(active: boolean): string {
  return active
    ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
    : 'bg-amber-100 text-amber-900 border-amber-300'
}
