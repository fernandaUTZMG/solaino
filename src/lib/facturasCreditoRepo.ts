import { BODEGA_PROYECTOS_BUCKET, createSignedUrlForBodegaStorage } from './bodegaObjectStorage'
import { sanitizeStorageFileName } from './bodegaOrdenes'
import {
  assertBodegaProyectosStorageFileAllowed,
  refreshSessionBeforeStorageUpload,
  uploadBodegaProyectosBinary,
} from './bodegaStorageUpload'
import { getSupabase } from './supabaseClient'
import type { FacturaStatus } from './facturasCreditoDue'

export type FacturaProveedorRow = {
  id: string
  nombre: string
  dias_credito: number | null
}

export type FacturaCreditoRow = {
  id: string
  proveedor_id: string
  descripcion: string
  factura: string
  monto_neto: number | null
  fecha_factura: string | null
  fecha_pago: string | null
  status: FacturaStatus
  archivo_path: string | null
  archivo_nombre: string | null
  proveedor: FacturaProveedorRow | null
}

function describeError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message
  if (error && typeof error === 'object') {
    const row = error as { message?: unknown; details?: unknown; hint?: unknown }
    const parts = [row.message, row.details, row.hint].filter(
      (part): part is string => typeof part === 'string' && part.trim().length > 0,
    )
    if (parts.length > 0) return parts.join(' — ')
  }
  return 'No se pudieron cargar las facturas'
}

function asProveedor(value: unknown): FacturaProveedorRow | null {
  const row = Array.isArray(value) ? value[0] : value
  if (!row || typeof row !== 'object') return null
  const p = row as FacturaProveedorRow
  if (!p.id || !p.nombre) return null
  return { id: p.id, nombre: p.nombre, dias_credito: p.dias_credito ?? null }
}

function asFactura(row: Record<string, unknown>): FacturaCreditoRow {
  const status = row.status === 'PAGADA' || row.status === 'VENCIDA' ? row.status : 'PENDIENTE'
  return {
    id: String(row.id),
    proveedor_id: String(row.proveedor_id),
    descripcion: String(row.descripcion ?? ''),
    factura: String(row.factura ?? ''),
    monto_neto: row.monto_neto == null || row.monto_neto === '' ? null : Number(row.monto_neto),
    fecha_factura: row.fecha_factura ? String(row.fecha_factura).slice(0, 10) : null,
    fecha_pago: row.fecha_pago ? String(row.fecha_pago).slice(0, 10) : null,
    status,
    archivo_path: row.archivo_path ? String(row.archivo_path) : null,
    archivo_nombre: row.archivo_nombre ? String(row.archivo_nombre) : null,
    proveedor: asProveedor(row.facturas_credito_proveedores),
  }
}

const FACTURA_SELECT =
  'id, proveedor_id, descripcion, factura, monto_neto, fecha_factura, fecha_pago, status, archivo_path, archivo_nombre, facturas_credito_proveedores(id, nombre, dias_credito)'

export async function fetchFacturasCredito(): Promise<{
  facturas: FacturaCreditoRow[]
  proveedores: FacturaProveedorRow[]
}> {
  const sb = getSupabase()
  const [facturasRes, proveedoresRes] = await Promise.all([
    sb.from('facturas_credito').select(FACTURA_SELECT).order('fecha_factura', { ascending: false, nullsFirst: false }),
    sb.from('facturas_credito_proveedores').select('id, nombre, dias_credito').order('nombre'),
  ])
  if (facturasRes.error) throw new Error(describeError(facturasRes.error))
  if (proveedoresRes.error) throw new Error(describeError(proveedoresRes.error))
  return {
    facturas: ((facturasRes.data as Record<string, unknown>[] | null) ?? []).map(asFactura),
    proveedores: ((proveedoresRes.data as FacturaProveedorRow[] | null) ?? []).map((p) => ({
      id: p.id,
      nombre: p.nombre,
      dias_credito: p.dias_credito ?? null,
    })),
  }
}

export async function saveFacturaProveedor(args: {
  id?: string
  nombre: string
  diasCredito: number | null
}): Promise<FacturaProveedorRow> {
  const sb = getSupabase()
  const payload = { nombre: args.nombre.trim(), dias_credito: args.diasCredito }
  const query = args.id
    ? sb.from('facturas_credito_proveedores').update(payload).eq('id', args.id)
    : sb.from('facturas_credito_proveedores').insert(payload)
  const { data, error } = await query.select('id, nombre, dias_credito').single()
  if (error) throw new Error(describeError(error))
  return data as FacturaProveedorRow
}

export type FacturaCreditoInput = {
  proveedorId: string
  descripcion: string
  factura: string
  montoNeto: number | null
  fechaFactura: string | null
  fechaPago: string | null
  status: FacturaStatus
}

export async function insertFacturaCredito(input: FacturaCreditoInput): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb.from('facturas_credito').insert({
    proveedor_id: input.proveedorId,
    descripcion: input.descripcion.trim(),
    factura: input.factura.trim(),
    monto_neto: input.montoNeto,
    fecha_factura: input.fechaFactura,
    fecha_pago: input.fechaPago,
    status: input.status,
  })
  if (error) throw new Error(describeError(error))
}

export async function updateFacturaCredito(id: string, input: FacturaCreditoInput): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb
    .from('facturas_credito')
    .update({
      proveedor_id: input.proveedorId,
      descripcion: input.descripcion.trim(),
      factura: input.factura.trim(),
      monto_neto: input.montoNeto,
      fecha_factura: input.fechaFactura,
      fecha_pago: input.fechaPago,
      status: input.status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw new Error(describeError(error))
}

export async function deleteFacturaCredito(id: string): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb.from('facturas_credito').delete().eq('id', id)
  if (error) throw new Error(describeError(error))
}

const FACTURA_ARCHIVO_ACCEPT = '.pdf,.xml,.png,.jpg,.jpeg,.webp,.gif,application/pdf,image/*,text/xml,application/xml'

export function facturaCreditoArchivoAccept(): string {
  return FACTURA_ARCHIVO_ACCEPT
}

function guessArchivoContentType(file: File): string {
  if (file.type && file.type !== 'application/octet-stream') return file.type
  const n = file.name.toLowerCase()
  if (n.endsWith('.pdf')) return 'application/pdf'
  if (n.endsWith('.xml')) return 'application/xml'
  if (n.endsWith('.png')) return 'image/png'
  if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg'
  if (n.endsWith('.webp')) return 'image/webp'
  return 'application/octet-stream'
}

export async function attachFacturaCreditoArchivo(id: string, file: File): Promise<void> {
  assertBodegaProyectosStorageFileAllowed(file)
  const sb = getSupabase()
  await refreshSessionBeforeStorageUpload(sb)
  const storagePath = `facturas-credito/${id}/${crypto.randomUUID()}-${sanitizeStorageFileName(file.name)}`
  await uploadBodegaProyectosBinary(sb, BODEGA_PROYECTOS_BUCKET, storagePath, file, guessArchivoContentType(file))
  const { error } = await sb
    .from('facturas_credito')
    .update({
      archivo_path: storagePath,
      archivo_nombre: file.name,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw new Error(describeError(error))
}

export async function clearFacturaCreditoArchivo(id: string): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb
    .from('facturas_credito')
    .update({
      archivo_path: null,
      archivo_nombre: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw new Error(describeError(error))
}

export async function openFacturaCreditoArchivo(storagePath: string, displayName: string): Promise<void> {
  const url = await createSignedUrlForBodegaStorage(BODEGA_PROYECTOS_BUCKET, storagePath, 3600)
  if (!url) throw new Error('No se pudo abrir el archivo.')
  const a = document.createElement('a')
  a.href = url
  a.download = displayName || 'factura'
  a.target = '_blank'
  a.rel = 'noopener noreferrer'
  document.body.appendChild(a)
  a.click()
  a.remove()
}
