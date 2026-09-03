import { fetchOrdenesCompra, type OrdenCompraRow } from './bodegaOrdenes'
import { fetchPieceIntervalsForProjects } from './bodegaPieceIntervalsRepo'
import {
  compareProjectPrioridadNivel,
  hasProjectPrioridad,
  normalizePrioridadNivel,
  parsePrioridadFromRow,
  type ProjectPrioridadNivel,
} from './bodegaProjectPrioridad'
import {
  computeProjectWeeklyPlanActual,
  isWeeklyPlanProjectTerminado,
  weeklyPlanLagStages,
  weeklyPlanOverallPct,
  weeklyPlanPlannedOverallPct,
  type WeeklyPlanStageProgress,
} from './bodegaWeeklyPlanProgress'
import { fetchBodegaProjectsPrioridadList } from './bodegaProjectsPrioridadRepo'
import type { BodegaProjectPieceRow } from './bodegaPiecesRepo'
import type { ProjectPiecePhotoRow } from './piecePhotosRepo'
import { isPostgrestMissingColumnError } from './bodegaPiecesSchema'
import { getSupabase } from './supabaseClient'
import { weekMondayKey } from './bodegaWeekCalendar'

export const BODEGA_WEEKLY_PLAN_PATCH = 'supabase/patch_bodega_weekly_plan.sql'
export const BODEGA_WEEKLY_PLAN_PRIORIDAD_PATCH = 'supabase/patch_bodega_weekly_plan_prioridad.sql'
export const BODEGA_WEEKLY_PLAN_FACTURA_PATCH = 'supabase/patch_bodega_weekly_plan_factura_archivo.sql'

export type BodegaWeeklyPlanRow = {
  id: string
  week_start: string
  notes: string | null
}

export type BodegaWeeklyPlanItemRow = {
  id: string
  plan_id: string
  project_id: string | null
  sort_order: number
  prioridad_nivel: ProjectPrioridadNivel
  cliente: string
  requisitor: string
  po_numero: string
  po_fecha: string | null
  proyecto_nombre: string
  plan_diseno_pct: number
  plan_programacion_pct: number
  plan_maquinado_pct: number
  plan_armado_pct: number
  fecha_entrega: string | null
  status_label: string
  factura: string
  factura_archivo_path: string | null
  factura_archivo_nombre: string | null
  delay_reason: string
  week_notes: string
  notes_lun: string
  notes_mar: string
  notes_mie: string
  notes_jue: string
  notes_vie: string
}

export type BodegaWeeklyPlanItemEnriched = BodegaWeeklyPlanItemRow & {
  actual: WeeklyPlanStageProgress
  plannedOverallPct: number
  actualOverallPct: number
  lagStages: ReturnType<typeof weeklyPlanLagStages>
  projectFolio: string | null
  projectStatus: string | null
  /** Prioridad viva del proyecto (si está ligado); si no, la guardada en la fila. */
  prioridadNivel: ProjectPrioridadNivel
  projectTerminado: boolean
}

export type BodegaWeeklyPlanBundle = {
  plan: BodegaWeeklyPlanRow
  items: BodegaWeeklyPlanItemEnriched[]
  weekSummary: {
    plannedOverallPct: number
    actualOverallPct: number
    itemsBehind: number
    itemsWithoutDelayReason: number
    itemsCompleted: number
    itemsActive: number
  }
}

function safeText(v: unknown): string {
  if (v == null) return ''
  return String(v).trim()
}

function clampPct(v: unknown): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return 0
  return Math.min(100, Math.max(0, Math.round(n)))
}

function mapItemRow(r: Record<string, unknown>): BodegaWeeklyPlanItemRow {
  return {
    id: safeText(r.id),
    plan_id: safeText(r.plan_id),
    project_id: r.project_id != null && String(r.project_id).trim() ? String(r.project_id) : null,
    sort_order: Number(r.sort_order) || 0,
    prioridad_nivel: parsePrioridadFromRow({ prioridad_nivel: r.prioridad_nivel }),
    cliente: safeText(r.cliente),
    requisitor: safeText(r.requisitor),
    po_numero: safeText(r.po_numero),
    po_fecha: r.po_fecha != null ? String(r.po_fecha).slice(0, 10) : null,
    proyecto_nombre: safeText(r.proyecto_nombre),
    plan_diseno_pct: clampPct(r.plan_diseno_pct),
    plan_programacion_pct: clampPct(r.plan_programacion_pct),
    plan_maquinado_pct: clampPct(r.plan_maquinado_pct),
    plan_armado_pct: clampPct(r.plan_armado_pct),
    fecha_entrega: r.fecha_entrega != null ? String(r.fecha_entrega).slice(0, 10) : null,
    status_label: safeText(r.status_label),
    factura: safeText(r.factura),
    factura_archivo_path:
      r.factura_archivo_path != null && String(r.factura_archivo_path).trim()
        ? String(r.factura_archivo_path).trim()
        : null,
    factura_archivo_nombre:
      r.factura_archivo_nombre != null && String(r.factura_archivo_nombre).trim()
        ? String(r.factura_archivo_nombre).trim()
        : null,
    delay_reason: safeText(r.delay_reason),
    week_notes: safeText(r.week_notes),
    notes_lun: safeText(r.notes_lun),
    notes_mar: safeText(r.notes_mar),
    notes_mie: safeText(r.notes_mie),
    notes_jue: safeText(r.notes_jue),
    notes_vie: safeText(r.notes_vie),
  }
}

function isMissingTableError(msg: string): boolean {
  return /bodega_weekly_plan/i.test(msg) && (/does not exist|relation/i.test(msg) || /schema cache/i.test(msg))
}

function postgrestErrorMessage(err: unknown): string {
  if (!err || typeof err !== 'object') return String(err ?? 'Error desconocido')
  const e = err as { message?: string; details?: string; hint?: string; code?: string }
  return [e.message, e.details, e.hint, e.code].filter(Boolean).join(' — ')
}

function throwWeeklyPlanDbError(err: unknown, context: string): never {
  const msg = postgrestErrorMessage(err)
  if (isMissingTableError(msg)) {
    throw new Error(`Falta el plan semanal en Supabase. Ejecuta ${BODEGA_WEEKLY_PLAN_PATCH} en el SQL Editor.`)
  }
  if (isPostgrestMissingColumnError(err, 'prioridad_nivel')) {
    throw new Error(
      `Falta la columna prioridad_nivel. Ejecuta ${BODEGA_WEEKLY_PLAN_PRIORIDAD_PATCH} (o el patch completo del plan) y recarga el esquema API.`,
    )
  }
  if (isPostgrestMissingColumnError(err, 'factura_archivo')) {
    throw new Error(
      `Falta soporte de archivo de factura. Ejecuta ${BODEGA_WEEKLY_PLAN_FACTURA_PATCH} en el SQL Editor y recarga el esquema API.`,
    )
  }
  if (/invalid input syntax for type date/i.test(msg)) {
    throw new Error(`${context}: fecha inválida en P.O. o entrega. Revisa el formato (YYYY-MM-DD).`)
  }
  if (/duplicate key|unique constraint|23505/i.test(msg)) {
    throw new Error(`${context}: ese proyecto ya está en el plan de esta semana.`)
  }
  if (/row-level security|42501|permission denied/i.test(msg)) {
    throw new Error(`${context}: solo admin o encargado pueden editar el plan semanal.`)
  }
  throw new Error(`${context}: ${msg}`)
}

/** Fecha solo día para columnas `date` de Postgres. */
function normalizeDateOnly(v: string | null | undefined): string | null {
  if (v == null || !String(v).trim()) return null
  const s = String(v).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

async function fetchPiecesByProjectIds(projectIds: string[]): Promise<Map<string, BodegaProjectPieceRow[]>> {
  const m = new Map<string, BodegaProjectPieceRow[]>()
  if (projectIds.length === 0) return m
  const sb = getSupabase()
  const { data, error } = await sb
    .from('bodega_project_pieces')
    .select('*')
    .in('project_id', projectIds)
  if (error) throw error
  for (const row of (data as Record<string, unknown>[]) ?? []) {
    const pid = safeText(row.project_id)
    if (!pid) continue
    if (!m.has(pid)) m.set(pid, [])
    m.get(pid)!.push(row as unknown as BodegaProjectPieceRow)
  }
  return m
}

async function fetchPhotosByProjectIds(projectIds: string[]): Promise<Map<string, ProjectPiecePhotoRow[]>> {
  const m = new Map<string, ProjectPiecePhotoRow[]>()
  if (projectIds.length === 0) return m
  const sb = getSupabase()
  const { data, error } = await sb
    .from('project_piece_photos')
    .select('id, project_id, piece_id, storage_path, filename, uploaded_by, created_at')
    .in('project_id', projectIds)
  if (error) throw error
  for (const row of (data as ProjectPiecePhotoRow[]) ?? []) {
    const pid = row.project_id
    if (!m.has(pid)) m.set(pid, [])
    m.get(pid)!.push(row)
  }
  return m
}

async function fetchProjectMetaByIds(
  projectIds: string[],
): Promise<
  Map<string, { status: string; routesConfirmed: boolean; folio: string; prioridadNivel: ProjectPrioridadNivel }>
> {
  const m = new Map<
    string,
    { status: string; routesConfirmed: boolean; folio: string; prioridadNivel: ProjectPrioridadNivel }
  >()
  if (projectIds.length === 0) return m
  const sb = getSupabase()
  let data: Record<string, unknown>[] | null = null
  let error: { message?: string; details?: string } | null = null
  const sel = 'id, folio, status, programming_routes_confirmed_at, prioridad_nivel, prioridad'
  const res = await sb.from('bodega_projects').select(sel).in('id', projectIds)
  data = (res.data as Record<string, unknown>[]) ?? null
  error = res.error
  let msg = [error?.message, error?.details].filter(Boolean).join(' ')
  if (error && /prioridad_nivel/i.test(msg)) {
    const r2 = await sb
      .from('bodega_projects')
      .select('id, folio, status, programming_routes_confirmed_at, prioridad')
      .in('id', projectIds)
    data = (r2.data as Record<string, unknown>[]) ?? null
    error = r2.error
  }
  if (error) throw error
  for (const row of data ?? []) {
    const id = safeText(row.id)
    m.set(id, {
      status: safeText(row.status) || 'pendiente',
      routesConfirmed: row.programming_routes_confirmed_at != null,
      folio: safeText(row.folio),
      prioridadNivel: parsePrioridadFromRow(row),
    })
  }
  return m
}

type WeeklyPlanSortable = {
  prioridadNivel: ProjectPrioridadNivel
  project_id: string | null
  projectFolio: string | null
  proyecto_nombre: string
  projectTerminado: boolean
}

function compareWeeklyPlanItemPriority(a: WeeklyPlanSortable, b: WeeklyPlanSortable): number {
  if (a.projectTerminado && !b.projectTerminado) return 1
  if (!a.projectTerminado && b.projectTerminado) return -1
  const pc = compareProjectPrioridadNivel(a.prioridadNivel, b.prioridadNivel)
  if (pc !== 0) return pc
  if (!a.project_id && b.project_id) return 1
  if (a.project_id && !b.project_id) return -1
  const fa = a.projectFolio ?? a.proyecto_nombre
  const fb = b.projectFolio ?? b.proyecto_nombre
  return fa.localeCompare(fb, 'es')
}

function sortWeeklyPlanItems(items: BodegaWeeklyPlanItemEnriched[]): BodegaWeeklyPlanItemEnriched[] {
  return [...items].sort(compareWeeklyPlanItemPriority)
}

export async function ensureWeeklyPlan(weekStart: string): Promise<BodegaWeeklyPlanRow> {
  const sb = getSupabase()
  const existing = await sb.from('bodega_weekly_plans').select('id, week_start, notes').eq('week_start', weekStart).maybeSingle()
  if (existing.error) {
    const msg = [existing.error.message, existing.error.details].filter(Boolean).join(' ')
    if (isMissingTableError(msg)) {
      throw new Error(`Falta la tabla del plan semanal. Ejecuta ${BODEGA_WEEKLY_PLAN_PATCH} en Supabase.`)
    }
    throw existing.error
  }
  if (existing.data) {
    const r = existing.data as Record<string, unknown>
    return { id: safeText(r.id), week_start: safeText(r.week_start), notes: r.notes != null ? safeText(r.notes) : null }
  }
  const ins = await sb.from('bodega_weekly_plans').insert({ week_start: weekStart }).select('id, week_start, notes').single()
  if (ins.error) throw ins.error
  const r = ins.data as Record<string, unknown>
  return { id: safeText(r.id), week_start: safeText(r.week_start), notes: r.notes != null ? safeText(r.notes) : null }
}

export type WeeklyPlanSyncResult = {
  added: number
  reordered: number
}

export async function fetchWeeklyPlanBundle(
  weekStart: string,
  options?: { syncFromPrioridad?: boolean },
): Promise<BodegaWeeklyPlanBundle> {
  const plan = await ensureWeeklyPlan(weekStart)
  if (options?.syncFromPrioridad) {
    await syncWeeklyPlanFromPrioridades(plan.id)
  }
  const sb = getSupabase()
  const itemsRes = await sb
    .from('bodega_weekly_plan_items')
    .select('*')
    .eq('plan_id', plan.id)
    .order('sort_order', { ascending: true })
  if (itemsRes.error) throw itemsRes.error

  const rawItems = ((itemsRes.data as Record<string, unknown>[]) ?? []).map(mapItemRow)
  const projectIds = [...new Set(rawItems.map((i) => i.project_id).filter((id): id is string => Boolean(id)))]

  const [piecesByProject, photosByProject, intervalsByProject, metaByProject] = await Promise.all([
    fetchPiecesByProjectIds(projectIds),
    fetchPhotosByProjectIds(projectIds),
    fetchPieceIntervalsForProjects(projectIds),
    fetchProjectMetaByIds(projectIds),
  ])

  const itemsWithStatus = await persistWeeklyPlanStatusLabelsFromProjects(rawItems, metaByProject)

  const enriched: BodegaWeeklyPlanItemEnriched[] = itemsWithStatus.map((item) => {
    const meta = item.project_id ? metaByProject.get(item.project_id) : undefined
    const actual = item.project_id
      ? computeProjectWeeklyPlanActual({
          projectStatus: meta?.status ?? 'pendiente',
          pieces: piecesByProject.get(item.project_id) ?? [],
          intervals: intervalsByProject.get(item.project_id) ?? [],
          photos: photosByProject.get(item.project_id) ?? [],
          routesConfirmed: meta?.routesConfirmed ?? false,
        })
      : { diseno: 0, programacion: 0, maquinado: 0, armado: 0 }

    const projectStatus = meta?.status ?? null
    const projectTerminado = isWeeklyPlanProjectTerminado(projectStatus)
    const prioridadNivel = meta?.prioridadNivel ?? item.prioridad_nivel
    const lagStages = weeklyPlanLagStages(item, actual, { projectTerminado })
    return {
      ...item,
      prioridad_nivel: prioridadNivel,
      actual,
      plannedOverallPct: weeklyPlanPlannedOverallPct(item),
      actualOverallPct: weeklyPlanOverallPct(actual),
      lagStages,
      projectFolio: meta?.folio ?? null,
      projectStatus,
      prioridadNivel,
      projectTerminado,
    }
  })

  const sortedItems = sortWeeklyPlanItems(enriched)

  let plannedSum = 0
  let actualSum = 0
  let itemsBehind = 0
  let itemsWithoutDelayReason = 0
  let itemsCompleted = 0
  let itemsActive = 0
  for (const it of sortedItems) {
    if (it.projectTerminado) {
      itemsCompleted++
      continue
    }
    itemsActive++
    plannedSum += it.plannedOverallPct
    actualSum += it.actualOverallPct
    if (it.lagStages.length > 0) {
      itemsBehind++
      if (!it.delay_reason.trim()) itemsWithoutDelayReason++
    }
  }
  const nActive = itemsActive || 1

  return {
    plan,
    items: sortedItems,
    weekSummary: {
      plannedOverallPct: itemsActive ? Math.round(plannedSum / nActive) : 0,
      actualOverallPct: itemsActive ? Math.round(actualSum / nActive) : 0,
      itemsBehind,
      itemsWithoutDelayReason,
      itemsCompleted,
      itemsActive,
    },
  }
}

export type WeeklyPlanItemInput = Partial<
  Omit<BodegaWeeklyPlanItemRow, 'id' | 'plan_id'>
> & {
  project_id?: string | null
  sort_order?: number
}

function buildWeeklyPlanItemInsertPayload(
  planId: string,
  input: WeeklyPlanItemInput,
  includePrioridadNivel: boolean,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    plan_id: planId,
    project_id: input.project_id ?? null,
    sort_order: input.sort_order ?? 0,
    cliente: input.cliente ?? '',
    requisitor: input.requisitor ?? '',
    po_numero: input.po_numero ?? '',
    po_fecha: normalizeDateOnly(input.po_fecha),
    proyecto_nombre: input.proyecto_nombre ?? '',
    plan_diseno_pct: clampPct(input.plan_diseno_pct ?? 0),
    plan_programacion_pct: clampPct(input.plan_programacion_pct ?? 0),
    plan_maquinado_pct: clampPct(input.plan_maquinado_pct ?? 0),
    plan_armado_pct: clampPct(input.plan_armado_pct ?? 0),
    fecha_entrega: normalizeDateOnly(input.fecha_entrega),
    status_label: input.status_label ?? '',
    factura: input.factura ?? '',
    delay_reason: input.delay_reason ?? '',
    week_notes: input.week_notes ?? '',
    notes_lun: input.notes_lun ?? '',
    notes_mar: input.notes_mar ?? '',
    notes_mie: input.notes_mie ?? '',
    notes_jue: input.notes_jue ?? '',
    notes_vie: input.notes_vie ?? '',
  }
  if (includePrioridadNivel) {
    payload.prioridad_nivel = normalizePrioridadNivel(input.prioridad_nivel ?? 0)
  }
  return payload
}

export async function insertWeeklyPlanItem(
  planId: string,
  input: WeeklyPlanItemInput,
): Promise<BodegaWeeklyPlanItemRow> {
  const sb = getSupabase()
  let payload = buildWeeklyPlanItemInsertPayload(planId, input, true)
  let res = await sb.from('bodega_weekly_plan_items').insert(payload).select('*').single()
  if (res.error && isPostgrestMissingColumnError(res.error, 'prioridad_nivel')) {
    payload = buildWeeklyPlanItemInsertPayload(planId, input, false)
    res = await sb.from('bodega_weekly_plan_items').insert(payload).select('*').single()
  }
  if (res.error) throwWeeklyPlanDbError(res.error, 'No se pudo agregar la fila al plan')
  return mapItemRow(res.data as Record<string, unknown>)
}

export async function updateWeeklyPlanItem(
  itemId: string,
  patch: WeeklyPlanItemInput,
): Promise<void> {
  const sb = getSupabase()
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
  const keys: (keyof WeeklyPlanItemInput)[] = [
    'project_id',
    'sort_order',
    'prioridad_nivel',
    'cliente',
    'requisitor',
    'po_numero',
    'po_fecha',
    'proyecto_nombre',
    'plan_diseno_pct',
    'plan_programacion_pct',
    'plan_maquinado_pct',
    'plan_armado_pct',
    'fecha_entrega',
    'status_label',
    'factura',
    'factura_archivo_path',
    'factura_archivo_nombre',
    'delay_reason',
    'week_notes',
    'notes_lun',
    'notes_mar',
    'notes_mie',
    'notes_jue',
    'notes_vie',
  ]
  for (const k of keys) {
    if (patch[k] !== undefined) {
      if (k.startsWith('plan_') && k.endsWith('_pct')) payload[k] = clampPct(patch[k])
      else if (k === 'prioridad_nivel') payload[k] = normalizePrioridadNivel(patch[k])
      else if (k === 'po_fecha' || k === 'fecha_entrega') payload[k] = normalizeDateOnly(patch[k] as string | null)
      else if (k === 'factura_archivo_path' || k === 'factura_archivo_nombre') {
        const v = patch[k]
        payload[k] = v != null && String(v).trim() ? String(v).trim() : null
      } else payload[k] = patch[k]
    }
  }
  let { error } = await sb.from('bodega_weekly_plan_items').update(payload).eq('id', itemId)
  if (error && patch.prioridad_nivel !== undefined && isPostgrestMissingColumnError(error, 'prioridad_nivel')) {
    delete payload.prioridad_nivel
    ;({ error } = await sb.from('bodega_weekly_plan_items').update(payload).eq('id', itemId))
  }
  if (error) throwWeeklyPlanDbError(error, 'No se pudo actualizar la fila del plan')
}

export async function deleteWeeklyPlanItem(itemId: string): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb.from('bodega_weekly_plan_items').delete().eq('id', itemId)
  if (error) throw error
}

export async function setWeeklyPlanItemDelay(
  itemId: string,
  delayReason: string,
  weekNotes: string,
): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb.rpc('bodega_weekly_plan_item_set_delay', {
    p_item_id: itemId,
    p_delay_reason: delayReason,
    p_week_notes: weekNotes,
  })
  if (error) {
    const msg = [error.message, error.details].filter(Boolean).join(' ')
    if (/bodega_weekly_plan_item_set_delay/i.test(msg)) {
      await updateWeeklyPlanItem(itemId, { delay_reason: delayReason, week_notes: weekNotes })
      return
    }
    throw error
  }
}

/** Arma y reordena el plan según proyectos con prioridad en Bodega → Prioridades. */
export async function syncWeeklyPlanFromPrioridades(planId: string): Promise<WeeklyPlanSyncResult> {
  const sb = getSupabase()
  const [projects, ordenes, itemsRes] = await Promise.all([
    fetchBodegaProjectsPrioridadList(),
    fetchOrdenesCompra().catch(() => [] as OrdenCompraRow[]),
    sb.from('bodega_weekly_plan_items').select('*').eq('plan_id', planId),
  ])
  if (itemsRes.error) throw itemsRes.error

  const ordenById = new Map(ordenes.map((o) => [o.id, o]))
  const projectById = new Map(projects.map((p) => [p.id, p]))
  const existing = ((itemsRes.data as Record<string, unknown>[]) ?? []).map(mapItemRow)
  const linkedIds = new Set(
    existing.map((i) => i.project_id).filter((id): id is string => Boolean(id)),
  )

  const prioritized = projects
    .filter((p) => hasProjectPrioridad(p.prioridadNivel))
    .sort((a, b) => {
      const aDone = a.status === 'terminado'
      const bDone = b.status === 'terminado'
      if (aDone && !bDone) return 1
      if (!aDone && bDone) return -1
      const pc = compareProjectPrioridadNivel(a.prioridadNivel, b.prioridadNivel)
      if (pc !== 0) return pc
      return a.folio.localeCompare(b.folio, 'es')
    })

  let added = 0
  for (const p of prioritized) {
    if (linkedIds.has(p.id)) continue
    const oc = p.orden_compra_id ? ordenById.get(p.orden_compra_id) : undefined
    const planned = defaultPlanTargetsForStatus(p.status)
    try {
      await insertWeeklyPlanItem(planId, {
        project_id: p.id,
        prioridad_nivel: p.prioridadNivel,
        cliente: p.empresa || p.cliente || oc?.empresa?.nombre || '',
        requisitor: oc?.requisitor?.nombre ?? p.cliente,
        po_numero: oc?.numero ?? '',
        po_fecha: normalizeDateOnly(oc?.fecha) ?? null,
        proyecto_nombre: p.nombre,
        ...planned,
        status_label: weeklyPlanStatusLabelFromProject(p.status),
      })
      linkedIds.add(p.id)
      added++
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      if (/ya está en el plan|duplicate key|unique constraint/i.test(msg)) {
        linkedIds.add(p.id)
        continue
      }
      throw e
    }
  }

  const reload = await sb.from('bodega_weekly_plan_items').select('*').eq('plan_id', planId)
  if (reload.error) throw reload.error
  const allItems = ((reload.data as Record<string, unknown>[]) ?? []).map(mapItemRow)

  const sortable: (BodegaWeeklyPlanItemRow & WeeklyPlanSortable)[] = allItems.map((item) => {
    const proj = item.project_id ? projectById.get(item.project_id) : undefined
    const prioridadNivel = proj?.prioridadNivel ?? item.prioridad_nivel
    const projectTerminado = proj?.status === 'terminado'
    return {
      ...item,
      prioridadNivel,
      projectFolio: proj?.folio ?? null,
      projectTerminado,
    }
  })
  sortable.sort(compareWeeklyPlanItemPriority)

  let reordered = 0
  await Promise.all(
    sortable.map(async (item, index) => {
      const proj = item.project_id ? projectById.get(item.project_id) : undefined
      const terminado = proj?.status === 'terminado'
      const targets = terminado ? defaultPlanTargetsForStatus('terminado') : null
      const needsOrder = item.sort_order !== index
      const needsPri = item.prioridad_nivel !== item.prioridadNivel
      const expectedStatus = proj ? weeklyPlanStatusLabelFromProject(proj.status) : null
      const needsStatus = Boolean(expectedStatus && item.status_label !== expectedStatus)
      const needsTerminado =
        terminado &&
        (item.plan_diseno_pct < 100 ||
          item.plan_programacion_pct < 100 ||
          item.plan_maquinado_pct < 100 ||
          item.plan_armado_pct < 100)
      if (!needsOrder && !needsPri && !needsStatus && !needsTerminado) return
      reordered++
      await updateWeeklyPlanItem(item.id, {
        sort_order: index,
        prioridad_nivel: item.prioridadNivel,
        ...(expectedStatus ? { status_label: expectedStatus } : {}),
        ...(terminado && targets ? targets : {}),
      })
    }),
  )

  return { added, reordered }
}

/** @deprecated Usa syncWeeklyPlanFromPrioridades */
export async function importPrioridadProjectsIntoPlan(planId: string, _weekStart?: string): Promise<number> {
  const r = await syncWeeklyPlanFromPrioridades(planId)
  return r.added
}

/** Etiqueta de status del plan según el estado del proyecto en bodega. */
export function weeklyPlanStatusLabelFromProject(status: string): string {
  const m: Record<string, string> = {
    pendiente: 'Pendiente',
    en_diseno: 'En diseño',
    revision_diseno: 'Revisión diseño',
    modificacion_diseno: 'Modificación',
    diseno_parcial: 'Diseño parcial',
    diseno_aprobado: 'Diseño aprobado',
    en_programacion: 'En programación',
    revision_programacion: 'Revisión cierre',
    terminado: 'Entregado',
  }
  return m[status] ?? status
}

async function persistWeeklyPlanStatusLabelsFromProjects(
  items: BodegaWeeklyPlanItemRow[],
  metaByProject: Map<string, { status: string }>,
): Promise<BodegaWeeklyPlanItemRow[]> {
  const patched = items.map((item) => {
    if (!item.project_id) return item
    const meta = metaByProject.get(item.project_id)
    if (!meta) return item
    const label = weeklyPlanStatusLabelFromProject(meta.status)
    if (item.status_label === label) return item
    return { ...item, status_label: label }
  })
  const changed = patched.filter((p, i) => p.status_label !== items[i].status_label)
  if (changed.length > 0) {
    await Promise.all(
      changed.map((p) => updateWeeklyPlanItem(p.id, { status_label: p.status_label })),
    )
  }
  return patched
}

/** Metas sugeridas al importar según estado del proyecto. */
function defaultPlanTargetsForStatus(status: string): {
  plan_diseno_pct: number
  plan_programacion_pct: number
  plan_maquinado_pct: number
  plan_armado_pct: number
} {
  switch (status) {
    case 'en_diseno':
    case 'revision_diseno':
    case 'modificacion_diseno':
    case 'diseno_parcial':
      return { plan_diseno_pct: 100, plan_programacion_pct: 0, plan_maquinado_pct: 0, plan_armado_pct: 0 }
    case 'diseno_aprobado':
      return { plan_diseno_pct: 100, plan_programacion_pct: 80, plan_maquinado_pct: 0, plan_armado_pct: 0 }
    case 'en_programacion':
      return { plan_diseno_pct: 100, plan_programacion_pct: 100, plan_maquinado_pct: 70, plan_armado_pct: 30 }
    case 'revision_programacion':
      return { plan_diseno_pct: 100, plan_programacion_pct: 100, plan_maquinado_pct: 100, plan_armado_pct: 100 }
    case 'terminado':
      return { plan_diseno_pct: 100, plan_programacion_pct: 100, plan_maquinado_pct: 100, plan_armado_pct: 100 }
    default:
      return { plan_diseno_pct: 50, plan_programacion_pct: 0, plan_maquinado_pct: 0, plan_armado_pct: 0 }
  }
}

export function currentWeekMondayKey(): string {
  return weekMondayKey(new Date())
}
