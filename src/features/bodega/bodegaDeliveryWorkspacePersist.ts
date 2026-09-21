/** Restaura el proyecto y la pestaña de entregas al volver a la app. */

export type BodegaDeliveryWorkspaceTab =
  | 'diseno'
  | 'cnc'
  | 'maquinado'
  | 'taller'
  | 'fotos'
  | 'piezas'

export type BodegaDeliveryWorkspaceCncModule = 'programacion' | 'torno' | 'perfilado'

export type BodegaDeliveryWorkspaceState = {
  projectId: string
  tab: BodegaDeliveryWorkspaceTab
  cncModuleTab: BodegaDeliveryWorkspaceCncModule
  updatedAt: number
}

const TABS: readonly BodegaDeliveryWorkspaceTab[] = [
  'diseno',
  'cnc',
  'maquinado',
  'taller',
  'fotos',
  'piezas',
]

const CNC_MODULES: readonly BodegaDeliveryWorkspaceCncModule[] = [
  'programacion',
  'torno',
  'perfilado',
]

export function bodegaDeliveryWorkspaceStorageKey(userId: string): string {
  return `solaino.bodegaDeliveryWorkspace:${userId}`
}

export function readStoredBodegaDeliveryWorkspace(
  userId: string,
): BodegaDeliveryWorkspaceState | null {
  try {
    const raw = localStorage.getItem(bodegaDeliveryWorkspaceStorageKey(userId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<BodegaDeliveryWorkspaceState>
    if (!parsed || typeof parsed.projectId !== 'string' || !parsed.projectId.trim()) return null
    if (!parsed.tab || !(TABS as readonly string[]).includes(parsed.tab)) return null
    const cncModuleTab =
      parsed.cncModuleTab && (CNC_MODULES as readonly string[]).includes(parsed.cncModuleTab)
        ? parsed.cncModuleTab
        : 'programacion'
    return {
      projectId: parsed.projectId.trim(),
      tab: parsed.tab,
      cncModuleTab,
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
    }
  } catch {
    return null
  }
}

export function writeStoredBodegaDeliveryWorkspace(
  userId: string,
  state: Omit<BodegaDeliveryWorkspaceState, 'updatedAt'> & { updatedAt?: number },
): void {
  try {
    const payload: BodegaDeliveryWorkspaceState = {
      projectId: state.projectId,
      tab: state.tab,
      cncModuleTab: state.cncModuleTab,
      updatedAt: state.updatedAt ?? Date.now(),
    }
    localStorage.setItem(bodegaDeliveryWorkspaceStorageKey(userId), JSON.stringify(payload))
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearStoredBodegaDeliveryWorkspace(userId: string): void {
  try {
    localStorage.removeItem(bodegaDeliveryWorkspaceStorageKey(userId))
  } catch {
    /* ignore */
  }
}
