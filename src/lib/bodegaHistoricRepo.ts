import { getSupabase } from './supabaseClient'
import type { BodegaHistoricoArea } from './bodegaHistoricTypes'
import { historicoAreaPrefix } from './bodegaHistoricTypes'
import { sanitizeStorageFileName } from './bodegaOrdenes'

export type BodegaHistoricFileRow = {
  id: string
  area: BodegaHistoricoArea
  storagePath: string
  displayName: string
  folio: string | null
  notes: string | null
  fileSize: number | null
  contentType: string | null
  uploadedBy: string | null
  createdAt: string
}

export const BODEGA_HISTORICO_PATCH = 'supabase/patch_bodega_historico.sql'

function mapRow(r: Record<string, unknown>): BodegaHistoricFileRow {
  return {
    id: String(r.id),
    area: r.area === 'programacion' ? 'programacion' : 'disenadora',
    storagePath: String(r.storage_path ?? ''),
    displayName: String(r.display_name ?? ''),
    folio: r.folio != null && String(r.folio).trim() ? String(r.folio).trim() : null,
    notes: r.notes != null && String(r.notes).trim() ? String(r.notes).trim() : null,
    fileSize: typeof r.file_size === 'number' ? r.file_size : r.file_size != null ? Number(r.file_size) : null,
    contentType: r.content_type != null ? String(r.content_type) : null,
    uploadedBy: r.uploaded_by != null ? String(r.uploaded_by) : null,
    createdAt: String(r.created_at ?? ''),
  }
}

function isHistoricTableMissing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  const msg = String(error.message ?? '').toLowerCase()
  return error.code === 'PGRST205' || error.code === '42P01' || msg.includes('bodega_historic_files')
}

function isHistoricPermissionDenied(error: { code?: string; message?: string }): boolean {
  const msg = String(error.message ?? '')
  return error.code === '42501' || /403|permission|policy/i.test(msg)
}

export function historicTableMissingMessage(): string {
  return `Falta la tabla de histórico en Supabase. Ejecuta ${BODEGA_HISTORICO_PATCH} en el SQL Editor y luego Settings → API → Reload schema.`
}

export async function fetchHistoricFiles(area: BodegaHistoricoArea): Promise<BodegaHistoricFileRow[]> {
  const sb = getSupabase()
  const pageSize = 1000
  const out: BodegaHistoricFileRow[] = []
  const selectCols =
    'id, area, storage_path, display_name, folio, notes, file_size, content_type, uploaded_by, created_at'

  for (let from = 0; from < 20_000; from += pageSize) {
    const { data, error } = await sb
      .from('bodega_historic_files')
      .select(selectCols)
      .eq('area', area)
      .order('storage_path', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) {
      if (isHistoricTableMissing(error)) throw new Error(historicTableMissingMessage())
      throw error
    }
    const chunk = ((data as Record<string, unknown>[]) ?? []).map(mapRow)
    out.push(...chunk)
    if (chunk.length < pageSize) break
  }
  return out
}

export function buildHistoricStoragePath(
  area: BodegaHistoricoArea,
  fileName: string,
  subfolder?: string | null,
): string {
  const safe = sanitizeStorageFileName(fileName)
  const folder = subfolder?.trim().replace(/^\/+|\/+$/g, '').replace(/\.\./g, '')
  const mid = folder ? `${folder}/` : ''
  return `${historicoAreaPrefix(area)}${mid}${crypto.randomUUID()}-${safe}`
}

export async function registerHistoricFile(args: {
  area: BodegaHistoricoArea
  storagePath: string
  displayName: string
  folio?: string | null
  notes?: string | null
  fileSize?: number | null
  contentType?: string | null
  /** Si ya existe la misma ruta, actualiza metadatos (re-subida de carpeta). */
  replaceIfExists?: boolean
}): Promise<BodegaHistoricFileRow> {
  const sb = getSupabase()
  const uid = (await sb.auth.getUser()).data.user?.id ?? null
  const row = {
    area: args.area,
    storage_path: args.storagePath,
    display_name: args.displayName,
    folio: args.folio?.trim() || null,
    notes: args.notes?.trim() || null,
    file_size: args.fileSize ?? null,
    content_type: args.contentType ?? null,
    uploaded_by: uid,
  }
  if (args.replaceIfExists) {
    const { data, error } = await sb
      .from('bodega_historic_files')
      .upsert(row, { onConflict: 'storage_path' })
      .select(
        'id, area, storage_path, display_name, folio, notes, file_size, content_type, uploaded_by, created_at',
      )
      .single()
    if (error) {
      if (isHistoricPermissionDenied(error)) {
        throw new Error(
          `Sin permiso para registrar en histórico (403). Ejecuta en Supabase patch_bodega_historico_roles.sql y recarga el esquema API.`,
        )
      }
      throw error
    }
    return mapRow(data as Record<string, unknown>)
  }
  const { data, error } = await sb
    .from('bodega_historic_files')
    .insert({
      area: args.area,
      storage_path: args.storagePath,
      display_name: args.displayName,
      folio: args.folio?.trim() || null,
      notes: args.notes?.trim() || null,
      file_size: args.fileSize ?? null,
      content_type: args.contentType ?? null,
      uploaded_by: uid,
    })
    .select(
      'id, area, storage_path, display_name, folio, notes, file_size, content_type, uploaded_by, created_at',
    )
    .single()
  if (error) {
    if (isHistoricPermissionDenied(error)) {
      throw new Error(
        `Sin permiso para registrar en histórico (403). Ejecuta en Supabase patch_bodega_historico_roles.sql y recarga el esquema API.`,
      )
    }
    throw error
  }
  return mapRow(data as Record<string, unknown>)
}

export async function deleteHistoricFileRecord(id: string): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb.from('bodega_historic_files').delete().eq('id', id)
  if (error) throw error
}
