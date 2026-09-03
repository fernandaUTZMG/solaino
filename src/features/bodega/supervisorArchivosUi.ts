/** Estilos vista Bodega → Archivos (referencia supervisor para diseñadora). */
export const archivosUi = {
  page: 'space-y-6',
  hero:
    'overflow-hidden rounded-2xl border border-blue-950/30 bg-gradient-to-br from-section-navy via-[#0a2848] to-[#123d6b] shadow-lg shadow-blue-950/25',
  heroBody: 'relative px-5 py-6 sm:px-8 sm:py-8',
  heroKicker: 'text-[11px] font-bold uppercase tracking-[0.16em] text-sky-300/90',
  heroTitle: 'mt-1 text-2xl font-bold tracking-tight text-white sm:text-[1.65rem]',
  heroText: 'mt-3 max-w-2xl text-[13px] leading-relaxed text-sky-100/90 sm:text-[14px]',
  flowStrip:
    'mt-5 grid gap-2 rounded-xl border border-white/10 bg-white/5 p-3 sm:grid-cols-3 sm:gap-3 sm:p-4',
  flowStep: 'flex gap-2.5 rounded-lg bg-white/5 px-3 py-2.5',
  flowNum:
    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-400/90 text-[12px] font-black text-section-navy',
  flowStepTitle: 'text-[12px] font-bold text-white',
  flowStepDesc: 'text-[11px] leading-snug text-sky-100/75',
  mainGrid: 'grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-start',
  explorerCard:
    'overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm ring-1 ring-slate-900/[0.03]',
  explorerHead: 'border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-4 py-4 sm:px-5',
  explorerTitle: 'text-[13px] font-bold text-slate-900',
  explorerSub: 'mt-0.5 text-[12px] text-slate-600',
  searchInput:
    'mt-3 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[13px] text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-2 focus:ring-sky-300/35',
  statsRow: 'mt-3 flex flex-wrap gap-2',
  statPill: 'inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700',
  listScroll: 'max-h-[min(62vh,640px)] overflow-y-auto p-3 sm:p-4',
  ocGroup: 'mb-4 last:mb-0 overflow-hidden rounded-xl border border-slate-200/90 shadow-sm',
  ocHeaderBtn:
    'flex w-full items-start gap-2 border-b border-slate-200/80 bg-gradient-to-r from-slate-100/90 via-white to-sky-50/40 py-3.5 pl-4 pr-2 transition hover:from-sky-50/60 sm:pl-4',
  ocHeaderOpen: 'border-sky-200/80 bg-gradient-to-r from-sky-50/90 via-white to-white',
  ocChevron: 'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200/80 bg-white text-slate-600',
  ocBadge:
    'inline-flex items-center rounded-md bg-section-navy px-2 py-0.5 font-mono text-[11px] font-bold text-white',
  ocCount:
    'ml-auto shrink-0 rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] font-bold tabular-nums text-slate-700',
  ocBody: 'space-y-2 bg-slate-50/50 p-2.5 sm:p-3',
  projectCard:
    'flex w-full flex-col gap-2 rounded-xl border bg-white text-left shadow-sm transition sm:flex-row sm:items-stretch',
  projectCardSel: 'border-sky-400 bg-sky-50/80 ring-2 ring-sky-400/50 shadow-md',
  projectCardIdle: 'border-slate-200/90 hover:border-slate-300 hover:shadow',
  projectCardPrior: 'ring-1 ring-rose-200/80',
  projectMain: 'min-w-0 flex-1 p-3.5 sm:p-4',
  uploadCard:
    'overflow-hidden rounded-2xl border-2 border-sky-200/90 bg-gradient-to-b from-sky-50/80 to-white shadow-md ring-1 ring-sky-900/[0.04] lg:sticky lg:top-4',
  uploadHead: 'border-b border-sky-100 bg-sky-600 px-4 py-4 text-white sm:px-5',
  uploadBody: 'space-y-4 p-4 sm:p-5',
  uploadZone:
    'flex min-h-[120px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-sky-300/80 bg-white/80 px-4 py-6 text-center',
  btnPrimary:
    'inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-xl bg-section-navy px-5 py-2.5 text-[13px] font-bold text-white shadow-md transition hover:brightness-110',
  btnPrimaryDisabled: 'cursor-not-allowed bg-slate-300 shadow-none',
  selectedSummary: 'rounded-xl border border-sky-200/80 bg-white p-3.5 shadow-sm',
} as const
