import { formatBusinessMinutesShort } from './bodegaProjectPhaseDurations'
import type { BodegaPieceIntervalRow } from './bodegaPieceIntervalsRepo'
import type { BodegaWorkIntervalRow } from './bodegaWorkIntervalsRepo'
import type { ProjectOrdenTimeBreakdown } from './bodegaProjectOrdenTimes'

export type BodegaDeliveryTabId = 'diseno' | 'cnc' | 'maquinado' | 'taller' | 'fotos' | 'piezas'

export const DELIVERY_TAB_SECTION_LABEL: Record<BodegaDeliveryTabId, string> = {
  diseno: 'Diseño',
  cnc: 'Programación',
  maquinado: 'Maquinado',
  taller: 'Taller',
  fotos: 'Fotos',
  piezas: 'Proyecto (total)',
}

/** Minutos hábiles registrados con reloj, agrupados por pestaña de entregas. */
export function deliveryTabMinutes(t: ProjectOrdenTimeBreakdown, tab: BodegaDeliveryTabId): number {
  switch (tab) {
    case 'diseno':
      return t.disenoMin
    case 'cnc':
      return t.programacionMin
    case 'maquinado':
      return t.maquinadoMin
    case 'taller':
      return t.perfiladoMin + t.detalladoMin + t.armadoMin
    case 'fotos':
      return 0
    case 'piezas':
      return t.totalTrackedMin
    default:
      return 0
  }
}

export function formatDeliveryTabTime(t: ProjectOrdenTimeBreakdown, tab: BodegaDeliveryTabId): string {
  const mins = deliveryTabMinutes(t, tab)
  if (tab === 'fotos' && mins < 1) return '—'
  return formatBusinessMinutesShort(mins)
}

/** Reloj en curso solo para la pestaña visible (evita que maquinado siga «vivo» en Taller/Detallado). */
export function deliveryTabHasOpenInterval(
  tab: BodegaDeliveryTabId,
  workIntervals: BodegaWorkIntervalRow[],
  pieceIntervals: BodegaPieceIntervalRow[],
): boolean {
  const openPiece = (lanes: string[]) =>
    pieceIntervals.some((r) => r.ended_at == null && lanes.includes(r.lane))
  const openWork = (lanes: string[]) =>
    workIntervals.some((r) => r.ended_at == null && lanes.includes(r.lane))

  switch (tab) {
    case 'diseno':
      return openWork(['diseno'])
    case 'cnc':
      return (
        openWork(['cnc_programacion', 'cnc_torno', 'cnc_perfilado', 'maquina_programacion', 'maquina_torno', 'maquina_perfilado']) ||
        openPiece(['programacion_cnc', 'programacion_torno'])
      )
    case 'maquinado':
      return openPiece(['maquinado'])
    case 'taller':
      return openPiece(['perfilado_operador', 'detallado', 'armado']) || openWork(['armado'])
    case 'fotos':
    case 'piezas':
      return (
        workIntervals.some((r) => r.ended_at == null) || pieceIntervals.some((r) => r.ended_at == null)
      )
    default:
      return false
  }
}
