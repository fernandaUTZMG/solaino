/** Secciones internas del módulo Bodega (proyectos, maquinado, taller). */
export type BodegaHubSection = 'proyectos' | 'maquinado' | 'taller'

const BODEGA_HUB_SECTIONS: readonly BodegaHubSection[] = ['proyectos', 'maquinado', 'taller']

export function bodegaSectionStorageKey(userId: string): string {
  return `solaino.bodegaSection:${userId}`
}

export function readStoredBodegaSection(userId: string): BodegaHubSection | null {
  try {
    const raw = localStorage.getItem(bodegaSectionStorageKey(userId))?.trim()
    if (!raw || !(BODEGA_HUB_SECTIONS as readonly string[]).includes(raw)) return null
    return raw as BodegaHubSection
  } catch {
    return null
  }
}

export function writeStoredBodegaSection(userId: string, section: BodegaHubSection): void {
  try {
    localStorage.setItem(bodegaSectionStorageKey(userId), section)
  } catch {
    /* ignore */
  }
}

/** Migra vistas antiguas del menú superior. */
export function bodegaSectionFromLegacyMainView(view: string): BodegaHubSection | null {
  if (view === 'maquinado') return 'maquinado'
  if (view === 'operador_taller') return 'taller'
  return null
}
