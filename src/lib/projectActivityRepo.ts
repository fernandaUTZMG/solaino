import { getSupabase } from './supabaseClient'
import { activityActorPayloadFields } from './projectActivityActor'

export type ProjectActivityRow = {
  id: string
  project_id: string
  actor_id: string | null
  type: string
  payload: Record<string, unknown> | null
  created_at: string
}

export async function fetchProjectActivity(projectId: string, limit = 200): Promise<ProjectActivityRow[]> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('project_activity')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data as ProjectActivityRow[] | null) ?? []
}

const BATCH = 80

/** Actividad de varios proyectos (orden cronológico ascendente). Fragmenta `in()` para evitar URLs enormes. */
export async function fetchProjectActivityForProjects(projectIds: string[], limitTotal = 8000): Promise<ProjectActivityRow[]> {
  const ids = Array.from(new Set(projectIds.map((x) => String(x).trim()).filter(Boolean)))
  if (ids.length === 0) return []

  const sb = getSupabase()
  const out: ProjectActivityRow[] = []
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH)
    const { data, error } = await sb
      .from('project_activity')
      .select('*')
      .in('project_id', chunk)
      .order('created_at', { ascending: true })
      .limit(Math.min(1000, limitTotal - out.length))
    if (error) throw error
    const rows = (data as ProjectActivityRow[] | null) ?? []
    out.push(...rows)
    if (out.length >= limitTotal) break
  }
  return out
}

export async function insertProjectActivity(payload: {
  projectId: string
  type: string
  payload: Record<string, unknown> | null
}): Promise<void> {
  const sb = getSupabase()
  const actor = await activityActorPayloadFields()
  const mergedPayload = {
    ...(payload.payload ?? {}),
    actor_role: actor.actor_role,
    ...(actor.actor_username ? { actor_username: actor.actor_username } : {}),
  }
  const { error } = await sb.from('project_activity').insert({
    project_id: payload.projectId,
    actor_id: (await sb.auth.getUser()).data.user?.id ?? null,
    type: payload.type,
    payload: mergedPayload,
  })
  if (error) throw error
}

