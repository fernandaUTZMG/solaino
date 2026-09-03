/** Orden de pestañas en Taller: primero perfilado, luego detallado, luego armado. */
export const TALLER_STAGE_TAB_ORDER = ['perfilado', 'detallado', 'armado'] as const

export type TallerStageTabId = (typeof TALLER_STAGE_TAB_ORDER)[number]

export const TALLER_STAGE_TAB_LABELS: Record<TallerStageTabId, string> = {
  perfilado: 'Perfilado',
  detallado: 'Detallado',
  armado: 'Armado',
}
