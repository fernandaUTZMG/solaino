import type { BodegaHistoricoArea } from './bodegaHistoricTypes'
import { historicoAreaPrefix } from './bodegaHistoricTypes'

/** Caracteres no permitidos en rutas de almacenamiento. */
const BAD_PATH = /[\\:*?"<>|]/g

export function sanitizeHistoricPathSegment(segment: string): string {
  const t = segment.trim().replace(BAD_PATH, '_').replace(/\.\./g, '')
  return t.slice(0, 120) || 'carpeta'
}

export function sanitizeHistoricFileName(name: string): string {
  const t = name.trim().replace(BAD_PATH, '_').replace(/\.\./g, '')
  return t.slice(0, 180) || 'archivo'
}

/** Ruta relativa tipo `PROGRAMAS JCP/JABIL/archivo.dxf` → ruta en bucket. */
export function buildHistoricStoragePathFromRelative(
  area: BodegaHistoricoArea,
  relativePath: string,
): string {
  const parts = relativePath
    .replace(/\\/g, '/')
    .split('/')
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length === 0) throw new Error('Ruta vacía')
  const fileName = sanitizeHistoricFileName(parts[parts.length - 1]!)
  const dirs = parts.slice(0, -1).map(sanitizeHistoricPathSegment)
  const rel = [...dirs, fileName].join('/')
  return `${historicoAreaPrefix(area)}${rel}`
}

export function relativePathWithinHistoricoArea(
  area: BodegaHistoricoArea,
  storagePath: string,
): string | null {
  const prefix = historicoAreaPrefix(area)
  const p = storagePath.replace(/\\/g, '/').replace(/^\/+/, '')
  if (!p.toLowerCase().startsWith(prefix.toLowerCase())) return null
  return p.slice(prefix.length) || null
}

export function isIgnoredHistoricUploadFile(name: string): boolean {
  const n = name.toLowerCase()
  if (n === 'thumbs.db' || n === 'desktop.ini' || n === '.ds_store') return true
  if (n.startsWith('~$')) return true
  return false
}
