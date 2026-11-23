import { getSupabase } from './supabaseClient'

/** Proyecto en foto: el trabajo ya no se hace en este taller. */
export function isOtherWorkshopProject(status: string | null | undefined): boolean {
  return status === 'en_foto'
}

/**
 * El plan deja de mostrar porcentajes de este taller cuando el proveedor no es Solaino,
 * o cuando el proyecto ya está en foto. Un proyecto entregado sigue en verde.
 */
export function isWeeklyPlanExternalShop(args: {
  projectStatus: string | null | undefined
  proveedor: string | null | undefined
  projectTerminado: boolean
}): boolean {
  if (args.projectTerminado) return false
  return isOtherWorkshopProject(args.projectStatus) || isExternalBodegaProveedor(args.proveedor)
}

/** Texto del plan cuando el proyecto lo hace otro taller. Sin porcentajes inventados. */
export function otherWorkshopPlanNote(proveedor: string | null | undefined): { place: string; close: string } {
  const name = (proveedor ?? '').trim()
  return {
    place: name ? `Se realiza en otro taller: ${name}.` : 'Se realiza en otro taller. Falta el nombre del taller.',
    close: 'El encargado o el admin lo finalizan a mano.',
  }
}

function foldedProveedor(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/** Una letra de más, de menos o cambiada. Cubre «soliaino» como Solaino. */
function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true
  if (Math.abs(a.length - b.length) > 1) return false
  let i = 0
  let j = 0
  let edits = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1
      j += 1
      continue
    }
    edits += 1
    if (edits > 1) return false
    if (a.length > b.length) i += 1
    else if (b.length > a.length) j += 1
    else {
      i += 1
      j += 1
    }
  }
  if (i < a.length || j < b.length) edits += 1
  return edits <= 1
}

function looksLikeSolaino(folded: string): boolean {
  if (folded.includes('solaino')) return true
  return folded.split(/[^a-z0-9]+/).some((token) => token.length > 0 && withinOneEdit(token, 'solaino'))
}

/** Vacío o Solaino (también con una letra mal escrita) se desarrolla en este taller. */
export function isExternalBodegaProveedor(nombre: string | null | undefined): boolean {
  const folded = foldedProveedor(nombre ?? '')
  if (!folded) return false
  return !looksLikeSolaino(folded)
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
 * Si el proveedor del plan no es Solaino, el proyecto pasa a la foto.
 * No lo finaliza. Vacío o Solaino no lo mueve.
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
