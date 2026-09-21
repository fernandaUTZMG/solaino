/** Pestañas del modal de entregas (compartido con BodegaPage). */
export type BodegaDeliveryTabId = 'diseno' | 'cnc' | 'maquinado' | 'taller' | 'fotos' | 'piezas'

export type DeliveryTabTheme = {
  section: string
  header: string
  headerTitle: string
  headerSubtitle: string
  avanceBox: string
  saveButton: string
  inputFocus: string
  textareaFocus: string
  historialButton: string
  historialButtonOpen: string
  historialList: string
  historialHover: string
  historialBadge: string
  introBanner?: string
  moduleTabActiveCnc?: string
  moduleTabActiveTorno?: string
  moduleTabActivePerfilado?: string
  moduleTabInactive?: string
  moduleTabRing?: string
}

const THEMES: Record<BodegaDeliveryTabId, DeliveryTabTheme> = {
  diseno: {
    section:
      'overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm ring-1 ring-slate-900/[0.04]',
    header: 'border-b border-slate-200 bg-gradient-to-r from-slate-100 to-white px-4 py-2.5 sm:px-5',
    headerTitle: 'text-[13px] font-bold text-section-navy',
    headerSubtitle: 'text-[12px] font-medium text-slate-600',
    avanceBox:
      'rounded-xl border border-slate-300 bg-slate-50 p-4 sm:p-5',
    saveButton: 'bg-section-navy shadow-md hover:brightness-110',
    inputFocus: 'focus:border-blue-900/40 focus:ring-blue-900/20',
    textareaFocus: 'focus:border-blue-900/40 focus:ring-blue-900/20',
    historialButton:
      'border-slate-200 bg-white text-slate-800 hover:bg-slate-50 focus-visible:ring-blue-900/30',
    historialButtonOpen:
      'border-slate-300 bg-slate-100 text-slate-900 ring-1 ring-slate-300',
    historialList: 'border-slate-200',
    historialHover: 'hover:bg-slate-50',
    historialBadge: 'border-slate-200 bg-slate-50 text-slate-800',
  },
  maquinado: {
    section:
      'overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-900/[0.03]',
    header: 'border-b border-slate-200 bg-gradient-to-r from-slate-100 to-white px-5 py-3.5 sm:px-6',
    headerTitle: 'text-[11px] font-bold uppercase tracking-[0.12em] text-section-navy',
    headerSubtitle: 'mt-1 text-[13px] leading-relaxed text-slate-600',
    avanceBox: 'rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5',
    saveButton: 'bg-section-navy shadow-sm hover:brightness-110',
    inputFocus: 'focus:border-section-navy/40 focus:ring-section-navy/20',
    textareaFocus: 'focus:border-section-navy/40 focus:ring-section-navy/20',
    historialButton:
      'border-slate-200 bg-white text-slate-800 hover:bg-slate-50 focus-visible:ring-section-navy/30',
    historialButtonOpen: 'border-slate-300 bg-slate-100 text-slate-900 ring-1 ring-slate-300',
    historialList: 'border-slate-200',
    historialHover: 'hover:bg-slate-50',
    historialBadge: 'border-slate-200 bg-slate-50 text-slate-800',
    moduleTabInactive: 'text-slate-700 hover:bg-slate-100',
    moduleTabRing: 'ring-slate-200',
  },
  taller: {
    section:
      'overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-900/[0.03]',
    header: 'border-b border-slate-200 bg-gradient-to-r from-slate-100 to-white px-5 py-3.5 sm:px-6',
    headerTitle: 'text-[11px] font-bold uppercase tracking-[0.12em] text-section-navy',
    headerSubtitle: 'mt-1 text-[13px] leading-relaxed text-slate-600',
    avanceBox: 'rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5',
    saveButton: 'bg-section-navy shadow-sm hover:brightness-110',
    inputFocus: 'focus:border-section-navy/40 focus:ring-section-navy/20',
    textareaFocus: 'focus:border-section-navy/40 focus:ring-section-navy/20',
    historialButton:
      'border-slate-200 bg-white text-slate-800 hover:bg-slate-50 focus-visible:ring-section-navy/30',
    historialButtonOpen: 'border-slate-300 bg-slate-100 text-slate-900 ring-1 ring-slate-300',
    historialList: 'border-slate-200',
    historialHover: 'hover:bg-slate-50',
    historialBadge: 'border-slate-200 bg-slate-50 text-slate-800',
    moduleTabInactive: 'text-slate-700 hover:bg-slate-100',
    moduleTabRing: 'ring-slate-200',
  },
  cnc: {
    section:
      'overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm ring-1 ring-slate-900/[0.04]',
    header: 'border-b border-slate-200 bg-gradient-to-r from-slate-100 to-white px-4 py-2.5 sm:px-5',
    headerTitle: 'text-[13px] font-bold text-section-navy',
    headerSubtitle: 'text-[12px] font-medium text-slate-600',
    avanceBox:
      'rounded-xl border border-slate-300 bg-slate-50 p-4 sm:p-5',
    saveButton: 'bg-section-navy shadow-md hover:brightness-110',
    inputFocus: 'focus:border-blue-900/40 focus:ring-blue-900/20',
    textareaFocus: 'focus:border-blue-900/40 focus:ring-blue-900/20',
    historialButton:
      'border-slate-200 bg-white text-slate-800 hover:bg-slate-50 focus-visible:ring-blue-900/30',
    historialButtonOpen:
      'border-slate-300 bg-slate-100 text-slate-900 ring-1 ring-slate-300',
    historialList: 'border-slate-200',
    historialHover: 'hover:bg-slate-50',
    historialBadge: 'border-slate-200 bg-slate-50 text-slate-800',
    introBanner: 'rounded-2xl border border-slate-200 bg-slate-50 p-3 shadow-sm sm:p-4',
    moduleTabActiveCnc: 'bg-section-navy text-white shadow-sm',
    moduleTabActiveTorno: 'bg-slate-800 text-white shadow-sm',
    moduleTabActivePerfilado: 'bg-sky-800 text-white shadow-sm',
    moduleTabInactive: 'text-slate-800 hover:bg-slate-100',
    moduleTabRing: 'ring-slate-200',
  },
  fotos: {
    section:
      'overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-900/[0.03]',
    header: 'border-b border-slate-200 bg-gradient-to-r from-slate-100 to-white px-5 py-3.5 sm:px-6',
    headerTitle: 'text-[11px] font-bold uppercase tracking-[0.12em] text-section-navy',
    headerSubtitle: 'mt-1 text-[13px] leading-relaxed text-slate-600',
    avanceBox: 'rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5',
    saveButton: 'bg-section-navy shadow-sm hover:brightness-110',
    inputFocus: 'focus:border-section-navy/40 focus:ring-section-navy/20',
    textareaFocus: 'focus:border-section-navy/40 focus:ring-section-navy/20',
    historialButton:
      'border-slate-200 bg-white text-slate-800 hover:bg-slate-50 focus-visible:ring-section-navy/30',
    historialButtonOpen: 'border-slate-300 bg-slate-100 text-slate-900 ring-1 ring-slate-300',
    historialList: 'border-slate-200',
    historialHover: 'hover:bg-slate-50',
    historialBadge: 'border-slate-200 bg-slate-50 text-slate-800',
    moduleTabInactive: 'text-slate-700 hover:bg-slate-100',
    moduleTabRing: 'ring-slate-200',
  },
  piezas: {
    section: 'overflow-hidden rounded-2xl border-2 border-violet-300 bg-white shadow-sm',
    header: 'border-b border-violet-100 bg-gradient-to-r from-violet-50/95 to-white px-5 py-3.5 sm:px-6',
    headerTitle: 'text-[11px] font-bold uppercase tracking-[0.12em] text-violet-800/90',
    headerSubtitle: 'mt-1 text-[13px] leading-relaxed text-violet-900/85',
    avanceBox: 'rounded-xl border border-violet-200/80 bg-gradient-to-br from-violet-50/95 to-white p-4 sm:p-5',
    saveButton: 'bg-violet-700 shadow-violet-900/20 hover:bg-violet-800',
    inputFocus: 'focus:border-violet-400 focus:ring-violet-300/40',
    textareaFocus: 'focus:border-violet-400 focus:ring-violet-300/30',
    historialButton:
      'border-violet-300 bg-violet-50 text-violet-950 hover:bg-violet-100 focus-visible:ring-violet-400/50',
    historialButtonOpen: 'border-violet-400 bg-violet-100 text-violet-950 ring-2 ring-violet-300/60',
    historialList: 'border-violet-100',
    historialHover: 'hover:bg-violet-50/80',
    historialBadge: 'border-violet-200 bg-violet-50 text-violet-900',
    moduleTabInactive: 'text-violet-950/90 hover:bg-violet-100/80',
    moduleTabRing: 'ring-violet-200/70',
  },
}

export function deliveryTabTheme(tab: BodegaDeliveryTabId): DeliveryTabTheme {
  return THEMES[tab]
}
