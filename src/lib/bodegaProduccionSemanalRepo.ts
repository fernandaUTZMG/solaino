import { getSupabase } from './supabaseClient'
import {
  produccionTasksToJson,
  reconcileProduccionTasks,
  type ProduccionSemanalTask,
} from './bodegaProduccionSemanalTasks'

export const BODEGA_PRODUCCION_SEMANAL_PATCH = 'supabase/patch_bodega_produccion_semanal.sql'

export type ProduccionSemanalPlanRow = {
  id: string
  week_start: string
  disenadora_label: string
  programacion_label: string
  maquinado_label: string
}

export type ProduccionSemanalDayRow = {
  id: string
  plan_id: string
  day_index: number
  disenadora: string
  programacion: string
  maquinado: string
  armado: string
  comentarios: string
  disenadora_tareas: ProduccionSemanalTask[]
  programacion_tareas: ProduccionSemanalTask[]
  maquinado_tareas: ProduccionSemanalTask[]
  armado_tareas: ProduccionSemanalTask[]
}

const DAY_SELECT =
  'id, plan_id, day_index, disenadora, programacion, maquinado, armado, comentarios, disenadora_tareas, programacion_tareas, maquinado_tareas, armado_tareas'
const DAY_SELECT_NO_ARMADO =
  'id, plan_id, day_index, disenadora, programacion, maquinado, comentarios, disenadora_tareas, programacion_tareas, maquinado_tareas'
const DAY_SELECT_PLAIN = 'id, plan_id, day_index, disenadora, programacion, maquinado, comentarios'

function mapDay(row: Record<string, unknown>): ProduccionSemanalDayRow {
  const disenadora = String(row.disenadora ?? '')
  const programacion = String(row.programacion ?? '')
  const maquinado = String(row.maquinado ?? '')
  const armado = String(row.armado ?? '')
  return {
    id: String(row.id ?? ''),
    plan_id: String(row.plan_id ?? ''),
    day_index: Number(row.day_index ?? 0),
    disenadora,
    programacion,
    maquinado,
    armado,
    comentarios: String(row.comentarios ?? ''),
    disenadora_tareas: reconcileProduccionTasks(disenadora, row.disenadora_tareas),
    programacion_tareas: reconcileProduccionTasks(programacion, row.programacion_tareas),
    maquinado_tareas: reconcileProduccionTasks(maquinado, row.maquinado_tareas),
    armado_tareas: reconcileProduccionTasks(armado, row.armado_tareas),
  }
}

function missingTaskColumn(message: string): boolean {
  return /disenadora_tareas|programacion_tareas|maquinado_tareas/i.test(message) && /does not exist|schema cache|could not find/i.test(message)
}

function missingArmadoColumn(message: string): boolean {
  return /\barmado\b|armado_tareas/i.test(message) && /does not exist|schema cache|could not find/i.test(message)
}

export type ProduccionSemanalBundle = {
  plan: ProduccionSemanalPlanRow
  days: ProduccionSemanalDayRow[]
}

function isMissingTableError(msg: string): boolean {
  return /bodega_produccion_semanal/i.test(msg) && (/does not exist|relation/i.test(msg) || /schema cache/i.test(msg))
}

function throwIfDbError(error: { message: string } | null, context: string): void {
  if (!error) return
  const msg = error.message || ''
  if (isMissingTableError(msg)) {
    throw new Error(`Falta el plan de producción semanal en Supabase. Ejecuta ${BODEGA_PRODUCCION_SEMANAL_PATCH} en el SQL Editor.`)
  }
  throw new Error(`${context}: ${msg}`)
}

function sortDays(days: ProduccionSemanalDayRow[]): ProduccionSemanalDayRow[] {
  return [...days].sort((a, b) => a.day_index - b.day_index)
}

async function selectDays(planId: string): Promise<ProduccionSemanalDayRow[]> {
  const sb = getSupabase()
  const rich = await sb.from('bodega_produccion_semanal_dias').select(DAY_SELECT).eq('plan_id', planId)
  const mid =
    rich.error && missingArmadoColumn(rich.error.message)
      ? await sb.from('bodega_produccion_semanal_dias').select(DAY_SELECT_NO_ARMADO).eq('plan_id', planId)
      : rich
  const res =
    mid.error && missingTaskColumn(mid.error.message)
      ? await sb.from('bodega_produccion_semanal_dias').select(DAY_SELECT_PLAIN).eq('plan_id', planId)
      : mid
  throwIfDbError(res.error, 'Cargar días del plan')
  return sortDays(((res.data as Record<string, unknown>[] | null) ?? []).map(mapDay))
}

async function insertDefaultDays(planId: string): Promise<ProduccionSemanalDayRow[]> {
  const sb = getSupabase()
  const rows = [0, 1, 2, 3, 4].map((day_index) => ({
    plan_id: planId,
    day_index,
    disenadora: '',
    programacion: '',
    maquinado: '',
    comentarios: '',
  }))
  const { error } = await sb.from('bodega_produccion_semanal_dias').insert(rows)
  throwIfDbError(error, 'Crear días del plan')
  return selectDays(planId)
}

export async function fetchProduccionSemanalBundle(weekStart: string): Promise<ProduccionSemanalBundle | null> {
  const sb = getSupabase()
  const { data: plan, error: planErr } = await sb
    .from('bodega_produccion_semanal')
    .select('id, week_start, disenadora_label, programacion_label, maquinado_label')
    .eq('week_start', weekStart)
    .maybeSingle()
  throwIfDbError(planErr, 'Cargar plan de producción')
  if (!plan) return null

  return {
    plan: plan as ProduccionSemanalPlanRow,
    days: await selectDays((plan as ProduccionSemanalPlanRow).id),
  }
}

export async function ensureProduccionSemanalBundle(weekStart: string): Promise<ProduccionSemanalBundle> {
  const existing = await fetchProduccionSemanalBundle(weekStart)
  if (existing && existing.days.length >= 5) return existing

  const sb = getSupabase()
  if (!existing) {
    const { data: plan, error } = await sb
      .from('bodega_produccion_semanal')
      .insert({ week_start: weekStart })
      .select('id, week_start, disenadora_label, programacion_label, maquinado_label')
      .single()
    throwIfDbError(error, 'Crear plan de producción')
    const days = await insertDefaultDays((plan as ProduccionSemanalPlanRow).id)
    return { plan: plan as ProduccionSemanalPlanRow, days }
  }

  const missing = [0, 1, 2, 3, 4].filter((i) => !existing.days.some((d) => d.day_index === i))
  if (missing.length > 0) {
    const rows = missing.map((day_index) => ({
      plan_id: existing.plan.id,
      day_index,
      disenadora: '',
      programacion: '',
      maquinado: '',
      comentarios: '',
    }))
    const { error } = await sb.from('bodega_produccion_semanal_dias').insert(rows)
    throwIfDbError(error, 'Completar días del plan')
    return {
      plan: existing.plan,
      days: await selectDays(existing.plan.id),
    }
  }

  return existing
}

export type ProduccionSemanalHeaderInput = {
  disenadora_label: string
  programacion_label: string
  maquinado_label: string
}

export async function updateProduccionSemanalHeader(
  planId: string,
  input: ProduccionSemanalHeaderInput,
): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb
    .from('bodega_produccion_semanal')
    .update({
      disenadora_label: input.disenadora_label.trim() || 'Diseño',
      programacion_label: input.programacion_label.trim() || 'Programación',
      maquinado_label: input.maquinado_label.trim() || 'Maquinado',
      updated_at: new Date().toISOString(),
    })
    .eq('id', planId)
  throwIfDbError(error, 'Actualizar encabezado del plan')
}

export type ProduccionSemanalDayInput = {
  disenadora: string
  programacion: string
  maquinado: string
  armado: string
  comentarios: string
  disenadora_tareas: ProduccionSemanalTask[]
  programacion_tareas: ProduccionSemanalTask[]
  maquinado_tareas: ProduccionSemanalTask[]
  armado_tareas: ProduccionSemanalTask[]
}

export async function updateProduccionSemanalDay(dayId: string, input: ProduccionSemanalDayInput): Promise<void> {
  const sb = getSupabase()
  const payload = {
    disenadora: input.disenadora,
    programacion: input.programacion,
    maquinado: input.maquinado,
    armado: input.armado,
    comentarios: input.comentarios,
    disenadora_tareas: produccionTasksToJson(input.disenadora_tareas),
    programacion_tareas: produccionTasksToJson(input.programacion_tareas),
    maquinado_tareas: produccionTasksToJson(input.maquinado_tareas),
    armado_tareas: produccionTasksToJson(input.armado_tareas),
    updated_at: new Date().toISOString(),
  }
  let { error } = await sb.from('bodega_produccion_semanal_dias').update(payload).eq('id', dayId)
  if (error && missingArmadoColumn(error.message)) {
    const { armado: _armado, armado_tareas: _armadoTareas, ...withoutArmado } = payload
    ;({ error } = await sb.from('bodega_produccion_semanal_dias').update(withoutArmado).eq('id', dayId))
  }
  if (error && missingTaskColumn(error.message)) {
    const {
      disenadora_tareas: _a,
      programacion_tareas: _b,
      maquinado_tareas: _c,
      armado_tareas: _d,
      armado: _e,
      ...plain
    } = payload
    ;({ error } = await sb.from('bodega_produccion_semanal_dias').update(plain).eq('id', dayId))
  }
  throwIfDbError(error, 'Guardar día del plan')
}

export async function listProduccionSemanalWeekStarts(limit = 24): Promise<string[]> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('bodega_produccion_semanal')
    .select('week_start')
    .order('week_start', { ascending: false })
    .limit(limit)
  throwIfDbError(error, 'Listar semanas')
  return (data as { week_start: string }[] | null)?.map((r) => r.week_start.slice(0, 10)) ?? []
}
