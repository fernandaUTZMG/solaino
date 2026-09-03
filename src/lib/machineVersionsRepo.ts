import { getSupabase } from './supabaseClient'

export type MachineVersionStatus = 'subida' | 'en_revision' | 'requiere_cambios' | 'aprobada'

export type CncModuleKind = 'programacion' | 'torno' | 'perfilado'

export type ProjectMachineVersionRow = {
  id: string
  project_id: string
  version: number
  cnc_module: CncModuleKind
  zip_storage_path: string
  zip_filename: string
  status: MachineVersionStatus
  entry_html_path: string | null
  manifest: Record<string, unknown> | null
  comentarios: string | null
  uploaded_by: string | null
  created_at: string
}

function normalizeMachineRow(r: ProjectMachineVersionRow): ProjectMachineVersionRow {
  const m = (r as { cnc_module?: string }).cnc_module
  const cnc_module: CncModuleKind =
    m === 'torno' || m === 'perfilado' || m === 'programacion' ? m : 'programacion'
  return { ...r, cnc_module }
}

export async function fetchMachineVersions(projectId: string): Promise<ProjectMachineVersionRow[]> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('project_machine_versions')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
  if (error) throw error
  const list = (data as ProjectMachineVersionRow[] | null) ?? []
  return list.map(normalizeMachineRow)
}

export async function fetchNextMachineVersionNumber(
  projectId: string,
  cncModule: CncModuleKind = 'programacion',
): Promise<number> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('project_machine_versions')
    .select('version')
    .eq('project_id', projectId)
    .eq('cnc_module', cncModule)
    .order('version', { ascending: false })
    .limit(1)
  if (error) throw error
  const last = (data as Array<{ version?: number }> | null)?.[0]?.version
  return typeof last === 'number' && Number.isFinite(last) ? last + 1 : 1
}

export async function insertMachineVersion(payload: {
  projectId: string
  version: number
  cncModule?: CncModuleKind
  zipStoragePath: string
  zipFilename: string
  status: MachineVersionStatus
  entryHtmlPath: string | null
  manifest: Record<string, unknown> | null
  comentarios: string | null
}): Promise<void> {
  const sb = getSupabase()
  const cncModule = payload.cncModule ?? 'programacion'
  const { error } = await sb.from('project_machine_versions').insert({
    project_id: payload.projectId,
    version: payload.version,
    cnc_module: cncModule,
    zip_storage_path: payload.zipStoragePath,
    zip_filename: payload.zipFilename,
    status: payload.status,
    entry_html_path: payload.entryHtmlPath,
    manifest: payload.manifest,
    comentarios: payload.comentarios,
    uploaded_by: (await sb.auth.getUser()).data.user?.id ?? null,
  })
  if (error) throw error
}

export async function updateMachineVersionZipPaths(args: {
  id: string
  zipStoragePath: string
  zipFilename: string
}): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb
    .from('project_machine_versions')
    .update({ zip_storage_path: args.zipStoragePath, zip_filename: args.zipFilename })
    .eq('id', args.id)
  if (error) throw error
}

export async function updateMachineVersionStatus(args: {
  id: string
  status: MachineVersionStatus
  comentarios: string | null
}): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb
    .from('project_machine_versions')
    .update({ status: args.status, comentarios: args.comentarios })
    .eq('id', args.id)
  if (error) throw error
}
