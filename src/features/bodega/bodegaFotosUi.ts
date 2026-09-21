/** Paleta sobria Fotos / cierre: slate / navy (alineada con el resto de Bodega). */

export const fotosUi = {
  section:
    'overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-900/[0.03]',
  header:
    'border-b border-slate-200 bg-gradient-to-br from-section-navy via-[#0a2848] to-[#123d6b] px-5 py-5 sm:px-6',
  headerKicker: 'text-[11px] font-bold uppercase tracking-[0.14em] text-sky-300/90',
  headerTitle: 'text-[18px] font-bold tracking-tight text-white sm:text-[20px]',
  headerBody: 'mt-2 max-w-2xl text-[13px] leading-relaxed text-sky-100/90',
  flowCard: 'rounded-xl border border-slate-200 bg-slate-50 p-4',
  flowTitle: 'text-[12px] font-bold uppercase tracking-wide text-section-navy',
  flowText: 'text-[13px] leading-relaxed text-slate-700',
  listSection:
    'overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-900/[0.03]',
  listHeader: 'border-b border-slate-100 bg-slate-50 px-4 py-3 sm:px-5',
  listSelected: 'bg-sky-50 ring-2 ring-inset ring-section-navy/30',
  listHover: 'hover:bg-slate-50',
  panel:
    'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ring-1 ring-slate-900/[0.03] sm:p-5',
  uploadZone:
    'flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center transition hover:border-section-navy/40 hover:bg-sky-50/60',
  finalizeBox:
    'rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-sm ring-1 ring-slate-900/[0.03] sm:p-6',
  btnUpload: 'bg-section-navy text-white hover:brightness-110',
  btnFinalize: 'bg-slate-800 text-white shadow-sm hover:bg-slate-900',
} as const
