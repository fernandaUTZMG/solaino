import type { PostgrestSingleResponse } from '@supabase/supabase-js'
import { getSupabase } from './supabaseClient'
import { fetchOrdenesCompra } from './bodegaOrdenes'
import { parsePrioridadFromRow, type ProjectPrioridadNivel } from './bodegaProjectPrioridad'

export type BodegaProjectPrioridadRow = {
  id: string
  folio: string
  nombre: string
  status: string
  cliente: string
  empresa: string | null
  orden_compra_id: string | null
  avance_pct: number
  prioridadNivel: ProjectPrioridadNivel
  created_at: string
}

function safeText(v: unknown): string {
  if (v == null) return ''
  return String(v).trim()
}

function clampPct(v: unknown): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return 0
  return Math.min(100, Math.max(0, Math.round(n)))
}

export async function fetchBodegaProjectsPrioridadList(): Promise<BodegaProjectPrioridadRow[]> {
  const sb = getSupabase()
  const baseWithOc = 'id, folio, nombre, status, cliente, empresa, orden_compra_id, avance_pct, created_at'
  const baseNoOc = 'id, folio, nombre, status, cliente, empresa, avance_pct, created_at'
  const priNivel = ', prioridad_nivel'
  const priLegacy = ', prioridad'

  let res = (await sb
    .from('bodega_projects')
    .select(`${baseWithOc}${priNivel}${priLegacy}`)
    .order('created_at', { ascending: false })) as PostgrestSingleResponse<Record<string, unknown>[]>

  let msg = [res.error?.message, res.error?.details].filter(Boolean).join(' ')
  if (res.error && /prioridad_nivel/i.test(msg)) {
    res = (await sb
      .from('bodega_projects')
      .select(`${baseWithOc}${priLegacy}`)
      .order('created_at', { ascending: false })) as PostgrestSingleResponse<Record<string, unknown>[]>
    msg = [res.error?.message, res.error?.details].filter(Boolean).join(' ')
  }
  if (res.error && /prioridad/i.test(msg)) {
    res = (await sb
      .from('bodega_projects')
      .select(baseWithOc)
      .order('created_at', { ascending: false })) as PostgrestSingleResponse<Record<string, unknown>[]>
    msg = [res.error?.message, res.error?.details].filter(Boolean).join(' ')
  }

  if (res.error && (msg.includes('orden_compra_id') || (/\bcolumn\b/i.test(msg) && /\bdoes not exist\b/i.test(msg)))) {
    res = (await sb
      .from('bodega_projects')
      .select(`${baseNoOc}${priNivel}${priLegacy}`)
      .order('created_at', { ascending: false })) as PostgrestSingleResponse<Record<string, unknown>[]>
    msg = [res.error?.message, res.error?.details].filter(Boolean).join(' ')
    if (res.error && /prioridad_nivel/i.test(msg)) {
      res = (await sb
        .from('bodega_projects')
        .select(`${baseNoOc}${priLegacy}`)
        .order('created_at', { ascending: false })) as PostgrestSingleResponse<Record<string, unknown>[]>
      msg = [res.error?.message, res.error?.details].filter(Boolean).join(' ')
    }
    if (res.error && /prioridad/i.test(msg)) {
      res = (await sb
        .from('bodega_projects')
        .select(baseNoOc)
        .order('created_at', { ascending: false })) as PostgrestSingleResponse<Record<string, unknown>[]>
    }
  }

  if (res.error) throw res.error

  return ((res.data as Record<string, unknown>[]) ?? []).map((r) => ({
    id: safeText(r.id),
    folio: safeText(r.folio),
    nombre: safeText(r.nombre),
    status: safeText(r.status) || 'pendiente',
    cliente: safeText(r.cliente),
    empresa: r.empresa != null ? safeText(r.empresa) : null,
    orden_compra_id:
      r.orden_compra_id != null && String(r.orden_compra_id).trim() !== '' ? String(r.orden_compra_id) : null,
    avance_pct: clampPct(r.avance_pct),
    prioridadNivel: parsePrioridadFromRow(r),
    created_at: safeText(r.created_at),
  }))
}

export { fetchOrdenesCompra }
