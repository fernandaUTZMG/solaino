import { getSupabase } from './supabaseClient'

const MSG_SERIE_OTRO_PRODUCTO =
  'Ese número de serie ya está registrado en otro producto. Cada serie solo puede pertenecer a un código de parte.'

function messageFromUnknown(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'object' && e !== null && 'message' in e) {
    const m = (e as { message: unknown }).message
    if (typeof m === 'string') return m
  }
  return ''
}

/** True si el texto ya formateado corresponde a conflicto de serie en otro producto (mostrar modal centrado). */
export function isEntradaSerieOtroProductoMessage(visibleMessage: string): boolean {
  const lower = visibleMessage.toLowerCase()
  return (
    lower.includes('serie pertenece a otro producto') ||
    lower.includes('cada serie solo puede pertenecer')
  )
}

/** Mensaje legible para el usuario (p. ej. en EntradaDialog). */
export function formatRegistroEntradaUserMessage(e: unknown): string {
  const msg = messageFromUnknown(e)
  const lower = msg.toLowerCase()
  if (lower.includes('serie pertenece a otro producto')) {
    return msg.trim()
  }
  if (
    lower.includes('serie duplicada') ||
    (lower.includes('duplicate key') && lower.includes('series')) ||
    lower.includes('series_producto_numero_uidx') ||
    lower.includes('series_numero_serie_glob_uidx')
  ) {
    return MSG_SERIE_OTRO_PRODUCTO
  }
  if (lower.includes('could not update') && lower.includes('conflict')) {
    return MSG_SERIE_OTRO_PRODUCTO
  }
  if (msg.trim()) return msg
  return 'No se pudo guardar la entrada.'
}

export type SerieEntradaLinea = { serie: string; cantidad: number }

export async function registrarEntrada(args: {
  codigo: string
  cantidad?: number
  /** Compat: una fila por aparición (cada elemento = 1 pieza si no usas seriesLineas). */
  series?: string[]
  /** Preferido con tiene_serie: mismo número de serie puede traer cantidad > 1. */
  seriesLineas?: SerieEntradaLinea[]
  payload?: {
    nombre?: string
    categoriaId?: string
    unidad?: string
    ubicacionArea?: string
    ubicacionDetalle?: string
    costoUnitario?: number
    estado?: string
    tieneSerie?: boolean
    responsable?: string
  }
}): Promise<{ productoId: string; delta: number; created: boolean; tieneSerie: boolean }> {
  const sb = getSupabase()

  const lineasJson =
    args.seriesLineas && args.seriesLineas.length > 0
      ? args.seriesLineas.map((L) => ({
          serie: L.serie.trim(),
          cantidad: L.cantidad,
        }))
      : null

  const { data, error } = await sb.rpc('registrar_entrada', {
    p_codigo: args.codigo.trim(),
    p_cantidad: args.cantidad ?? null,
    p_series: args.series && args.series.length > 0 ? args.series : null,
    p_series_lineas: lineasJson,
    p_payload: args.payload
      ? {
          nombre: args.payload.nombre ?? null,
          categoria_id: args.payload.categoriaId ?? null,
          unidad: args.payload.unidad ?? null,
          ubicacion_area: args.payload.ubicacionArea ?? null,
          ubicacion_detalle: args.payload.ubicacionDetalle ?? null,
          costo_unitario: args.payload.costoUnitario ?? null,
          estado: args.payload.estado ?? null,
          tiene_serie: args.payload.tieneSerie ?? null,
          responsable: args.payload.responsable ?? null,
        }
      : null,
  })
  if (error) throw error

  const o = data as
    | { producto_id?: string; delta?: number; created?: boolean; tiene_serie?: boolean }
    | null
    | undefined

  const productoId = o?.producto_id
  const delta = o?.delta
  if (!productoId || !Number.isFinite(delta)) {
    throw new Error('Respuesta inválida al registrar entrada.')
  }

  return {
    productoId,
    delta: delta as number,
    created: Boolean(o?.created),
    tieneSerie: Boolean(o?.tiene_serie),
  }
}
