import { getSupabase } from './supabaseClient'
import { projectDesignVersionsSupportsPackageCategory } from './designVersionsRepo'

export type PendingDeliveryReviewItem = {
  kind: 'design' | 'machine'
  versionId: string
  projectId: string
  folio: string | null
  version: number
  zipFilename: string
  createdAt: string
}

function folioFromJoin(row: unknown): string | null {
  const rel = (row as { bodega_projects?: { folio?: string } | { folio?: string }[] | null }).bodega_projects
  if (!rel) return null
  if (Array.isArray(rel)) return rel[0]?.folio ?? null
  return rel.folio ?? null
}

/** Entregas ZIP en «en revisión» que admin o supervisor deben aprobar o devolver. */
export async function fetchPendingDeliveryReviewsForSupervisors(): Promise<PendingDeliveryReviewItem[]> {
  const sb = getSupabase()
  const usePkgCat = await projectDesignVersionsSupportsPackageCategory()
  const designBase = sb
    .from('project_design_versions')
    .select('id, version, zip_filename, created_at, project_id, bodega_projects(folio)')
    .eq('status', 'en_revision')
  const designQ = usePkgCat ? designBase.eq('package_category', 'entrega_diseno') : designBase

  const [dRes, mRes] = await Promise.all([
    designQ.order('created_at', { ascending: false }).limit(50),
    sb
      .from('project_machine_versions')
      .select('id, version, zip_filename, created_at, project_id, bodega_projects(folio)')
      .eq('status', 'en_revision')
      .order('created_at', { ascending: false })
      .limit(50),
  ])
  if (dRes.error) throw dRes.error
  if (mRes.error) throw mRes.error

  const designRows = (dRes.data ?? []) as Array<{
    id: string
    version: number
    zip_filename: string
    created_at: string
    project_id: string
  }>
  const machineRows = (mRes.data ?? []) as Array<{
    id: string
    version: number
    zip_filename: string
    created_at: string
    project_id: string
  }>

  const designItems: PendingDeliveryReviewItem[] = designRows.map((r) => ({
    kind: 'design' as const,
    versionId: r.id,
    projectId: r.project_id,
    folio: folioFromJoin(r),
    version: r.version,
    zipFilename: r.zip_filename,
    createdAt: r.created_at,
  }))
  const machineItems: PendingDeliveryReviewItem[] = machineRows.map((r) => ({
    kind: 'machine' as const,
    versionId: r.id,
    projectId: r.project_id,
    folio: folioFromJoin(r),
    version: r.version,
    zipFilename: r.zip_filename,
    createdAt: r.created_at,
  }))

  const merged = [...designItems, ...machineItems].sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
  )

  // Diseño: una notificación por proyecto (la versión más antigua aún en revisión).
  const designByProject = new Map<string, PendingDeliveryReviewItem>()
  const machineOnly: PendingDeliveryReviewItem[] = []
  for (const item of merged) {
    if (item.kind !== 'design') {
      machineOnly.push(item)
      continue
    }
    const prev = designByProject.get(item.projectId)
    if (!prev || item.version < prev.version) {
      designByProject.set(item.projectId, item)
    }
  }

  return [...machineOnly, ...designByProject.values()].sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
  )
}
