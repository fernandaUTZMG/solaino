import { getSupabase } from './supabaseClient'

function messageFromUnknown(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'object' && e !== null && 'message' in e) {
    const m = (e as { message: unknown }).message
    if (typeof m === 'string') return m
  }
  return ''
}

export function formatEmbarqueUserMessage(e: unknown): string {
  const msg = messageFromUnknown(e)
  const lower = msg.toLowerCase()
  if (lower.includes('stock insuficiente') || lower.includes('insuficientes')) {
    return 'No hay existencias suficientes para completar el embarque. Revisa cantidades o series disponibles.'
  }
  if (lower.includes('no disponibles') || lower.includes('inexistentes')) {
    return 'Algún número de serie no existe o ya no está disponible para salida.'
  }
  if (lower.includes('producto no encontrado')) {
    return 'Un código del embarque no coincide con un producto registrado.'
  }
  if (lower.includes('no maneja series')) {
    return 'Se enviaron números de serie para un producto que no está configurado con serie.'
  }
  if (msg.trim()) return msg
  return 'No se pudo registrar el embarque.'
}

export type EmbarqueLineaInput = {
  codigo: string
  /** Obligatorio si no envías `series`. */
  cantidad?: number
  /** Si viene con elementos, el servidor usa estas series (producto con serie). */
  series?: string[]
}

export async function registrarEmbarque(args: {
  lineas: EmbarqueLineaInput[]
  payload?: { motivo?: string; responsable?: string; nota?: string }
}): Promise<{ ok: boolean; lineas: number }> {
  const sb = getSupabase()
  const lineasJson = args.lineas.map((L) => {
    const codigo = L.codigo.trim()
    const hasSeries = L.series && L.series.length > 0
    if (hasSeries) {
      const series = L.series!.map((s) => s.trim()).filter(Boolean)
      const c = L.cantidad
      if (series.length === 1 && c != null && c > 1) {
        return { codigo, series, cantidad: c }
      }
      return { codigo, series }
    }
    return {
      codigo,
      cantidad: L.cantidad ?? null,
    }
  })

  const { data, error } = await sb.rpc('registrar_embarque', {
    p_lineas: lineasJson,
    p_payload: args.payload
      ? {
          motivo: args.payload.motivo ?? null,
          responsable: args.payload.responsable ?? null,
          nota: args.payload.nota ?? null,
        }
      : null,
  })
  if (error) throw error

  const o = data as { ok?: boolean; lineas?: number } | null
  if (!o?.ok || !Number.isFinite(o.lineas)) {
    throw new Error('Respuesta inválida al registrar embarque.')
  }

  return { ok: true, lineas: o.lineas as number }
}
