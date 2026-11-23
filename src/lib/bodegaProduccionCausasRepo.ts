import { spanSeconds } from './intervalTime'
import { formatSecondsAsHms } from './maquinadoEstimatedTime'
import { getSupabase } from './supabaseClient'

export type ProduccionCausa = {
  id: string
  nombre: string
}

export type ProduccionCausaEvento = {
  id: string
  day_id: string
  causa_id: string
  nombre: string
  started_at: string
  ended_at: string | null
}

export type ProduccionCausasBundle = {
  causas: ProduccionCausa[]
  eventos: ProduccionCausaEvento[]
}

function normalizeNombre(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function describe(error: { message?: string; details?: string; code?: string }): string {
  return [error.message, error.details].filter(Boolean).join(' ')
}

function missingTable(message: string): boolean {
  return /bodega_produccion_causas|bodega_produccion_causa_eventos|does not exist|PGRST205|schema cache/i.test(message)
}

export function produccionCausaElapsedSeconds(event: Pick<ProduccionCausaEvento, 'started_at' | 'ended_at'>, nowMs: number): number {
  return spanSeconds(event.started_at, event.ended_at, nowMs)
}

export function produccionCausaDurationLabel(seconds: number): string {
  return formatSecondsAsHms(seconds)
}

export async function fetchProduccionCausas(dayIds: string[]): Promise<ProduccionCausasBundle> {
  const sb = getSupabase()
  const causasRes = await sb.from('bodega_produccion_causas').select('id, nombre').order('nombre')
  if (causasRes.error) {
    const msg = describe(causasRes.error)
    if (missingTable(msg)) {
      throw new Error('Faltan las causas en la base. Ejecuta supabase/patch_bodega_produccion_causas.sql y recarga el esquema.')
    }
    throw new Error(msg || 'No se pudieron cargar las causas')
  }
  const causas = ((causasRes.data as { id: string; nombre: string }[] | null) ?? []).map((row) => ({
    id: String(row.id),
    nombre: String(row.nombre),
  }))
  const byId = new Map(causas.map((causa) => [causa.id, causa.nombre]))
  const ids = [...new Set(dayIds.filter(Boolean))]
  if (ids.length === 0) return { causas, eventos: [] }

  const eventosRes = await sb
    .from('bodega_produccion_causa_eventos')
    .select('id, day_id, causa_id, started_at, ended_at')
    .in('day_id', ids)
    .order('started_at')
  if (eventosRes.error) throw new Error(describe(eventosRes.error) || 'No se pudieron cargar los tiempos de las causas')

  const eventos = ((eventosRes.data as Record<string, unknown>[] | null) ?? []).map((row) => {
    const causaId = String(row.causa_id)
    return {
      id: String(row.id),
      day_id: String(row.day_id),
      causa_id: causaId,
      nombre: byId.get(causaId) ?? 'Causa',
      started_at: String(row.started_at),
      ended_at: row.ended_at == null ? null : String(row.ended_at),
    }
  })
  return { causas, eventos }
}

export async function saveProduccionCausa(nombre: string): Promise<ProduccionCausa> {
  const clean = normalizeNombre(nombre)
  if (!clean) throw new Error('Escribe la causa.')
  const sb = getSupabase()
  const inserted = await sb.from('bodega_produccion_causas').insert({ nombre: clean }).select('id, nombre').maybeSingle()
  if (!inserted.error && inserted.data) {
    return { id: String(inserted.data.id), nombre: String(inserted.data.nombre) }
  }
  const msg = inserted.error ? describe(inserted.error) : ''
  if (inserted.error && !/23505|duplicate|unique/i.test(msg)) {
    throw new Error(msg || 'No se guardó la causa')
  }
  const existing = await sb.from('bodega_produccion_causas').select('id, nombre').ilike('nombre', clean).limit(1).maybeSingle()
  if (existing.error || !existing.data) throw new Error('Esa causa ya existe, pero no se pudo abrir.')
  return { id: String(existing.data.id), nombre: String(existing.data.nombre) }
}

export async function startProduccionCausaEvento(dayId: string, causaId: string): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb.from('bodega_produccion_causa_eventos').insert({
    day_id: dayId,
    causa_id: causaId,
    started_at: new Date().toISOString(),
  })
  if (error) throw new Error(describe(error) || 'No se inició el tiempo de la causa')
}

export async function stopProduccionCausaEvento(eventoId: string): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb
    .from('bodega_produccion_causa_eventos')
    .update({ ended_at: new Date().toISOString() })
    .eq('id', eventoId)
    .is('ended_at', null)
  if (error) throw new Error(describe(error) || 'No se detuvo el tiempo de la causa')
}
