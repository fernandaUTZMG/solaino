import { getSupabase } from './supabaseClient'

const TABLE = 'series'

/**
 * Devuelve los IDs de producto que tienen al menos una fila en `series`
 * cuyo número de serie coincide con la búsqueda (exacta; si no hay, contiene).
 */
export async function fetchProductIdsBySerieBusqueda(busqueda: string): Promise<string[]> {
  const s = busqueda.trim()
  if (!s) return []

  const sb = getSupabase()
  const ids = new Set<string>()

  const { data: exact, error: errExact } = await sb.from(TABLE).select('producto_id').eq('numero_serie', s)
  if (errExact) throw errExact
  for (const row of (exact as { producto_id: string }[] | null) ?? []) {
    ids.add(row.producto_id)
  }

  if (ids.size === 0 && s.length >= 2) {
    const safe = s.replace(/%/g, '').replace(/_/g, '')
    if (!safe) return []
    const { data: partial, error: errPartial } = await sb
      .from(TABLE)
      .select('producto_id')
      .ilike('numero_serie', `%${safe}%`)
    if (errPartial) throw errPartial
    for (const row of (partial as { producto_id: string }[] | null) ?? []) {
      ids.add(row.producto_id)
    }
  }

  return Array.from(ids)
}
