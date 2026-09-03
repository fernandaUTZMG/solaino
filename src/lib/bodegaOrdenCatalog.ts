import { getSupabase } from './supabaseClient'
import { matchCatalogByName, type CatalogOpt } from './ordenCompraPdfExtract'

export async function fetchEmpresaCatalog(): Promise<CatalogOpt[]> {
  const sb = getSupabase()
  const { data, error } = await sb.from('empresas').select('id,nombre').order('nombre')
  if (error) throw error
  return (data ?? []) as CatalogOpt[]
}

export async function fetchRequisitorCatalog(): Promise<CatalogOpt[]> {
  const sb = getSupabase()
  const { data, error } = await sb.from('requisitores').select('id,nombre').order('nombre')
  if (error) throw error
  return (data ?? []) as CatalogOpt[]
}

/** Busca en catálogo o crea entrada nueva por nombre (encargado/admin). */
export async function ensureCatalogIdByName(
  table: 'empresas' | 'requisitores',
  name: string,
  opts: CatalogOpt[],
): Promise<string> {
  const trimmed = name.trim()
  if (!trimmed) return ''
  const existing = matchCatalogByName(trimmed, opts)
  if (existing) return existing

  const sb = getSupabase()
  const { data, error } = await sb.from(table).insert({ nombre: trimmed }).select('id').single()
  if (!error && data?.id) return String(data.id)

  const msg = String(error?.message ?? '')
  if (/duplicate|unique|23505/i.test(msg)) {
    const refreshed = table === 'empresas' ? await fetchEmpresaCatalog() : await fetchRequisitorCatalog()
    const retry = matchCatalogByName(trimmed, refreshed)
    if (retry) return retry
  }
  if (error) throw error
  return ''
}

export async function updateOrdenCompraCatalog(
  ordenId: string,
  payload: { empresaId: string | null; requisitorId: string | null },
): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb
    .from('bodega_ordenes_compra')
    .update({
      empresa_id: payload.empresaId,
      requisitor_id: payload.requisitorId,
    })
    .eq('id', ordenId)
  if (error) throw error
}
