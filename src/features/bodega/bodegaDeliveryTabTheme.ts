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
      'overflow-hidden rounded-2xl border-2 border-pink-400/90 bg-white shadow-md shadow-pink-100/50 ring-2 ring-pink-200/60',
    header: 'border-b-2 border-pink-300/80 bg-gradient-to-r from-pink-300/90 via-pink-200/95 to-pink-100 px-4 py-2.5 sm:px-5',
    headerTitle: 'text-[13px] font-bold text-pink-950',
    headerSubtitle: 'text-[12px] font-medium text-pink-900/90',
    avanceBox:
      'rounded-xl border-2 border-pink-300/80 bg-gradient-to-br from-pink-100/95 via-pink-50 to-white p-4 sm:p-5',
    saveButton: 'bg-gradient-to-r from-pink-600 to-pink-700 shadow-pink-400/40 hover:from-pink-700 hover:to-pink-800',
    inputFocus: 'focus:border-pink-500 focus:ring-pink-400/45',
    textareaFocus: 'focus:border-pink-500 focus:ring-pink-400/40',
    historialButton:
      'border-pink-400 bg-pink-100 text-pink-950 hover:bg-pink-200/80 focus-visible:ring-pink-500/50',
    historialButtonOpen:
      'border-pink-500 bg-pink-200 text-pink-950 ring-2 ring-pink-400/70 shadow-sm shadow-pink-200/50',
    historialList: 'border-pink-200',
    historialHover: 'hover:bg-pink-100/90',
    historialBadge: 'border-pink-300 bg-pink-100 text-pink-950',
  },
  maquinado: {
    section: 'overflow-hidden rounded-2xl border-2 border-amber-300 bg-white shadow-sm',
    header: 'border-b border-amber-100 bg-gradient-to-r from-amber-50/95 to-orange-50/40 px-5 py-3.5 sm:px-6',
    headerTitle: 'text-[11px] font-bold uppercase tracking-[0.12em] text-amber-900/90',
    headerSubtitle: 'mt-1 text-[13px] leading-relaxed text-amber-950/85',
    avanceBox: 'rounded-xl border border-amber-200/80 bg-gradient-to-br from-amber-50/95 to-white p-4 sm:p-5',
    saveButton: 'bg-orange-700 shadow-orange-900/20 hover:bg-orange-800',
    inputFocus: 'focus:border-amber-400 focus:ring-amber-300/40',
    textareaFocus: 'focus:border-amber-400 focus:ring-amber-300/30',
    historialButton:
      'border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100 focus-visible:ring-amber-400/50',
    historialButtonOpen: 'border-amber-400 bg-amber-100 text-amber-950 ring-2 ring-amber-300/60',
    historialList: 'border-amber-100',
    historialHover: 'hover:bg-amber-50/80',
    historialBadge: 'border-amber-200 bg-amber-50 text-amber-900',
    moduleTabInactive: 'text-amber-950/90 hover:bg-amber-100/80',
    moduleTabRing: 'ring-amber-200/70',
  },
  taller: {
    section: 'overflow-hidden rounded-2xl border-2 border-teal-300 bg-white shadow-sm',
    header: 'border-b border-teal-100 bg-gradient-to-r from-teal-50/95 to-white px-5 py-3.5 sm:px-6',
    headerTitle: 'text-[11px] font-bold uppercase tracking-[0.12em] text-teal-800/90',
    headerSubtitle: 'mt-1 text-[13px] leading-relaxed text-teal-900/85',
    avanceBox: 'rounded-xl border border-teal-200/80 bg-gradient-to-br from-teal-50/95 to-white p-4 sm:p-5',
    saveButton: 'bg-teal-700 shadow-teal-900/20 hover:bg-teal-800',
    inputFocus: 'focus:border-teal-400 focus:ring-teal-300/40',
    textareaFocus: 'focus:border-teal-400 focus:ring-teal-300/30',
    historialButton:
      'border-teal-300 bg-teal-50 text-teal-950 hover:bg-teal-100 focus-visible:ring-teal-400/50',
    historialButtonOpen: 'border-teal-400 bg-teal-100 text-teal-950 ring-2 ring-teal-300/60',
    historialList: 'border-teal-100',
    historialHover: 'hover:bg-teal-50/80',
    historialBadge: 'border-teal-200 bg-teal-50 text-teal-900',
    moduleTabInactive: 'text-teal-950/90 hover:bg-teal-100/80',
    moduleTabRing: 'ring-teal-200/70',
  },
  cnc: {
    section: 'overflow-hidden rounded-2xl border-2 border-programacion-300 bg-white shadow-sm',
    header: 'border-b border-programacion-100 bg-gradient-to-r from-programacion-100/95 to-programacion-50/80 px-5 py-3.5 sm:px-6',
    headerTitle: 'text-[11px] font-bold uppercase tracking-[0.12em] text-programacion-800/90',
    headerSubtitle: 'mt-1 text-[13px] leading-relaxed text-programacion-900/85',
    avanceBox: 'rounded-xl border border-programacion-200/80 bg-gradient-to-br from-programacion-50/95 to-white p-4 sm:p-5',
    saveButton: 'bg-programacion-600 shadow-programacion-900/20 hover:bg-programacion-700',
    inputFocus: 'focus:border-programacion-400 focus:ring-programacion-300/40',
    textareaFocus: 'focus:border-programacion-400 focus:ring-programacion-300/30',
    historialButton:
      'border-programacion-300 bg-programacion-50 text-programacion-950 hover:bg-programacion-100 focus-visible:ring-programacion-400/50',
    historialButtonOpen: 'border-programacion-400 bg-programacion-100 text-programacion-950 ring-2 ring-programacion-300/60',
    historialList: 'border-programacion-100',
    historialHover: 'hover:bg-programacion-50/80',
    historialBadge: 'border-programacion-200 bg-programacion-50 text-programacion-900',
    introBanner: 'rounded-2xl border border-programacion-200/70 bg-programacion-50/50 p-3 shadow-sm sm:p-4',
    moduleTabActiveCnc: 'bg-programacion-600 text-white shadow-sm',
    moduleTabActiveTorno: 'bg-programacion-700 text-white shadow-sm',
    moduleTabActivePerfilado: 'bg-programacion-800 text-white shadow-sm',
    moduleTabInactive: 'text-programacion-950/90 hover:bg-programacion-100/80',
    moduleTabRing: 'ring-programacion-200/70',
  },
  fotos: {
    section: 'overflow-hidden rounded-2xl border-2 border-emerald-300 bg-white shadow-sm',
    header: 'border-b border-emerald-100 bg-gradient-to-r from-emerald-50/95 to-white px-5 py-3.5 sm:px-6',
    headerTitle: 'text-[11px] font-bold uppercase tracking-[0.12em] text-emerald-800/90',
    headerSubtitle: 'mt-1 text-[13px] leading-relaxed text-emerald-900/85',
    avanceBox: 'rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/95 to-white p-4 sm:p-5',
    saveButton: 'bg-emerald-700 shadow-emerald-900/20 hover:bg-emerald-800',
    inputFocus: 'focus:border-emerald-400 focus:ring-emerald-300/40',
    textareaFocus: 'focus:border-emerald-400 focus:ring-emerald-300/30',
    historialButton:
      'border-emerald-300 bg-emerald-50 text-emerald-950 hover:bg-emerald-100 focus-visible:ring-emerald-400/50',
    historialButtonOpen: 'border-emerald-400 bg-emerald-100 text-emerald-950 ring-2 ring-emerald-300/60',
    historialList: 'border-emerald-100',
    historialHover: 'hover:bg-emerald-50/80',
    historialBadge: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    moduleTabInactive: 'text-emerald-950/90 hover:bg-emerald-100/80',
    moduleTabRing: 'ring-emerald-200/70',
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
