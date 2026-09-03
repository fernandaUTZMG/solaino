import {
  canHistoricoStorageDelete,
  canHistoricoStorageRead,
  canHistoricoStorageUpload,
  isHistoricoStoragePath,
} from './historicoStorageAuth.ts'

/** Buckets lógicos (mismo id que Supabase Storage). */
export type BodegaLogicalBucket = 'bodega-proyectos' | 'bodega-ordenes-compra'

const BODEGA_READ_ROLES = new Set([
  'admin',
  'encargado',
  'disenadora',
  'programadora_maquinaria',
  'operador_bodega',
])

export function normalizeObjectKey(path: string): string {
  let p = path.trim().replace(/^\/+/, '')
  for (const prefix of ['bodega-proyectos/', 'bodega-ordenes-compra/']) {
    if (p.toLowerCase().startsWith(prefix)) p = p.slice(prefix.length)
  }
  return p
}

export function r2ObjectKey(logicalBucket: BodegaLogicalBucket, path: string): string {
  return `${logicalBucket}/${normalizeObjectKey(path)}`
}

export function canBodegaStorageRead(role: string): boolean {
  return BODEGA_READ_ROLES.has(role)
}

/** Alineado con policies de storage_bodega_proyectos / maquinado. */
export function canBodegaStorageUpload(role: string, logicalBucket: BodegaLogicalBucket, path: string): boolean {
  const key = normalizeObjectKey(path)
  if (logicalBucket === 'bodega-proyectos' && isHistoricoStoragePath(key)) {
    return canHistoricoStorageUpload(role, key)
  }
  if (role === 'admin' || role === 'encargado') return true
  if (logicalBucket === 'bodega-ordenes-compra') {
    return role === 'admin' || role === 'encargado'
  }
  if (role === 'disenadora' || role === 'programadora_maquinaria') return true
  if (role === 'operador_bodega') {
    return (
      key.includes('/maquinado/') ||
      key.includes('/programacion/tiempos-maquina/') ||
      key.includes('/evidencias/') ||
      key.includes('/programacion/piezas/')
    )
  }
  return false
}

export function canBodegaStorageMove(role: string): boolean {
  return role === 'admin' || role === 'encargado' || role === 'disenadora' || role === 'programadora_maquinaria'
}

export function canBodegaStorageDelete(role: string, path?: string): boolean {
  if (path && isHistoricoStoragePath(normalizeObjectKey(path))) {
    return canHistoricoStorageDelete(role, normalizeObjectKey(path))
  }
  return role === 'admin'
}

/** Lectura de un objeto concreto (incluye rutas historico/*). */
export function canBodegaStorageReadPath(role: string, logicalBucket: BodegaLogicalBucket, path: string): boolean {
  const key = normalizeObjectKey(path)
  if (logicalBucket === 'bodega-proyectos' && isHistoricoStoragePath(key)) {
    return canHistoricoStorageRead(role, key)
  }
  return canBodegaStorageRead(role)
}
