import type { CncModuleKind } from '../../lib/machineVersionsRepo'

/** Estilos pestaña Programación: navy / slate (mismo lenguaje que Diseño). */

export const progHero =
  'overflow-hidden rounded-2xl border border-blue-950/25 bg-white shadow-md shadow-slate-900/10'

export const progStepCard =
  'overflow-hidden rounded-2xl border border-slate-300/90 bg-white shadow-sm ring-1 ring-slate-900/[0.04]'

export const progStepHeader =
  'flex flex-wrap items-start gap-3 border-b border-slate-200 bg-gradient-to-r from-slate-100 via-slate-50 to-white px-4 py-3.5 sm:px-5'

export const progStepNumber =
  'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-section-navy text-[14px] font-bold text-white shadow-sm'

export const progStepBody = 'space-y-4 bg-slate-50/60 p-4 sm:p-5'

export const progBarraAcciones =
  'rounded-xl border-2 border-dashed border-sky-300 bg-gradient-to-br from-sky-50 to-white p-4 shadow-sm sm:p-5'

export const progAccentBtn =
  'inline-flex min-h-[44px] items-center justify-center rounded-xl bg-section-navy px-5 py-2.5 text-[14px] font-bold text-white shadow-md shadow-blue-950/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60'

export const progAccentIconBox =
  'flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-section-navy text-white shadow-md shadow-blue-950/20'

export const progSeccionCnc = progStepCard

export const progTituloCnc = 'bg-slate-100 px-4 py-2.5 text-[13px] font-bold text-section-navy'

export const progSeccionTorno = progStepCard
export const progTituloTorno = progTituloCnc

export function progSeccionForModule(_m: CncModuleKind): string {
  return progSeccionCnc
}

export function progTituloForModule(_m: CncModuleKind): string {
  return progTituloCnc
}

export function progModuleLabel(m: CncModuleKind): string {
  if (m === 'torno') return 'Torno'
  if (m === 'programacion') return 'CNC'
  return 'Perfilado'
}

export const PROG_TAB_MODULES = ['programacion', 'torno'] as const satisfies readonly CncModuleKind[]

export type ProgWorkspaceModule = 'programacion' | 'torno'

export function progWorkspacePalette(_module: ProgWorkspaceModule) {
  return {
    tabActive: 'bg-section-navy text-white shadow-sm',
    tabInactive: 'bg-slate-100 text-slate-800 hover:bg-slate-200',
    label: 'text-slate-900',
    meta: 'text-slate-600',
    pieceSelected: 'border-section-navy bg-sky-50 ring-2 ring-section-navy/30',
    pieceIdle: 'border-slate-200 bg-white hover:border-slate-400',
    detailBox: 'border-2 border-slate-300',
    panel: 'rounded-xl border border-slate-200 bg-slate-50/80',
    panelTitle: 'text-section-navy',
    panelText: 'text-slate-700',
    btnPrimary: 'bg-section-navy hover:brightness-110',
    fileBorder: 'border-slate-300',
    fileBg: 'bg-slate-50 hover:bg-slate-100',
    fileText: 'text-slate-900',
    dashed: 'border-sky-300 bg-sky-50/80 text-slate-800 hover:bg-sky-50',
    innerCard: 'border-slate-200',
    download:
      'inline-flex min-h-[40px] items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-[13px] font-semibold text-slate-800 hover:bg-slate-50',
  }
}
