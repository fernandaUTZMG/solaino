import { getSupabase } from './supabaseClient'

export const BODEGA_ASSEMBLY_XT_PATH_MIGRATION =
  'supabase/patch_bodega_piece_assembly_xt.sql'

export const BODEGA_POST_MAQUINADO_ROUTE_PATCH = 'supabase/patch_bodega_complete_maquinado.sql'

export const BODEGA_PIECE_PHOTOS_PIECE_ID_PATCH = 'supabase/patch_bodega_piece_photos_piece_id.sql'

let assemblyXtPathColumnCache: { until: number; value: boolean } | null = null
let postMaquinadoRouteColumnCache: { until: number; value: boolean } | null = null
let piecePhotosPieceIdColumnCache: { until: number; value: boolean } | null = null

/** PostgREST debe tener la columna `assembly_xt_path` (migración 20260519120000). */
export async function bodegaPiecesSupportsAssemblyXtPath(): Promise<boolean> {
  const now = Date.now()
  if (assemblyXtPathColumnCache && assemblyXtPathColumnCache.until > now) {
    return assemblyXtPathColumnCache.value
  }
  const sb = getSupabase()
  const { error } = await sb.from('bodega_project_pieces').select('assembly_xt_path').limit(1)
  const value = !error
  assemblyXtPathColumnCache = { until: now + 5000, value }
  return value
}

/** PostgREST debe exponer `post_maquinado_route` (patch_bodega_complete_maquinado.sql). */
export async function bodegaPiecesSupportsPostMaquinadoRoute(): Promise<boolean> {
  const now = Date.now()
  if (postMaquinadoRouteColumnCache && postMaquinadoRouteColumnCache.until > now) {
    return postMaquinadoRouteColumnCache.value
  }
  const sb = getSupabase()
  const { error } = await sb.from('bodega_project_pieces').select('post_maquinado_route').limit(1)
  const value = !error
  postMaquinadoRouteColumnCache = { until: now + 5000, value }
  return value
}

/** PostgREST debe exponer `piece_id` en project_piece_photos (patch_bodega_piece_photos_piece_id.sql). */
export async function bodegaPiecePhotosSupportsPieceId(): Promise<boolean> {
  const now = Date.now()
  if (piecePhotosPieceIdColumnCache && piecePhotosPieceIdColumnCache.until > now) {
    return piecePhotosPieceIdColumnCache.value
  }
  const sb = getSupabase()
  const { error } = await sb.from('project_piece_photos').select('piece_id').limit(0)
  const value = !error
  piecePhotosPieceIdColumnCache = { until: now + 5000, value }
  return value
}

export function piecePhotosMissingPieceIdMessage(): string {
  return `Falta la columna piece_id en project_piece_photos. Ejecuta ${BODEGA_PIECE_PHOTOS_PIECE_ID_PATCH} en el SQL Editor de Supabase y luego Settings → API → Reload schema.`
}

export function isPostgrestMissingColumnError(err: unknown, column?: string): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { message?: string; details?: string; hint?: string; code?: string }
  const msg = [e.message, e.details, e.hint, e.code].filter(Boolean).join(' ')
  if (/PGRST204|42703|schema cache|Could not find/i.test(msg)) return true
  if (column && new RegExp(column, 'i').test(msg)) return true
  return /column.*does not exist/i.test(msg)
}

export function pieceInsertMissingColumnMessage(err: unknown): string | null {
  const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: string }).message) : ''
  if (
    msg.includes('assembly_xt_path') ||
    msg.includes('schema cache') ||
    msg.includes('Could not find') ||
    msg.includes('column')
  ) {
    return `Falta la columna assembly_xt_path en Supabase. Ejecuta la migración ${BODEGA_ASSEMBLY_XT_PATH_MIGRATION} en el SQL Editor y recarga el esquema API.`
  }
  return null
}
