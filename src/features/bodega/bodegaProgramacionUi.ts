import type { CncModuleKind } from '../../lib/machineVersionsRepo'

/** Hero y pasos — pestaña Programación (morado #853D85). */
export const progHero =
  'overflow-hidden rounded-2xl border-2 border-programacion-400/90 bg-gradient-to-br from-programacion-100 via-programacion-50 to-programacion-100/60 shadow-md shadow-programacion-200/40 ring-2 ring-programacion-300/70'

export const progStepCard =
  'overflow-hidden rounded-2xl border-2 border-programacion-300/90 bg-white shadow-sm shadow-programacion-100/50 ring-1 ring-programacion-200/60'

export const progStepHeader =
  'flex flex-wrap items-start gap-3 border-b-2 border-programacion-300/80 bg-gradient-to-r from-programacion-200/90 via-programacion-100/95 to-programacion-50 px-4 py-3.5 sm:px-5'

export const progStepNumber =
  'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-programacion-600 to-programacion-700 text-[14px] font-bold text-white shadow-md shadow-programacion-400/50 ring-2 ring-programacion-400/40'

export const progStepBody = 'space-y-4 bg-programacion-50/25 p-4 sm:p-5'

export const progBarraAcciones =
  'rounded-xl border-2 border-dashed border-programacion-400 bg-programacion-100/70 p-4 sm:p-5'

export const progAccentBtn =
  'rounded-xl bg-gradient-to-r from-programacion-600 to-programacion-700 px-5 py-2.5 text-[14px] font-semibold text-white shadow-md shadow-programacion-400/40 transition hover:from-programacion-700 hover:to-programacion-800'

export const progAccentIconBox =
  'flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-programacion-600 to-programacion-700 text-white shadow-lg shadow-programacion-400/45 ring-2 ring-programacion-400/50'

/** Estilos pestaña Programación (CNC) — tono morado ciruela (#853D85). */
export const progSeccionCnc = progStepCard

export const progTituloCnc = 'bg-programacion-400 px-4 py-2.5 text-[13px] font-bold text-programacion-950'

/** Estilos pestaña Programación (Torno) — misma familia, un poco más oscura. */
export const progSeccionTorno = 'overflow-hidden rounded-xl border-2 border-programacion-400 bg-white'
export const progTituloTorno = 'bg-programacion-300 px-4 py-2.5 text-[13px] font-bold text-programacion-950'

export function progSeccionForModule(m: CncModuleKind): string {
  return m === 'torno' ? progSeccionTorno : progSeccionCnc
}

export function progTituloForModule(m: CncModuleKind): string {
  return m === 'torno' ? progTituloTorno : progTituloCnc
}

export function progModuleLabel(m: CncModuleKind): string {
  if (m === 'torno') return 'Torno'
  if (m === 'programacion') return 'CNC'
  return 'Perfilado'
}

export const PROG_TAB_MODULES = ['programacion', 'torno'] as const satisfies readonly CncModuleKind[]

export type ProgWorkspaceModule = 'programacion' | 'torno'

/** Paleta programación para workspace y pantalla de piezas. */
export function progWorkspacePalette(module: ProgWorkspaceModule) {
  const isTorno = module === 'torno'
  return {
    tabActive: isTorno
      ? 'bg-programacion-700 text-white shadow-sm'
      : 'bg-programacion-600 text-white shadow-sm',
    tabInactive: 'bg-programacion-50 text-programacion-900 hover:bg-programacion-100',
    label: 'text-programacion-900',
    meta: 'text-programacion-800/90',
    pieceSelected: 'border-programacion-600 bg-programacion-100 ring-2 ring-programacion-500/40',
    pieceIdle: 'border-programacion-200/80 bg-white hover:border-programacion-400',
    detailBox: 'border-2 border-programacion-400/80',
    panel: 'rounded-xl border border-programacion-100 bg-programacion-50/50',
    panelTitle: 'text-programacion-900',
    panelText: 'text-programacion-950/90',
    btnPrimary: 'bg-programacion-600 hover:bg-programacion-700',
    fileBorder: 'border-programacion-300',
    fileBg: 'bg-programacion-50 hover:bg-programacion-100',
    fileText: 'text-programacion-900',
    dashed: 'border-programacion-400 bg-programacion-50/80 text-programacion-950 hover:bg-programacion-100',
    innerCard: 'border-programacion-200',
    download:
      'inline-flex min-h-[40px] items-center rounded-lg border border-programacion-300 bg-programacion-50 px-4 py-2 text-[13px] font-semibold text-programacion-900 hover:bg-programacion-100',
  }
}
