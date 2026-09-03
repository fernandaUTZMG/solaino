import { getSupabase } from './supabaseClient'

export const BODEGA_DESIGN_FOLDER_CONFIRM_PATCH = 'supabase/patch_bodega_design_folder_confirm.sql'

export type DesignConfirmedFolderRow = {
  id: string
  project_id: string
  design_version_id: string
  folder_key: string
  confirmed_at: string
  confirmed_by: string | null
}

export async function fetchDesignConfirmedFolders(projectId: string): Promise<DesignConfirmedFolderRow[]> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('design_confirmed_folders')
    .select('id, project_id, design_version_id, folder_key, confirmed_at, confirmed_by')
    .eq('project_id', projectId)
    .order('confirmed_at', { ascending: true })

  if (error) {
    const msg = [error.message, error.details].filter(Boolean).join(' ')
    if (/does not exist|could not find|PGRST205/i.test(msg)) {
      throw new Error(
        `Falta la tabla de carpetas confirmadas. Ejecuta ${BODEGA_DESIGN_FOLDER_CONFIRM_PATCH} en Supabase y recarga el esquema API.`,
      )
    }
    throw error
  }
  return (data as DesignConfirmedFolderRow[] | null) ?? []
}

export function confirmedFolderKeySetForVersion(
  rows: DesignConfirmedFolderRow[],
  designVersionId: string,
): Set<string> {
  return new Set(rows.filter((r) => r.design_version_id === designVersionId).map((r) => r.folder_key))
}

export async function confirmDesignFolders(args: {
  designVersionId: string
  folderKeys: string[]
  comment?: string | null
  reject?: boolean
}): Promise<{ versionStatus: string; projectStatus: string; confirmedCount: number }> {
  const sb = getSupabase()
  const { data, error } = await sb.rpc('bodega_confirm_design_folders', {
    p_design_version_id: args.designVersionId,
    p_folder_keys: args.folderKeys,
    p_comment: args.comment ?? null,
    p_reject: args.reject ?? false,
  })

  if (error) {
    const msg = [error.message, error.details].filter(Boolean).join(' ')
    if (/bodega_confirm_design_folders|function.*does not exist/i.test(msg)) {
      throw new Error(
        `Falta la migración de confirmación de carpetas. Ejecuta ${BODEGA_DESIGN_FOLDER_CONFIRM_PATCH} en Supabase.`,
      )
    }
    throw new Error(msg)
  }

  const o = (data ?? {}) as Record<string, unknown>
  return {
    versionStatus: String(o.version_status ?? ''),
    projectStatus: String(o.project_status ?? ''),
    confirmedCount: Number(o.confirmed_count) || 0,
  }
}
