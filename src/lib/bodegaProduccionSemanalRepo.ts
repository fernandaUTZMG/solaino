import { getSupabase } from './supabaseClient'

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
  comentarios: string
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
  const { data, error } = await sb.from('bodega_produccion_semanal_dias').insert(rows).select('*')
  throwIfDbError(error, 'Crear días del plan')
  return sortDays((data as ProduccionSemanalDayRow[]) ?? [])
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

  const { data: days, error: daysErr } = await sb
    .from('bodega_produccion_semanal_dias')
    .select('id, plan_id, day_index, disenadora, programacion, maquinado, comentarios')
    .eq('plan_id', (plan as ProduccionSemanalPlanRow).id)
  throwIfDbError(daysErr, 'Cargar días del plan')

  return {
    plan: plan as ProduccionSemanalPlanRow,
    days: sortDays((days as ProduccionSemanalDayRow[]) ?? []),
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
    const { data, error } = await sb.from('bodega_produccion_semanal_dias').insert(rows).select('*')
    throwIfDbError(error, 'Completar días del plan')
    return {
      plan: existing.plan,
      days: sortDays([...existing.days, ...((data as ProduccionSemanalDayRow[]) ?? [])]),
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
  comentarios: string
}

export async function updateProduccionSemanalDay(dayId: string, input: ProduccionSemanalDayInput): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb
    .from('bodega_produccion_semanal_dias')
    .update({
      disenadora: input.disenadora,
      programacion: input.programacion,
      maquinado: input.maquinado,
      comentarios: input.comentarios,
      updated_at: new Date().toISOString(),
    })
    .eq('id', dayId)
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
