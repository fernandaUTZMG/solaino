import { createSignedUrlForBodegaStorage } from './bodegaObjectStorage'
import { getSupabase } from './supabaseClient'

export const BODEGA_PROYECTOS_BUCKET = 'bodega-proyectos'

export const DESIGN_PACKAGE_CATEGORY_MIGRATION_HINT =
  'En Supabase → SQL Editor ejecuta supabase/patch_design_version_package_category.sql, luego Settings → API → Reload schema si hace falta.'

let packageCategorySupportCache: { until: number; value: boolean } | null = null

/** Llamar tras aplicar la migración en caliente para no esperar al vencimiento del caché (p. ej. 2 s). */
export function invalidateProjectDesignVersionsPackageCategoryCache(): void {
  packageCategorySupportCache = null
}

/**
 * True si `select('package_category')` funciona (columna en BD y caché de PostgREST al día).
 * Cualquier error en ese probe se interpreta como «no usar package_category» en filtros/insert.
 */
export async function projectDesignVersionsSupportsPackageCategory(): Promise<boolean> {
  const now = Date.now()
  if (packageCategorySupportCache && packageCategorySupportCache.until > now) {
    return packageCategorySupportCache.value
  }
  const sb = getSupabase()
  const { error } = await sb.from('project_design_versions').select('package_category').limit(1)
  const value = !error
  packageCategorySupportCache = { until: now + 2000, value }
  return value
}

export type DesignVersionStatus =
  | 'subida'
  | 'en_revision'
  | 'requiere_cambios'
  | 'aprobada'
  | 'aprobada_parcial'

/** entrega_diseno = ZIP de entrega formal; info_cliente = referencia del supervisor para la diseñadora. */
export type DesignPackageCategory = 'entrega_diseno' | 'info_cliente'

export type AssemblyParseStatus = 'pending' | 'processing' | 'ok' | 'partial' | 'failed' | 'skipped'

export type ProjectDesignVersionRow = {
  id: string
  project_id: string
  version: number
  package_category: DesignPackageCategory
  zip_storage_path: string
  zip_filename: string
  status: DesignVersionStatus
  entry_html_path: string | null
  manifest: Record<string, unknown> | null
  comentarios: string | null
  uploaded_by: string | null
  created_at: string
  assembly_children?: Record<string, unknown> | null
  assembly_parse_status?: AssemblyParseStatus | null
  assembly_parse_error?: string | null
  assembly_parsed_at?: string | null
}

export async function fetchDesignVersions(projectId: string): Promise<ProjectDesignVersionRow[]> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('project_design_versions')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
  if (error) throw error
  const rows = (data as ProjectDesignVersionRow[] | null) ?? []
  return rows.map((r) => ({
    ...r,
    package_category: (r as { package_category?: DesignPackageCategory }).package_category ?? 'entrega_diseno',
  }))
}

export async function fetchNextDesignVersionNumber(
  projectId: string,
  packageCategory: DesignPackageCategory = 'entrega_diseno',
): Promise<number> {
  const sb = getSupabase()
  const usePkgCat = await projectDesignVersionsSupportsPackageCategory()

  if (!usePkgCat) {
    if (packageCategory === 'info_cliente') {
      throw new Error(
        `La API no puede usar «package_category» (falta la columna o hay que recargar el esquema). ${DESIGN_PACKAGE_CATEGORY_MIGRATION_HINT}`,
      )
    }
    const { data, error } = await sb
      .from('project_design_versions')
      .select('version')
      .eq('project_id', projectId)
      .order('version', { ascending: false })
      .limit(1)
    if (error) throw error
    const last = (data as Array<{ version?: number }> | null)?.[0]?.version
    return typeof last === 'number' && Number.isFinite(last) ? last + 1 : 1
  }

  const { data, error } = await sb
    .from('project_design_versions')
    .select('version')
    .eq('project_id', projectId)
    .eq('package_category', packageCategory)
    .order('version', { ascending: false })
    .limit(1)
  if (error) throw error
  const last = (data as Array<{ version?: number }> | null)?.[0]?.version
  return typeof last === 'number' && Number.isFinite(last) ? last + 1 : 1
}

export async function insertDesignVersion(payload: {
  projectId: string
  version: number
  packageCategory?: DesignPackageCategory
  zipStoragePath: string
  zipFilename: string
  status: DesignVersionStatus
  entryHtmlPath: string | null
  manifest: Record<string, unknown> | null
  comentarios: string | null
}): Promise<void> {
  const sb = getSupabase()
  const cat = payload.packageCategory ?? 'entrega_diseno'
  const row = {
    project_id: payload.projectId,
    version: payload.version,
    package_category: cat,
    zip_storage_path: payload.zipStoragePath,
    zip_filename: payload.zipFilename,
    status: payload.status,
    entry_html_path: payload.entryHtmlPath,
    manifest: payload.manifest,
    comentarios: payload.comentarios,
    uploaded_by: (await sb.auth.getUser()).data.user?.id ?? null,
  }
  const usePkgCat = await projectDesignVersionsSupportsPackageCategory()
  if (!usePkgCat) {
    if (cat === 'info_cliente') {
      throw new Error(
        `No se puede guardar «información del cliente» hasta que exista la columna «package_category» en la API. ${DESIGN_PACKAGE_CATEGORY_MIGRATION_HINT}`,
      )
    }
    const { package_category: _omit, ...legacy } = row
    void _omit
    const { error } = await sb.from('project_design_versions').insert(legacy)
    if (error) throw error
    invalidateProjectDesignVersionsPackageCategoryCache()
    return
  }
  const { error } = await sb.from('project_design_versions').insert(row)
  if (error) throw error
  invalidateProjectDesignVersionsPackageCategoryCache()
}

export async function updateDesignVersionZipPaths(args: {
  id: string
  zipStoragePath: string
  zipFilename: string
}): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb
    .from('project_design_versions')
    .update({ zip_storage_path: args.zipStoragePath, zip_filename: args.zipFilename })
    .eq('id', args.id)
  if (error) throw error
}

export async function updateDesignVersionStatus(args: {
  id: string
  status: DesignVersionStatus
  comentarios: string | null
}): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb
    .from('project_design_versions')
    .update({ status: args.status, comentarios: args.comentarios })
    .eq('id', args.id)
  if (error) throw error
}

export function designVersionHasApprovals(
  status: DesignVersionStatus,
): boolean {
  return status === 'aprobada' || status === 'aprobada_parcial'
}

/** Todas las entregas de diseño aprobadas (total o parcial), de menor a mayor versión. */
export function approvedDesignEntregaVersions<
  T extends Pick<ProjectDesignVersionRow, 'status' | 'version' | 'package_category'>,
>(versions: T[]): T[] {
  return versions
    .filter(
      (v) =>
        (v.package_category ?? 'entrega_diseno') === 'entrega_diseno' &&
        designVersionHasApprovals(v.status),
    )
    .sort((a, b) => a.version - b.version)
}

/** Versión de entrega con piezas aprobadas (total o parcial). */
export function latestApprovedDesignEntregaVersion<
  T extends Pick<ProjectDesignVersionRow, 'status' | 'version' | 'package_category'>,
>(versions: T[]): T | null {
  const approved = approvedDesignEntregaVersions(versions)
  if (approved.length === 0) return null
  return approved[approved.length - 1]!
}

/** Etiqueta para UI cuando hay una o varias entregas aprobadas. */
export function approvedDesignZipSummary<
  T extends Pick<ProjectDesignVersionRow, 'version' | 'zip_filename'>,
>(versions: T[]): { version: number; zipFilename: string; versionCount: number } {
  if (versions.length === 0) return { version: 0, zipFilename: '', versionCount: 0 }
  if (versions.length === 1) {
    const v = versions[0]!
    return { version: v.version, zipFilename: v.zip_filename, versionCount: 1 }
  }
  const nums = versions.map((v) => `v${v.version}`).join(', ')
  const latest = versions[versions.length - 1]!
  return {
    version: latest.version,
    zipFilename: `${versions.length} entregas (${nums})`,
    versionCount: versions.length,
  }
}

/** Versiones formales de diseño aún en cola de revisión del supervisor. */
export function designEntregaVersionsPendingReview<T extends Pick<ProjectDesignVersionRow, 'status' | 'version' | 'package_category'>>(
  versions: T[],
): T[] {
  return versions.filter(
    (v) => (v.package_category ?? 'entrega_diseno') === 'entrega_diseno' && v.status === 'en_revision',
  )
}

/** La siguiente entrega a revisar: la de menor número de versión (FIFO). */
export function nextDesignVersionPendingReview<T extends Pick<ProjectDesignVersionRow, 'status' | 'version' | 'package_category' | 'id'>>(
  versions: T[],
): T | null {
  const pending = designEntregaVersionsPendingReview(versions)
  if (pending.length === 0) return null
  return [...pending].sort((a, b) => a.version - b.version)[0]!
}

/** Al subir una versión nueva, las anteriores en revisión quedan obsoletas. */
export async function supersedeOlderPendingDesignVersions(
  projectId: string,
  keepVersion: number,
): Promise<number> {
  const sb = getSupabase()
  const { data, error } = await sb.rpc('bodega_supersede_older_design_revisions', {
    p_project_id: projectId,
    p_keep_version: keepVersion,
  })
  if (error) {
    const pending = await fetchDesignVersions(projectId)
    const older = designEntregaVersionsPendingReview(pending).filter((v) => v.version < keepVersion)
    for (const v of older) {
      await updateDesignVersionStatus({
        id: v.id,
        status: 'subida',
        comentarios: v.comentarios?.trim() || `Reemplazada por versión ${keepVersion}`,
      })
    }
    return older.length
  }
  return typeof data === 'number' ? data : Number(data) || 0
}

/** Tras aprobar o devolver una versión, cierra otras entregas aún en revisión del mismo proyecto. */
export async function closeOtherPendingDesignVersions(
  projectId: string,
  exceptVersionId: string,
  labelVersion: number,
): Promise<void> {
  const all = await fetchDesignVersions(projectId)
  const others = designEntregaVersionsPendingReview(all).filter((v) => v.id !== exceptVersionId)
  for (const v of others) {
    await updateDesignVersionStatus({
      id: v.id,
      status: 'subida',
      comentarios: v.comentarios?.trim() || `Cerrada al resolver versión ${labelVersion}`,
    })
  }
}

export async function createSignedUrlForDesignZip(storagePath: string, expiresSec = 3600): Promise<string | null> {
  return createSignedUrlForBodegaStorage(BODEGA_PROYECTOS_BUCKET, storagePath, expiresSec)
}

