import { fetchOrdenesCompra, type OrdenCompraRow } from './bodegaOrdenes'
import { fetchPieceIntervalsForProjects } from './bodegaPieceIntervalsRepo'
import {
  computeProjectOrdenTimes,
  sumOrdenTimeBreakdowns,
  type ProjectOrdenTimeBreakdown,
} from './bodegaProjectOrdenTimes'
import { fetchAllBodegaProjectsForReportes, type BodegaProjectListRow } from './bodegaProjectsRepo'
import { fetchProjectActivityForProjects, type ProjectActivityRow } from './projectActivityRepo'
import { fetchMyProfile } from './auth'
import { getSupabase } from './supabaseClient'
import { activityAuthorDisplayLabel, fetchActivityActorLabels } from './projectActivityActor'
import { fetchWorkIntervalsForProjects } from './bodegaWorkIntervalsRepo'

export type ProjectActivityNote = {
  id: string
  created_at: string
  type: string
  typeLabel: string
  authorLabel: string
  comment: string
}

const NOTE_TYPE_LABELS: Record<string, string> = {
  project_note: 'Nota',
  avance_manual: 'Avance manual',
  design_uploaded: 'ZIP diseño',
  design_approved: 'Diseño aprobado',
  design_revision_requested: 'Diseño — cambios',
  status_changed: 'Cambio de estado',
  machine_uploaded: 'ZIP programación',
}

function activityComment(payload: Record<string, unknown> | null): string | null {
  if (!payload) return null
  const c = payload.comment
  return typeof c === 'string' && c.trim() ? c.trim() : null
}

function extractNotes(
  activities: ProjectActivityRow[],
  authorCtx: { profileLabels: Map<string, string>; myUserId: string | null; myProfile: Awaited<ReturnType<typeof fetchMyProfile>> },
): ProjectActivityNote[] {
  const out: ProjectActivityNote[] = []
  for (const a of activities) {
    const payload = a.payload as Record<string, unknown> | null
    const comment = activityComment(payload)
    if (!comment && a.type !== 'status_changed') continue
    if (a.type === 'status_changed') {
      const st = payload?.status
      if (typeof st !== 'string' || !st.trim()) continue
      out.push({
        id: a.id,
        created_at: a.created_at,
        type: a.type,
        typeLabel: NOTE_TYPE_LABELS[a.type] ?? a.type,
        authorLabel: activityAuthorDisplayLabel(a, authorCtx),
        comment: `Estado: ${st}`,
      })
      continue
    }
    if (!comment) continue
    out.push({
      id: a.id,
      created_at: a.created_at,
      type: a.type,
      typeLabel: NOTE_TYPE_LABELS[a.type] ?? a.type,
      authorLabel: activityAuthorDisplayLabel(a, authorCtx),
      comment,
    })
  }
  return out.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
}

export type BodegaProjectReportRow = {
  project: BodegaProjectListRow
  times: ProjectOrdenTimeBreakdown
  activityNotes: ProjectActivityNote[]
}

export type BodegaOcReportGroup = {
  key: string
  oc: OrdenCompraRow | null
  numero: string
  empresaNombre: string
  solicitante: string
  ocFecha: string | null
  projects: BodegaProjectReportRow[]
  timesSum: ProjectOrdenTimeBreakdown
  nProjects: number
  nTerminados: number
  avgAvancePct: number
}

export type BodegaReportesBundle = {
  projects: BodegaProjectReportRow[]
  ordenes: OrdenCompraRow[]
  ocGroups: BodegaOcReportGroup[]
  loadedAt: string
}

function ocGroupKey(p: BodegaProjectListRow): string {
  if (p.orden_compra_id && p.orden_compra_id.trim()) return `oc:${p.orden_compra_id}`
  const ord = String(p.orden ?? '')
    .trim()
    .toLowerCase()
  const cli = String(p.cliente ?? '')
    .trim()
    .toLowerCase()
  return `txt:${ord}__${cli}`
}

export async function fetchBodegaReportesBundle(): Promise<BodegaReportesBundle> {
  const now = new Date()
  const [projects, ordenes] = await Promise.all([
    fetchAllBodegaProjectsForReportes(),
    fetchOrdenesCompra().catch(() => [] as OrdenCompraRow[]),
  ])
  const ids = projects.map((p) => p.id)
  const [workByProject, pieceByProject, activities] = await Promise.all([
    fetchWorkIntervalsForProjects(ids),
    fetchPieceIntervalsForProjects(ids),
    fetchProjectActivityForProjects(ids, 12000),
  ])

  const activityByProject = new Map<string, ProjectActivityRow[]>()
  for (const a of activities) {
    const pid = a.project_id
    if (!activityByProject.has(pid)) activityByProject.set(pid, [])
    activityByProject.get(pid)!.push(a)
  }

  const actorIds = [...new Set(activities.map((a) => a.actor_id).filter((id): id is string => Boolean(id)))]
  const [actorLabels, authUser, myProfile] = await Promise.all([
    fetchActivityActorLabels(actorIds),
    getSupabase().auth.getUser(),
    fetchMyProfile(),
  ])
  const authorCtx = {
    profileLabels: actorLabels,
    myUserId: authUser.data.user?.id ?? null,
    myProfile,
  }

  const reportRows: BodegaProjectReportRow[] = projects.map((project) => ({
    project,
    times: computeProjectOrdenTimes({
      workIntervals: workByProject.get(project.id) ?? [],
      pieceIntervals: pieceByProject.get(project.id) ?? [],
      nowRef: now,
    }),
    activityNotes: extractNotes(activityByProject.get(project.id) ?? [], authorCtx),
  }))

  const ordenById = new Map(ordenes.map((o) => [o.id, o]))
  const groupMap = new Map<string, BodegaProjectReportRow[]>()
  for (const row of reportRows) {
    const k = ocGroupKey(row.project)
    if (!groupMap.has(k)) groupMap.set(k, [])
    groupMap.get(k)!.push(row)
  }

  const ocGroups: BodegaOcReportGroup[] = []
  for (const [key, items] of groupMap) {
    const ocId = key.startsWith('oc:') ? key.slice(3) : ''
    const oc = ocId ? ordenById.get(ocId) ?? null : null
    let sumPct = 0
    let nDone = 0
    for (const it of items) {
      sumPct += it.project.avance_pct
      if (it.project.status === 'terminado') nDone++
    }
    const timesSum = sumOrdenTimeBreakdowns(items.map((i) => i.times))
    ocGroups.push({
      key,
      oc,
      numero: (oc?.numero ?? items[0]?.project.orden?.trim()) || '—',
      empresaNombre: oc?.empresa?.nombre ?? items[0]?.project.empresa ?? items[0]?.project.cliente ?? '—',
      solicitante: oc?.requisitor?.nombre ?? items[0]?.project.cliente ?? '—',
      ocFecha: oc?.fecha ?? null,
      projects: items,
      timesSum,
      nProjects: items.length,
      nTerminados: nDone,
      avgAvancePct: items.length ? Math.round(sumPct / items.length) : 0,
    })
  }

  ocGroups.sort((a, b) => {
    const da = a.ocFecha ? new Date(a.ocFecha).getTime() : 0
    const db = b.ocFecha ? new Date(b.ocFecha).getTime() : 0
    return db - da || a.numero.localeCompare(b.numero, 'es', { numeric: true })
  })

  return {
    projects: reportRows,
    ordenes,
    ocGroups,
    loadedAt: now.toISOString(),
  }
}
