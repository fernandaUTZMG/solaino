import type { InventoryItem } from '../types/inventory'
import { insertMovimientoPorCambioStock } from './movimientosRepo'
import { getSupabase } from './supabaseClient'

const TABLE = 'productos'

type ProductoRow = {
  id: string
  codigo: string
  nombre: string
  medida: string | null
  cantidad_por_pza: number | string | null
  codigo_producto: string | null
  descripcion: string | null
  categoria_id: string
  stock_actual: number | string
  stock_minimo: number | string
  stock_maximo: number | string | null
  unidad: string
  ubicacion_area: string
  ubicacion_detalle: string
  costo_unitario: number | string
  proveedor_id: string | null
  part_number: string | null
  fabricante: string | null
  especificaciones: Record<string, unknown> | null
  lote: string | null
  fecha_caducidad: string | null
  estado: string
  imagen_url: string | null
  datasheet_url: string | null
  tiene_serie?: boolean | null
  ultima_entrada: string | null
  ultima_salida: string | null
}

function num(v: number | string): number {
  const n = typeof v === 'string' ? Number(v) : v
  return Number.isFinite(n) ? n : 0
}

function numOrUndef(v: number | string | null | undefined): number | undefined {
  if (v === null || v === undefined) return undefined
  const n = typeof v === 'string' ? Number(v) : v
  return Number.isFinite(n) ? n : undefined
}

export function isProductoUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
}

export function rowToItem(row: ProductoRow): InventoryItem {
  return {
    id: row.id,
    codigo: row.codigo,
    nombre: row.nombre,
    medida: row.medida?.trim() ? row.medida.trim() : undefined,
    cantidadPorPza: numOrUndef(row.cantidad_por_pza),
    codigoProducto: row.codigo_producto?.trim() ? row.codigo_producto.trim() : undefined,
    descripcion: row.descripcion ?? undefined,
    categoriaId: row.categoria_id,
    stockActual: num(row.stock_actual),
    stockMinimo: num(row.stock_minimo),
    stockMaximo: row.stock_maximo === null || row.stock_maximo === undefined ? undefined : num(row.stock_maximo),
    unidad: row.unidad,
    ubicacion: { area: row.ubicacion_area, ubicacion: row.ubicacion_detalle },
    costoUnitario: num(row.costo_unitario),
    proveedorId: row.proveedor_id ?? undefined,
    partNumber: row.part_number ?? undefined,
    fabricante: row.fabricante ?? undefined,
    especificaciones: (row.especificaciones as InventoryItem['especificaciones']) ?? undefined,
    lote: row.lote ?? undefined,
    fechaCaducidad: row.fecha_caducidad ?? undefined,
    estado: row.estado as InventoryItem['estado'],
    imagenUrl: row.imagen_url ?? undefined,
    datasheetUrl: row.datasheet_url ?? undefined,
    tieneSerie: Boolean(row.tiene_serie ?? false),
    ultimaEntradaISO: row.ultima_entrada ? new Date(row.ultima_entrada).toISOString() : undefined,
    ultimaSalidaISO: row.ultima_salida ? new Date(row.ultima_salida).toISOString() : undefined,
  }
}

function buildRowPayload(p: Omit<InventoryItem, 'id'>) {
  return {
    codigo: p.codigo.trim(),
    nombre: p.nombre.trim(),
    medida: p.medida?.trim() ? p.medida.trim() : null,
    cantidad_por_pza:
      p.cantidadPorPza === undefined || p.cantidadPorPza === null || !Number.isFinite(p.cantidadPorPza)
        ? null
        : p.cantidadPorPza,
    codigo_producto: p.codigoProducto?.trim() ? p.codigoProducto.trim() : null,
    descripcion: p.descripcion?.trim() ? p.descripcion.trim() : null,
    categoria_id: p.categoriaId,
    stock_actual: Number.isFinite(p.stockActual) ? p.stockActual : 0,
    stock_minimo: Number.isFinite(p.stockMinimo) ? p.stockMinimo : 0,
    stock_maximo: p.stockMaximo === undefined || p.stockMaximo === null ? null : p.stockMaximo,
    unidad: p.unidad,
    ubicacion_area: p.ubicacion.area,
    ubicacion_detalle: p.ubicacion.ubicacion,
    costo_unitario: Number.isFinite(p.costoUnitario) ? p.costoUnitario : 0,
    proveedor_id: p.proveedorId && p.proveedorId.trim() !== '' ? p.proveedorId : null,
    part_number: p.partNumber?.trim() ? p.partNumber.trim() : null,
    fabricante: p.fabricante?.trim() ? p.fabricante.trim() : null,
    especificaciones: p.especificaciones ?? null,
    lote: p.lote?.trim() ? p.lote.trim() : null,
    fecha_caducidad: p.fechaCaducidad ? String(p.fechaCaducidad).slice(0, 10) : null,
    estado: p.estado,
    imagen_url: p.imagenUrl && p.imagenUrl.trim() !== '' ? p.imagenUrl : null,
    datasheet_url: p.datasheetUrl && p.datasheetUrl.trim() !== '' ? p.datasheetUrl : null,
    tiene_serie: Boolean(p.tieneSerie ?? false),
    ultima_entrada: p.ultimaEntradaISO ?? null,
    ultima_salida: p.ultimaSalidaISO ?? null,
  }
}

export async function fetchProductos(): Promise<InventoryItem[]> {
  const sb = getSupabase()
  const { data, error } = await sb.from(TABLE).select('*').order('codigo', { ascending: true })
  if (error) throw error
  return (data as ProductoRow[] | null)?.map(rowToItem) ?? []
}

export async function fetchProductoByCodigo(codigo: string): Promise<InventoryItem | null> {
  const q = codigo.trim()
  if (!q) return null
  const sb = getSupabase()
  const { data, error } = await sb.from(TABLE).select('*').eq('codigo', q).maybeSingle()
  if (error) throw error
  if (!data) return null
  return rowToItem(data as ProductoRow)
}

export async function fetchProductoById(id: string): Promise<InventoryItem | null> {
  if (!isProductoUuid(id)) return null
  const sb = getSupabase()
  const { data, error } = await sb.from(TABLE).select('*').eq('id', id).maybeSingle()
  if (error) throw error
  if (!data) return null
  return rowToItem(data as ProductoRow)
}

export async function insertProducto(
  p: Omit<InventoryItem, 'id'>,
  opts?: { id?: string },
): Promise<InventoryItem> {
  const sb = getSupabase()
  const payload = buildRowPayload(p)
  const id = opts?.id?.trim()
  const insertPayload =
    id && isProductoUuid(id) ? { id, ...payload } : payload
  const { data, error } = await sb.from(TABLE).insert(insertPayload).select('*').single()
  if (error) throw error
  const item = rowToItem(data as ProductoRow)
  if (item.stockActual !== 0) {
    await insertMovimientoPorCambioStock({
      productoId: item.id,
      stockAnterior: 0,
      stockNuevo: item.stockActual,
    })
  }
  return item
}

export type UpdateProductoOptions = {
  /** Si viene definido y difiere del stock guardado, se inserta una fila en `movimientos`. */
  previousStockActual?: number
}

export async function updateProducto(
  p: InventoryItem,
  opts?: UpdateProductoOptions,
): Promise<InventoryItem> {
  if (!isProductoUuid(p.id)) {
    throw new Error('ID de producto inválido para actualizar.')
  }
  const sb = getSupabase()
  const { id, ...rest } = p
  const payload = buildRowPayload(rest)
  const { data, error } = await sb.from(TABLE).update(payload).eq('id', id).select('*').single()
  if (error) throw error
  const item = rowToItem(data as ProductoRow)
  const prev = opts?.previousStockActual
  if (prev !== undefined && prev !== item.stockActual) {
    await insertMovimientoPorCambioStock({
      productoId: id,
      stockAnterior: prev,
      stockNuevo: item.stockActual,
    })
  }
  return item
}

function isMissingTableError(msg: string): boolean {
  const m = msg.toLowerCase()
  return (
    (m.includes('relation') && m.includes('does not exist')) ||
    m.includes('could not find the table')
  )
}

/**
 * Elimina el producto y filas que lo referencian (`solicitudes` con ON DELETE RESTRICT,
 * `movimientos` si aplica). `series` suele ir en CASCADE al borrar el producto.
 */
export async function deleteProducto(id: string): Promise<void> {
  if (!isProductoUuid(id)) {
    throw new Error('ID de producto inválido para eliminar.')
  }
  const sb = getSupabase()

  const { error: eSol } = await sb.from('solicitudes').delete().eq('producto_id', id)
  if (eSol && !isMissingTableError(eSol.message ?? '')) throw eSol

  const { error: eMov } = await sb.from('movimientos').delete().eq('producto_id', id)
  if (eMov && !isMissingTableError(eMov.message ?? '')) throw eMov

  const { error } = await sb.from(TABLE).delete().eq('id', id)
  if (error) throw error
}
