import type { InventoryMovementReason, InventoryMovementType } from '../types/inventory'
import { getSupabase } from './supabaseClient'

const TABLE = 'movimientos'

/** Fila tal como viene de `public.movimientos`. */
export type MovimientoDbRow = {
  id: string
  producto_id: string
  tipo: string
  motivo: string
  cantidad: number
  fecha: string
  responsable: string | null
  nota: string | null
}

/** Movimientos de un producto, más recientes primero. */
export async function fetchMovimientosByProducto(productoId: string): Promise<MovimientoDbRow[]> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from(TABLE)
    .select('id, producto_id, tipo, motivo, cantidad, fecha, responsable, nota')
    .eq('producto_id', productoId)
    .order('fecha', { ascending: false })
  if (error) throw error
  return (data ?? []) as MovimientoDbRow[]
}

const DEFAULT_MOTIVO: InventoryMovementReason = 'Corrección'
const DEFAULT_RESPONSABLE = 'Usuario'

function inferTipo(stockAnterior: number, stockNuevo: number): InventoryMovementType | null {
  if (stockNuevo > stockAnterior) return 'Entrada'
  if (stockNuevo < stockAnterior) return 'Salida'
  return null
}

/**
 * Registra un movimiento por cambio de stock: cantidad = |delta| (siempre positiva), tipo Entrada/Salida.
 * No hace nada si el stock no cambió.
 */
export async function insertMovimientoPorCambioStock(args: {
  productoId: string
  stockAnterior: number
  stockNuevo: number
  motivo?: InventoryMovementReason
  responsable?: string
  nota?: string | null
}): Promise<void> {
  const tipo = inferTipo(args.stockAnterior, args.stockNuevo)
  if (!tipo) return

  const cantidad = Math.abs(args.stockNuevo - args.stockAnterior)
  if (cantidad === 0) return

  const row = {
    producto_id: args.productoId,
    tipo,
    motivo: args.motivo ?? DEFAULT_MOTIVO,
    cantidad,
    fecha: new Date().toISOString(),
    responsable: args.responsable?.trim() ? args.responsable.trim() : DEFAULT_RESPONSABLE,
    nota: args.nota?.trim() ? args.nota.trim() : null,
  }

  const sb = getSupabase()
  const { error } = await sb.from(TABLE).insert(row)
  if (error) throw error
}
