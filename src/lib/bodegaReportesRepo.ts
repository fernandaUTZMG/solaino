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
import type { BodegaProjectPieceRow } from './bodegaPiecesRepo'
import type { BodegaPieceIntervalRow } from './bodegaPieceIntervalsRepo'
import type { ProjectPiecePhotoRow } from './piecePhotosRepo'
import {
  buildReportAdvance,
  clipIntervalsToWindow,
  currentWorkWeekWindow,
  type ReportAdvance,
  type WorkWeekWindow,
} from './bodegaReportWeek'

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
  weekTimes: ProjectOrdenTimeBreakdown
  activityNotes: ProjectActivityNote[]
  advance: ReportAdvance
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
  weekTimesSum: ProjectOrdenTimeBreakdown
  nProjects: number
  nTerminados: number
  avgAvancePct: number
}

export type BodegaReportesBundle = {
  projects: BodegaProjectReportRow[]
  ordenes: OrdenCompraRow[]
  ocGroups: BodegaOcReportGroup[]
  loadedAt: string
  week: WorkWeekWindow
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

const PIECE_BATCH = 60

const PIECE_STAGE_SELECT =
  'id, project_id, programmer_bucket, programming_finished_at, programming_exit_kind, perfilado_completed_at, maquinado_completed_at, armado_completed_at, detallado_completed_at, post_maquinado_route, post_perfilado_programming_bucket'

function describeQueryError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message
  if (error && typeof error === 'object') {
    const e = error as { message?: unknown; hint?: unknown; details?: unknown }
    const parts = [e.message, e.hint, e.details].filter(
      (part): part is string => typeof part === 'string' && part.trim().length > 0,
    )
    if (parts.length > 0) return parts.join(' — ')
  }
  return 'No se pudieron cargar los reportes'
}

async function fetchReportPieces(projectIds: string[]): Promise<Map<string, BodegaProjectPieceRow[]>> {
  const m = new Map<string, BodegaProjectPieceRow[]>()
  if (projectIds.length === 0) return m
  const sb = getSupabase()
  for (let i = 0; i < projectIds.length; i += PIECE_BATCH) {
    const chunk = projectIds.slice(i, i + PIECE_BATCH)
    for (let from = 0; ; from += 1000) {
    let { data, error } = await sb
      .from('bodega_project_pieces')
      .select(PIECE_STAGE_SELECT)
      .in('project_id', chunk)
      .range(from, from + 999)
    if (error && /column|42703|PGRST204|schema cache/i.test([error.message, error.details].filter(Boolean).join(' '))) {
      const fallback = await sb.from('bodega_project_pieces').select('*').in('project_id', chunk).range(from, from + 999)
      data = fallback.data
      error = fallback.error
    }
    if (error) {
      const msg = [error.message, error.details].filter(Boolean).join(' ')
      if (/does not exist|could not find|404|PGRST205/i.test(msg)) return m
      throw new Error(describeQueryError(error))
    }
    const page = (data as BodegaProjectPieceRow[]) ?? []
    for (const row of page) {
      const pid = row.project_id
      if (!pid) continue
      if (!m.has(pid)) m.set(pid, [])
      m.get(pid)!.push(row)
    }
    if (page.length < 1000) break
    }
  }
  return m
}

async function fetchReportPhotos(projectIds: string[]): Promise<Map<string, ProjectPiecePhotoRow[]>> {
  const m = new Map<string, ProjectPiecePhotoRow[]>()
  if (projectIds.length === 0) return m
  const sb = getSupabase()
  for (let i = 0; i < projectIds.length; i += PIECE_BATCH) {
    const chunk = projectIds.slice(i, i + PIECE_BATCH)
    const full = await sb
      .from('project_piece_photos')
      .select('id, project_id, piece_id, storage_path, filename, uploaded_by, created_at')
      .in('project_id', chunk)
    let rows = (full.data as ProjectPiecePhotoRow[]) ?? []
    if (full.error) {
      const msg = [full.error.message, full.error.details].filter(Boolean).join(' ')
      if (/does not exist|could not find|404|PGRST205/i.test(msg)) return m
      if (!/piece_id|42703|PGRST204/i.test(msg)) throw new Error(describeQueryError(full.error))
      const legacy = await sb
        .from('project_piece_photos')
        .select('id, project_id, storage_path, filename, uploaded_by, created_at')
        .in('project_id', chunk)
      if (legacy.error) throw new Error(describeQueryError(legacy.error))
      rows = ((legacy.data as Omit<ProjectPiecePhotoRow, 'piece_id'>[]) ?? []).map((r) => ({ ...r, piece_id: null }))
    }
    for (const row of rows) {
      if (!m.has(row.project_id)) m.set(row.project_id, [])
      m.get(row.project_id)!.push(row)
    }
  }
  return m
}

async function fetchRoutesConfirmed(projectIds: string[]): Promise<Map<string, boolean>> {
  const m = new Map<string, boolean>()
  if (projectIds.length === 0) return m
  const sb = getSupabase()
  for (let i = 0; i < projectIds.length; i += PIECE_BATCH) {
    const chunk = projectIds.slice(i, i + PIECE_BATCH)
    const { data, error } = await sb
      .from('bodega_projects')
      .select('id, programming_routes_confirmed_at')
      .in('id', chunk)
    if (error) {
      const msg = [error.message, error.details].filter(Boolean).join(' ')
      if (/does not exist|programming_routes_confirmed_at|42703|PGRST204/i.test(msg)) return m
      throw new Error(describeQueryError(error))
    }
    for (const row of (data as { id: string; programming_routes_confirmed_at: string | null }[]) ?? []) {
      m.set(row.id, row.programming_routes_confirmed_at != null)
    }
  }
  return m
}

export async function fetchBodegaReportesBundle(): Promise<BodegaReportesBundle> {
  const now = new Date()
  const [projects, ordenes] = await Promise.all([
    fetchAllBodegaProjectsForReportes(),
    fetchOrdenesCompra().catch(() => [] as OrdenCompraRow[]),
  ])
  const ids = projects.map((p) => p.id)
  const [workByProject, pieceByProject, activities, catalogPieces, photosByProject, routesConfirmed] = await Promise.all([
    fetchWorkIntervalsForProjects(ids),
    fetchPieceIntervalsForProjects(ids),
    fetchProjectActivityForProjects(ids, 12000),
    fetchReportPieces(ids),
    fetchReportPhotos(ids),
    fetchRoutesConfirmed(ids),
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

  const week = currentWorkWeekWindow(now)
  const reportRows: BodegaProjectReportRow[] = projects.map((project) => {
    const work = workByProject.get(project.id) ?? []
    const intervals: BodegaPieceIntervalRow[] = pieceByProject.get(project.id) ?? []
    const weekTimes = computeProjectOrdenTimes({
      workIntervals: clipIntervalsToWindow(work, week),
      pieceIntervals: clipIntervalsToWindow(intervals, week),
      nowRef: week.end,
    })
    return {
      project,
      times: computeProjectOrdenTimes({
        workIntervals: work,
        pieceIntervals: intervals,
        nowRef: now,
      }),
      weekTimes,
      activityNotes: extractNotes(activityByProject.get(project.id) ?? [], authorCtx),
      advance: buildReportAdvance({
        status: project.status,
        week: weekTimes,
        pieces: catalogPieces.get(project.id) ?? [],
        intervals,
        photos: photosByProject.get(project.id) ?? [],
        routesConfirmed: routesConfirmed.get(project.id) ?? false,
      }),
    }
  })

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
    const weekTimesSum = sumOrdenTimeBreakdowns(items.map((i) => i.weekTimes))
    ocGroups.push({
      key,
      oc,
      numero: (oc?.numero ?? items[0]?.project.orden?.trim()) || '—',
      empresaNombre: oc?.empresa?.nombre ?? items[0]?.project.empresa ?? items[0]?.project.cliente ?? '—',
      solicitante: oc?.requisitor?.nombre ?? items[0]?.project.cliente ?? '—',
      ocFecha: oc?.fecha ?? null,
      projects: items,
      timesSum,
      weekTimesSum,
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
    week,
  }
}
