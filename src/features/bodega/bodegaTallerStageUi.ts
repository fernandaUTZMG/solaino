import type { PieceStageMarker } from '../../lib/bodegaPiecesRepo'

export type TallerStageKind = Extract<PieceStageMarker, 'armado' | 'detallado'>

type StageUi = {
  section: string
  header: string
  headerKicker: string
  headerTitle: string
  headerBody: string
  statChip: string
  statChipActive: string
  statChipMuted: string
  flowCard: string
  flowTitle: string
  flowText: string
  filterActive: string
  filterIdle: string
  listSection: string
  listHeader: string
  listSelected: string
  listHover: string
  empty: string
  panel: string
  panelHeader: string
  panelKicker: string
  panelTitle: string
  stepCurrent: string
  stepBadgeDone: string
  stepBadgeCurrent: string
  btnStart: string
  btnFinish: string
  docBtn: string
}

const armado: StageUi = {
  section: 'rounded-2xl border-2 border-emerald-300/90 bg-white shadow-md ring-1 ring-emerald-900/[0.04]',
  header: 'border-b border-emerald-200/80 bg-gradient-to-r from-emerald-800 via-emerald-700 to-teal-800 px-5 py-5 sm:px-6',
  headerKicker: 'text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-100',
  headerTitle: 'text-[18px] font-bold text-white sm:text-[20px]',
  headerBody: 'mt-2 max-w-2xl text-[13px] leading-relaxed text-emerald-50/95',
  statChip: 'rounded-lg bg-white/20 px-3 py-1.5 text-[12px] font-semibold text-white',
  statChipActive: 'rounded-lg bg-emerald-400/35 px-3 py-1.5 text-[12px] font-semibold text-white',
  statChipMuted: 'rounded-lg bg-white/12 px-3 py-1.5 text-[12px] text-emerald-100',
  flowCard: 'rounded-xl border border-emerald-200/90 bg-gradient-to-br from-emerald-50/95 to-teal-50/40 p-4',
  flowTitle: 'text-[12px] font-bold uppercase tracking-wide text-emerald-950',
  flowText: 'mt-2 text-[13px] leading-relaxed text-emerald-950/90',
  filterActive: 'bg-emerald-700 text-white shadow-sm',
  filterIdle: 'border border-emerald-200 bg-white text-emerald-950 hover:bg-emerald-50',
  listSection: 'rounded-2xl border border-emerald-200/90 bg-white shadow-sm ring-1 ring-emerald-900/[0.03]',
  listHeader: 'border-b border-emerald-100 bg-emerald-50/80 px-4 py-3 sm:px-5',
  listSelected: 'bg-emerald-100 ring-2 ring-inset ring-emerald-500/70',
  listHover: 'hover:bg-emerald-50/90',
  empty: 'rounded-2xl border border-dashed border-emerald-300 bg-emerald-50/60 px-6 py-14 text-center',
  panel: 'rounded-2xl border border-emerald-300/80 bg-gradient-to-br from-emerald-50/95 to-white shadow-sm ring-1 ring-emerald-900/[0.05]',
  panelHeader: 'border-b border-emerald-200/80 bg-gradient-to-r from-emerald-800 to-teal-700 px-5 py-4 sm:px-6',
  panelKicker: 'text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-100',
  panelTitle: 'mt-1 text-[17px] font-bold leading-snug text-white',
  stepCurrent: 'border-emerald-400 bg-emerald-50/90',
  stepBadgeDone: 'bg-emerald-700 text-white',
  stepBadgeCurrent: 'bg-emerald-200 text-emerald-950 ring-2 ring-emerald-600',
  btnStart: 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md hover:from-emerald-700 hover:to-teal-700',
  btnFinish: 'bg-gradient-to-r from-emerald-800 to-teal-800 text-white shadow-md hover:from-emerald-900 hover:to-teal-900',
  docBtn: 'border-emerald-300 bg-emerald-50 text-emerald-950 hover:bg-emerald-100',
}

const detallado: StageUi = {
  section: 'rounded-2xl border-2 border-sky-300/90 bg-white shadow-md ring-1 ring-sky-900/[0.04]',
  header: 'border-b border-sky-200/80 bg-gradient-to-r from-sky-800 via-indigo-700 to-sky-800 px-5 py-5 sm:px-6',
  headerKicker: 'text-[11px] font-bold uppercase tracking-[0.14em] text-sky-100',
  headerTitle: 'text-[18px] font-bold text-white sm:text-[20px]',
  headerBody: 'mt-2 max-w-2xl text-[13px] leading-relaxed text-sky-50/95',
  statChip: 'rounded-lg bg-white/20 px-3 py-1.5 text-[12px] font-semibold text-white',
  statChipActive: 'rounded-lg bg-sky-400/35 px-3 py-1.5 text-[12px] font-semibold text-white',
  statChipMuted: 'rounded-lg bg-white/12 px-3 py-1.5 text-[12px] text-sky-100',
  flowCard: 'rounded-xl border border-sky-200/90 bg-gradient-to-br from-sky-50/95 to-indigo-50/40 p-4',
  flowTitle: 'text-[12px] font-bold uppercase tracking-wide text-sky-950',
  flowText: 'mt-2 text-[13px] leading-relaxed text-sky-950/90',
  filterActive: 'bg-indigo-700 text-white shadow-sm',
  filterIdle: 'border border-sky-200 bg-white text-sky-950 hover:bg-sky-50',
  listSection: 'overflow-hidden rounded-2xl border border-sky-200/90 bg-white shadow-sm ring-1 ring-sky-900/[0.03]',
  listHeader: 'border-b border-sky-100 bg-sky-50/80 px-4 py-3 sm:px-5',
  listSelected: 'bg-sky-100 ring-2 ring-inset ring-indigo-400/70',
  listHover: 'hover:bg-sky-50/90',
  empty: 'rounded-2xl border border-dashed border-sky-300 bg-sky-50/60 px-6 py-14 text-center',
  panel: 'rounded-2xl border border-sky-300/80 bg-gradient-to-br from-sky-50/95 to-white shadow-sm ring-1 ring-sky-900/[0.05]',
  panelHeader: 'border-b border-sky-200/80 bg-gradient-to-r from-indigo-800 to-sky-700 px-5 py-4 sm:px-6',
  panelKicker: 'text-[11px] font-bold uppercase tracking-[0.14em] text-sky-100',
  panelTitle: 'mt-1 text-[17px] font-bold leading-snug text-white',
  stepCurrent: 'border-sky-400 bg-sky-50/90',
  stepBadgeDone: 'bg-indigo-700 text-white',
  stepBadgeCurrent: 'bg-sky-200 text-sky-950 ring-2 ring-indigo-500',
  btnStart: 'bg-gradient-to-r from-sky-600 to-indigo-600 text-white shadow-md hover:from-sky-700 hover:to-indigo-700',
  btnFinish: 'bg-gradient-to-r from-indigo-800 to-sky-800 text-white shadow-md hover:from-indigo-900 hover:to-sky-900',
  docBtn: 'border-sky-300 bg-sky-50 text-sky-950 hover:bg-sky-100',
}

export function tallerStageUi(stage: TallerStageKind): StageUi {
  return stage === 'armado' ? armado : detallado
}

export function tallerStageFinishLabel(stage: TallerStageKind): string {
  return stage === 'armado' ? 'Fin de armado' : 'Fin de detallado'
}

export function tallerStageTitle(stage: TallerStageKind): string {
  return stage === 'armado' ? 'Armado por pieza' : 'Detallado por pieza'
}
