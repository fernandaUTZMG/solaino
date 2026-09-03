export type BodegaHistoricoArea = 'disenadora' | 'programacion'

export const BODEGA_HISTORICO_AREAS: readonly BodegaHistoricoArea[] = ['disenadora', 'programacion'] as const

/** Etiquetas del selector de área en Histórico (intercambiadas respecto al id interno). */
export function historicoAreaLabel(area: BodegaHistoricoArea): string {
  return area === 'disenadora' ? 'Programadora' : 'Diseño'
}

export function historicoAreaShortHint(area: BodegaHistoricoArea): string {
  return area === 'disenadora'
    ? 'PROGRAMAS, DXF, NC y carpetas de la USB de programación'
    : 'ZIP / planos / SolidWorks de diseño'
}

export function historicoAreaPrefix(area: BodegaHistoricoArea): string {
  return `historico/${area}/`
}

/** Tipos de Nube visibles en pestaña «Del flujo» por área de almacenamiento. */
export function historicoFlujoKindsForArea(area: BodegaHistoricoArea): Array<'diseno' | 'info_cliente' | 'programacion' | 'maquinado' | 'foto'> {
  if (area === 'disenadora') return ['programacion', 'maquinado', 'foto']
  return ['diseno', 'info_cliente', 'foto']
}
