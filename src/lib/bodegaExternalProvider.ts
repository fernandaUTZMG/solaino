import { getSupabase } from './supabaseClient'

/** Proyecto en foto: el trabajo ya no se hace en este taller. */
export function isOtherWorkshopProject(status: string | null | undefined): boolean {
  return status === 'en_foto'
}

/** Texto del plan cuando el proyecto lo hace otro taller. Sin porcentajes inventados. */
export function otherWorkshopPlanNote(proveedor: string | null | undefined): { place: string; close: string } {
  const name = (proveedor ?? '').trim()
  return {
    place: name ? `Se realiza en otro taller: ${name}.` : 'Se realiza en otro taller. Falta el nombre del taller.',
    close: 'El encargado o el admin lo finalizan a mano.',
  }
}

/** Vacío o cualquier nombre que incluya Solaino se desarrolla en este taller. */
export function isExternalBodegaProveedor(nombre: string | null | undefined): boolean {
  const folded = (nombre ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
  if (!folded) return false
  return !folded.includes('solaino')
}

export async function fetchLatestProjectProveedor(projectId: string): Promise<string> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('bodega_weekly_plan_items')
    .select('proveedor')
    .eq('project_id', projectId)
    .order('updated_at', { ascending: false })
    .limit(1)
  if (error || !data?.[0]) return ''
  return String(data[0].proveedor ?? '').trim()
}

/**
 * Si el proveedor del plan no es Solaino, el diseño ya se entregó y el reloj de diseño
 * ya se cerró, el proyecto pasa a la foto. No lo finaliza. Si no cumple, no hace nada.
 */
export async function tryFinalizeExternalProviderProject(projectId: string): Promise<boolean> {
  const sb = getSupabase()
  const { data, error } = await sb.rpc('bodega_try_finalize_external_provider_project', {
    p_project_id: projectId,
  })
  if (error) {
    const msg = [error.message, error.details, error.hint].filter(Boolean).join(' — ')
    if (/could not find|PGRST202|schema cache/i.test(msg)) return false
    throw new Error(msg || 'No se pudo pasar el proyecto a la foto')
  }
  return data === true
}

/** El diseño ya está. El proyecto no se hace en el taller: pasa a la foto y no se finaliza. */
export async function sendProjectToPhotoStage(projectId: string): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb.rpc('bodega_send_project_to_photo', { p_project_id: projectId })
  if (error) {
    const msg = [error.message, error.details, error.hint].filter(Boolean).join(' — ')
    if (/could not find|PGRST202|schema cache/i.test(msg)) {
      throw new Error(
        'Falta pasar el proyecto a la foto en Supabase. Ejecuta supabase/patch_bodega_send_project_to_photo.sql.',
      )
    }
    throw new Error(msg || 'No se pudo pasar el proyecto a la foto')
  }
}
