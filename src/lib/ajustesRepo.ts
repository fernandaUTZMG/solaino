import { getSupabase } from './supabaseClient'

export function formatRegistroAjusteUserMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'object' && e !== null && 'message' in e) {
    const m = (e as { message: unknown }).message
    if (typeof m === 'string' && m.trim()) return m.trim()
  }
  return 'No se pudo guardar el ajuste.'
}

export async function registrarAjuste(args: {
  codigo: string
  stockContado: number
  motivo?: string
  nota?: string | null
  responsable?: string | null
}): Promise<{ productoId: string; delta: number; stockAnterior: number; stockNuevo: number }> {
  const sb = getSupabase()
  const { data, error } = await sb.rpc('registrar_ajuste', {
    p_codigo: args.codigo.trim(),
    p_stock_contado: args.stockContado,
    p_motivo: args.motivo ?? null,
    p_nota: args.nota ?? null,
    p_responsable: args.responsable ?? null,
  })
  if (error) throw error

  const row = (data as any)?.[0] ?? (data as any)
  const productoId = row?.producto_id
  const delta = row?.delta
  const stockAnterior = row?.stock_anterior
  const stockNuevo = row?.stock_nuevo
  if (!productoId || !Number.isFinite(Number(delta)) || !Number.isFinite(Number(stockAnterior)) || !Number.isFinite(Number(stockNuevo))) {
    throw new Error('Respuesta inválida al registrar ajuste.')
  }

  return {
    productoId: String(productoId),
    delta: Number(delta),
    stockAnterior: Number(stockAnterior),
    stockNuevo: Number(stockNuevo),
  }
}

