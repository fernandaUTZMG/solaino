/** Paleta pestaña Fotos / cierre de proyecto. */

export const fotosUi = {
  section: 'overflow-hidden rounded-2xl border-2 border-emerald-300/90 bg-white shadow-md ring-1 ring-emerald-900/[0.04]',
  header: 'border-b border-emerald-200/80 bg-gradient-to-r from-emerald-800 via-emerald-700 to-teal-800 px-5 py-5 sm:px-6',
  headerKicker: 'text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-100',
  headerTitle: 'text-[18px] font-bold text-white sm:text-[20px]',
  headerBody: 'mt-2 max-w-2xl text-[13px] leading-relaxed text-emerald-50/95',
  flowCard: 'rounded-xl border border-emerald-200/90 bg-gradient-to-br from-emerald-50/95 to-teal-50/40 p-4',
  flowTitle: 'text-[12px] font-bold uppercase tracking-wide text-emerald-950',
  flowText: 'text-[13px] leading-relaxed text-emerald-950/90',
  listSection: 'overflow-hidden rounded-2xl border border-emerald-200/90 bg-white shadow-sm',
  listHeader: 'border-b border-emerald-100 bg-emerald-50/80 px-4 py-3 sm:px-5',
  listSelected: 'bg-emerald-100 ring-2 ring-inset ring-emerald-500/70',
  listHover: 'hover:bg-emerald-50/90',
  panel: 'rounded-2xl border border-emerald-200/90 bg-white p-4 shadow-sm sm:p-5',
  uploadZone:
    'flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50/40 px-4 py-6 text-center transition hover:border-emerald-400 hover:bg-emerald-50/70',
  finalizeBox: 'rounded-2xl border-2 border-emerald-400/80 bg-gradient-to-br from-emerald-50 to-white p-5 shadow-sm sm:p-6',
  btnUpload: 'bg-emerald-700 text-white hover:bg-emerald-800',
  btnFinalize: 'bg-emerald-800 text-white hover:bg-emerald-900 shadow-md',
} as const
