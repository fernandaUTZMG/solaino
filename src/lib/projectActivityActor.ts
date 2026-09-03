import { isAppRole, roleLabel } from './roles'
import { fetchMyProfile, type MyProfile } from './auth'
import { getSupabase } from './supabaseClient'
import type { ProjectActivityRow } from './projectActivityRepo'

let activityLabelsRpcMissingWarned = false

function isActivityLabelsRpcMissing(err: unknown): boolean {
  if (err == null || typeof err !== 'object') return false
  const e = err as { code?: string; message?: string }
  const code = (e.code ?? '').trim()
  const msg = (e.message ?? '').toLowerCase()
  return (
    code === 'PGRST202' ||
    /could not find the function/i.test(msg) ||
    /schema cache/i.test(msg)
  )
}

/** Etiqueta corta para el historial (quién escribió la nota). */
export function shortRoleLabel(role: string): string {
  switch (role) {
    case 'disenadora':
      return 'Diseñadora'
    case 'programadora_maquinaria':
      return 'Programadora'
    case 'encargado':
      return 'Encargado'
    case 'admin':
      return 'Administrador'
    case 'operador_bodega':
      return 'Operador taller'
    case 'user':
      return 'Usuario inventario'
    default:
      return roleLabel(isAppRole(role) ? role : 'user')
  }
}

export function formatActivityAuthorLine(role: string | null | undefined, username?: string | null): string {
  const r = role?.trim()
  if (!r) return 'Sin rol registrado'
  const name = username?.trim()
  const rolePart = shortRoleLabel(r)
  return name ? `${rolePart} · ${name}` : rolePart
}

function payloadActorFields(payload: Record<string, unknown> | null): {
  role: string | null
  username: string | null
} {
  if (!payload) return { role: null, username: null }
  const role =
    typeof payload.actor_role === 'string'
      ? payload.actor_role
      : typeof payload.uploader_role === 'string'
        ? payload.uploader_role
        : null
  const username = typeof payload.actor_username === 'string' ? payload.actor_username : null
  return { role, username }
}

/** Campos que se guardan en `payload` al insertar actividad. */
export async function activityActorPayloadFields(): Promise<{
  actor_role: string
  actor_username: string | null
}> {
  const profile = await fetchMyProfile()
  return {
    actor_role: profile?.role ?? 'user',
    actor_username: profile?.username?.trim() || null,
  }
}

export async function fetchActivityActorLabels(actorIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(actorIds.map((x) => String(x).trim()).filter(Boolean))]
  const out = new Map<string, string>()
  if (ids.length === 0) return out

  const sb = getSupabase()
  const { data, error } = await sb.rpc('bodega_activity_display_labels', { p_user_ids: ids })
  if (!error && Array.isArray(data)) {
    for (const row of data as Array<{ id?: string; display_label?: string }>) {
      const id = row.id?.trim()
      const label = row.display_label?.trim()
      if (id && label) out.set(id, label)
    }
    if (out.size > 0) return out
  } else if (error) {
    if (isActivityLabelsRpcMissing(error)) {
      if (!activityLabelsRpcMissingWarned) {
        activityLabelsRpcMissingWarned = true
        console.warn(
          '[bodega_activity_display_labels] Falta en Supabase. Ejecuta supabase/patch_bodega_activity_actor_labels.sql y recarga el esquema API. Mientras tanto se usan perfiles visibles por RLS.',
        )
      }
    } else {
      console.warn('[bodega_activity_display_labels]', error)
    }
  }

  // Respaldo: solo perfiles visibles por RLS (normalmente el propio usuario).
  const { data: profiles } = await sb.from('profiles').select('id, username, role').in('id', ids)
  for (const row of (profiles as Array<{ id: string; username?: string | null; role?: string }> | null) ?? []) {
    out.set(row.id, formatActivityAuthorLine(row.role, row.username))
  }
  return out
}

export type ActivityAuthorContext = {
  profileLabels: Map<string, string>
  myUserId?: string | null
  myProfile?: MyProfile | null
}

export function activityAuthorDisplayLabel(
  activity: ProjectActivityRow,
  ctx: ActivityAuthorContext | Map<string, string>,
): string {
  const profileLabels = ctx instanceof Map ? ctx : ctx.profileLabels
  const myUserId = ctx instanceof Map ? null : ctx.myUserId
  const myProfile = ctx instanceof Map ? null : ctx.myProfile

  const payload = activity.payload as Record<string, unknown> | null
  const { role: actorRole, username: actorUsername } = payloadActorFields(payload)

  if (actorRole?.trim()) return formatActivityAuthorLine(actorRole, actorUsername)

  if (myUserId && activity.actor_id === myUserId && myProfile) {
    return formatActivityAuthorLine(myProfile.role, myProfile.username)
  }

  if (activity.actor_id && profileLabels.has(activity.actor_id)) {
    return profileLabels.get(activity.actor_id)!
  }

  return 'Sin rol registrado'
}
