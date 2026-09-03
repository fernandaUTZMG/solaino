import type { BodegaWorkIntervalLane } from './bodegaWorkIntervalsRepo'
import { getSupabase } from './supabaseClient'

export const BODEGA_DESIGN_FOLDER_CONFIRM_PATCH = 'supabase/patch_bodega_design_folder_confirm.sql'

/** Cierra el intervalo abierto del carril indicado (p. ej. al subir entrega de programación). */
export async function closeWorkInterval(projectId: string, lane: BodegaWorkIntervalLane): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb.rpc('bodega_work_interval_close_open', {
    p_project_id: projectId,
    p_lane: lane,
  })
  if (error) {
    const msg = [error.message, error.details].filter(Boolean).join(' ')
    if (/bodega_work_interval_close_open|function.*does not exist/i.test(msg)) {
      throw new Error(`No se pudo cerrar el reloj (${lane}). Revisa migraciones de intervalos en Supabase.`)
    }
    throw error
  }
}

export async function closeProgrammingDeliveryClock(projectId: string): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb.rpc('bodega_close_programming_delivery_clock', {
    p_project_id: projectId,
  })
  if (error) {
    const msg = [error.message, error.details].filter(Boolean).join(' ')
    if (/bodega_close_programming_delivery_clock/i.test(msg)) {
      await closeWorkInterval(projectId, 'cnc_programacion')
      return
    }
    throw error
  }
}
