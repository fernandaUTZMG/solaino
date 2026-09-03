import {
  normalizePrioridadNivel,
  type ProjectPrioridadNivel,
} from './bodegaProjectPrioridad'
import { getSupabase } from './supabaseClient'

export async function updateBodegaProjectPrioridadNivel(args: {
  projectId: string
  previousNivel: ProjectPrioridadNivel
  newNivel: ProjectPrioridadNivel
}): Promise<void> {
  const sb = getSupabase()
  const nivel = normalizePrioridadNivel(args.newNivel)
  const prev = normalizePrioridadNivel(args.previousNivel)

  let upErr = (await sb.from('bodega_projects').update({ prioridad_nivel: nivel }).eq('id', args.projectId))
    .error
  if (upErr && /prioridad_nivel/i.test([upErr.message, upErr.details].filter(Boolean).join(' '))) {
    upErr = (await sb.from('bodega_projects').update({ prioridad: nivel > 0 }).eq('id', args.projectId)).error
  }
  if (upErr) throw upErr

  if (prev === nivel) return

  const { error: rpcErr } = await sb.rpc('notify_bodega_project_prioridad_change', {
    p_project_id: args.projectId,
    p_old_nivel: prev,
    p_new_nivel: nivel,
  })
  if (rpcErr) {
    const msg = [rpcErr.message, rpcErr.details].filter(Boolean).join(' ')
    if (/notify_bodega_project_prioridad|app_notifications|function.*does not exist|PGRST202/i.test(msg)) {
      console.warn(
        'Avisos de prioridad no configurados. Ejecuta supabase/patch_app_notifications.sql en Supabase.',
      )
      return
    }
    throw rpcErr
  }
}
