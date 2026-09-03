export type HistoricoArea = 'disenadora' | 'programacion'

export function historicoAreaFromPath(path: string): HistoricoArea | null {
  const p = path.trim().replace(/^\/+/, '')
  if (p.startsWith('historico/disenadora/')) return 'disenadora'
  if (p.startsWith('historico/programacion/')) return 'programacion'
  return null
}

export function isHistoricoStoragePath(path: string): boolean {
  return historicoAreaFromPath(path) != null
}

export function canHistoricoStorageRead(role: string, path: string): boolean {
  const area = historicoAreaFromPath(path)
  if (!area) return false
  if (role === 'admin' || role === 'encargado') return true
  if (role === 'disenadora' && area === 'programacion') return true
  if (role === 'programadora_maquinaria' && area === 'disenadora') return true
  return false
}

export function canHistoricoStorageUpload(role: string, path: string): boolean {
  return canHistoricoStorageRead(role, path)
}

export function canHistoricoStorageDelete(role: string, path: string): boolean {
  if (!isHistoricoStoragePath(path)) return false
  return role === 'admin' || role === 'encargado'
}
