import type { BodegaWorkIntervalLane } from './bodegaWorkIntervalsRepo'
import { getSupabase } from './supabaseClient'
import { piecesPendingInCncModule } from './bodegaProgrammerFlow'
import type { BodegaProjectPieceRow } from './bodegaPiecesRepo'

export const BODEGA_DESIGN_FOLDER_CONFIRM_PATCH = 'supabase/patch_bodega_design_folder_confirm.sql'

/** Cierra el intervalo abierto del carril indicado. */
export async function closeWorkInterval(projectId: string, lane: BodegaWorkIntervalLane): Promise<void> {
  const sb = getSupabase()
  const endedAt = new Date().toISOString()
  // Nombre histórico del parámetro en Postgres: p_end
  const { error } = await sb.rpc('bodega_work_interval_close_open', {
    p_project_id: projectId,
    p_lane: lane,
    p_end: endedAt,
  })
  if (!error) return

  const msg = [error.message, error.details].filter(Boolean).join(' ')
  // Firma con p_ended_at (parche intermedio) o solo 2 args
  if (/p_end|p_ended_at|Could not find the function|PGRST202/i.test(msg)) {
    const retryEndedAt = await sb.rpc('bodega_work_interval_close_open', {
      p_project_id: projectId,
      p_lane: lane,
      p_ended_at: endedAt,
    })
    if (!retryEndedAt.error) return

    const retry = await sb.rpc('bodega_work_interval_close_open', {
      p_project_id: projectId,
      p_lane: lane,
    })
    if (!retry.error) return
  }

  // Fallback: cerrar filas abiertas directo (por si el RPC falla o no existe)
  const { error: updErr } = await sb
    .from('bodega_project_work_intervals')
    .update({ ended_at: endedAt })
    .eq('project_id', projectId)
    .eq('lane', lane)
    .is('ended_at', null)

  if (updErr) {
    if (/bodega_work_interval_close_open|function.*does not exist/i.test(msg)) {
      throw new Error(`No se pudo cerrar el reloj (${lane}). Revisa migraciones de intervalos en Supabase.`)
    }
    throw updErr
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

/**
 * Si ya no hay piezas CNC pendientes de programar, cierra el reloj de oficina.
 * Devuelve true si cerró (o no había nada abierto).
 */
export async function closeProgrammingOfficeClockIfComplete(args: {
  projectId: string
  pieces: BodegaProjectPieceRow[]
}): Promise<boolean> {
  const pending = piecesPendingInCncModule(args.pieces, 'programacion')
  if (pending.length > 0) return false
  await closeWorkInterval(args.projectId, 'cnc_programacion')
  // Torno ya no se programa, pero por si quedó un intervalo abierto viejo:
  await closeWorkInterval(args.projectId, 'cnc_torno').catch(() => undefined)
  return true
}
