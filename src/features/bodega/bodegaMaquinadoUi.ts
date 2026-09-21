/** Paleta sobria maquinado: slate / navy (alineada con Diseño y Programación). */

export const maquinadoUi = {
  section:
    'overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-900/[0.03]',
  header:
    'border-b border-slate-200 bg-gradient-to-br from-section-navy via-[#0a2848] to-[#123d6b] px-5 py-5 sm:px-6',
  headerKicker: 'text-[11px] font-bold uppercase tracking-[0.14em] text-sky-300/90',
  headerTitle: 'text-[18px] font-bold tracking-tight text-white sm:text-[20px]',
  headerBody: 'mt-2 max-w-2xl text-[13px] leading-relaxed text-sky-100/90',
  statChip: 'rounded-lg bg-white/15 px-3 py-1.5 text-[12px] font-semibold text-white',
  statChipActive: 'rounded-lg bg-emerald-500/25 px-3 py-1.5 text-[12px] font-semibold text-emerald-100',
  statChipMuted: 'rounded-lg bg-white/10 px-3 py-1.5 text-[12px] text-sky-100/85',
  flowCard: 'rounded-xl border border-slate-200 bg-slate-50 p-4',
  flowTitle: 'text-[12px] font-bold uppercase tracking-wide text-section-navy',
  flowText: 'mt-2 text-[13px] leading-relaxed text-slate-700',
  filterActive: 'bg-section-navy text-white shadow-sm',
  filterIdle: 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
  listSection:
    'overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-900/[0.03]',
  listHeader: 'border-b border-slate-100 bg-slate-50 px-4 py-3 sm:px-5',
  listSelected: 'bg-sky-50 ring-2 ring-inset ring-section-navy/30',
  listHover: 'hover:bg-slate-50',
  empty: 'rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-14 text-center',
  panel:
    'overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-900/[0.03]',
  panelHeader:
    'border-b border-slate-200 bg-gradient-to-r from-slate-800 to-section-navy px-5 py-4 sm:px-6',
  panelKicker: 'text-[11px] font-bold uppercase tracking-[0.14em] text-sky-200/90',
  panelTitle: 'mt-1 text-[17px] font-bold leading-snug text-white',
  stepCurrent: 'border-sky-300 bg-sky-50/90',
  stepBadgeDone: 'bg-section-navy text-white',
  stepBadgeCurrent: 'bg-sky-200 text-section-navy ring-2 ring-section-navy/40',
  btnStart: 'bg-section-navy text-white shadow-sm hover:brightness-110',
  btnArmado: 'bg-slate-800 text-white shadow-sm hover:bg-slate-900',
  btnDetallado: 'border-2 border-slate-300 bg-white text-slate-900 shadow-sm hover:bg-slate-50',
  docBtn: 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50',
} as const

export function maquinadoOriginBadge(bucket: 'cnc' | 'torno' | null): string {
  if (bucket === 'cnc') return 'bg-sky-100 text-section-navy border-sky-300'
  if (bucket === 'torno') return 'bg-slate-100 text-slate-800 border-slate-300'
  return 'bg-slate-100 text-slate-800 border-slate-200'
}

export function maquinadoStatusBadge(active: boolean): string {
  return active
    ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
    : 'bg-slate-100 text-slate-700 border-slate-300'
}
