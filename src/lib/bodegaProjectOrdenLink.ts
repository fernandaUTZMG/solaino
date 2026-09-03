import { getSupabase } from './supabaseClient'
import type { OrdenCompraRow } from './bodegaOrdenes'

export type LinkProjectOrdenInput = {
  projectId: string
  ordenCompra: OrdenCompraRow
  cotizacionLineaIdx?: number | null
  syncClienteEmpresa?: boolean
}

export async function linkProjectToOrdenCompra(input: LinkProjectOrdenInput): Promise<void> {
  const sb = getSupabase()
  const oc = input.ordenCompra

  const payload: Record<string, unknown> = {
    orden_compra_id: oc.id,
    orden: oc.numero,
  }

  if (input.cotizacionLineaIdx != null && input.cotizacionLineaIdx > 0) {
    payload.cotizacion_linea_idx = input.cotizacionLineaIdx
  }

  if (input.syncClienteEmpresa !== false) {
    if (oc.requisitor?.nombre?.trim()) payload.cliente = oc.requisitor.nombre.trim()
    if (oc.empresa?.nombre?.trim()) payload.empresa = oc.empresa.nombre.trim()
  }

  let { error } = await sb.from('bodega_projects').update(payload).eq('id', input.projectId)

  if (error && payload.cotizacion_linea_idx != null && /cotizacion_linea_idx/i.test(error.message)) {
    const { cotizacion_linea_idx: _line, ...rest } = payload
    ;({ error } = await sb.from('bodega_projects').update(rest).eq('id', input.projectId))
  }

  if (error && payload.orden_compra_id != null && /orden_compra_id/i.test(error.message)) {
    throw new Error(
      'Falta la columna orden_compra_id en bodega_projects. Ejecuta las migraciones de bodega en Supabase.',
    )
  }

  if (error) throw error
}
