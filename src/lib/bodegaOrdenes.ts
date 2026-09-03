import { createSignedUrlForBodegaStorage } from './bodegaObjectStorage'
import { getSupabase } from './supabaseClient'

export const BODEGA_ORDENES_BUCKET = 'bodega-ordenes-compra'

export type OrdenCompraRow = {
  id: string
  numero: string
  archivo_storage_path: string
  archivo_nombre: string
  fecha: string
  empresa_id: string | null
  requisitor_id: string | null
  /** Partidas leídas del PDF (Coupa / descripción de línea). */
  cotizacion_lineas: string[]
  empresa: { nombre: string } | null
  requisitor: { nombre: string } | null
}

function firstRel<T extends { nombre: string }>(rel: T | T[] | null | undefined): T | null {
  if (rel == null) return null
  return Array.isArray(rel) ? (rel[0] ?? null) : rel
}

export async function fetchOrdenesCompra(): Promise<OrdenCompraRow[]> {
  const sb = getSupabase()
  const selectFull = `
      id,
      numero,
      archivo_storage_path,
      archivo_nombre,
      fecha,
      empresa_id,
      requisitor_id,
      cotizacion_lineas,
      empresa:empresas (nombre),
      requisitor:requisitores (nombre)
    `
  const selectLegacy = `
      id,
      numero,
      archivo_storage_path,
      archivo_nombre,
      fecha,
      empresa_id,
      requisitor_id,
      empresa:empresas (nombre),
      requisitor:requisitores (nombre)
    `

  const first = await sb.from('bodega_ordenes_compra').select(selectFull).order('fecha', { ascending: false })
  const msg = [first.error?.message, first.error?.details, (first.error as { hint?: string } | null)?.hint]
    .filter(Boolean)
    .join(' ')

  const useLegacy =
    first.error &&
    (msg.includes('cotizacion_lineas') || (/\bcolumn\b/i.test(msg) && /\bdoes not exist\b/i.test(msg)))

  const res = useLegacy
    ? await sb.from('bodega_ordenes_compra').select(selectLegacy).order('fecha', { ascending: false })
    : first

  if (res.error) throw res.error

  const data = res.data ?? []
  const rows = data as Array<
    Omit<OrdenCompraRow, 'empresa' | 'requisitor' | 'cotizacion_lineas'> & {
      cotizacion_lineas?: string[] | null
      empresa: { nombre: string } | { nombre: string }[] | null
      requisitor: { nombre: string } | { nombre: string }[] | null
    }
  >
  return rows.map((r) => ({
    ...r,
    cotizacion_lineas: Array.isArray(r.cotizacion_lineas) ? r.cotizacion_lineas : [],
    empresa: firstRel(r.empresa),
    requisitor: firstRel(r.requisitor),
  }))
}

export async function createSignedUrlForOrdenPdf(storagePath: string, expiresSec = 3600): Promise<string | null> {
  return createSignedUrlForBodegaStorage(BODEGA_ORDENES_BUCKET, storagePath, expiresSec)
}

export function sanitizeStorageFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180) || 'archivo.pdf'
}
