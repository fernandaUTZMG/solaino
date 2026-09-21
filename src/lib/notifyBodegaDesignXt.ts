import { getSupabase } from './supabaseClient'

export const BODEGA_DESIGN_XT_NOTIFICATIONS_PATCH = 'supabase/patch_bodega_design_xt_notifications.sql'

/** Avisa a programadoras que hay un ensamble .x_t nuevo. Si falta el RPC, no bloquea la subida. */
export async function notifyProgrammersDesignXtUploaded(args: {
  projectId: string
  filename: string
  pieceCount: number
}): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb.rpc('notify_bodega_design_xt_uploaded', {
    p_project_id: args.projectId,
    p_filename: args.filename,
    p_piece_count: args.pieceCount,
  })
  if (!error) return
  const msg = [error.message, error.details].filter(Boolean).join(' ')
  if (
    /notify_bodega_design_xt_uploaded|app_notifications|function.*does not exist|PGRST202|PGRST205|42P01/i.test(
      msg,
    )
  ) {
    return
  }
}
