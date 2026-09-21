import { getSupabase } from './supabaseClient'

export const BODEGA_DESIGN_ENTREGA_CONFIRMADA_PATCH =
  'supabase/patch_bodega_design_entrega_confirmada.sql'

/** Avisa a diseñadoras que el encargado confirmó su entrega. No bloquea si falta el RPC. */
export async function notifyDesignerDesignEntregaConfirmada(args: {
  projectId: string
  designVersionId?: string | null
  filename?: string | null
  version?: number | null
}): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb.rpc('notify_bodega_design_entrega_confirmada', {
    p_project_id: args.projectId,
    p_design_version_id: args.designVersionId ?? null,
    p_filename: args.filename ?? null,
    p_version: args.version ?? null,
  })
  if (!error) return
  const msg = [error.message, error.details].filter(Boolean).join(' ')
  if (
    /notify_bodega_design_entrega_confirmada|app_notifications|function.*does not exist|PGRST202|PGRST205|42P01/i.test(
      msg,
    )
  ) {
    return
  }
}
