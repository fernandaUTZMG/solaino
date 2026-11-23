export type FacturaStatus = 'PENDIENTE' | 'VENCIDA' | 'PAGADA'

export type FacturaAlerta = 'pagada' | 'vencida' | 'por_vencer' | 'en_plazo' | 'sin_fecha'

/** Días hacia adelante para el filtro «Por vencer». */
export const POR_VENCER_DIAS = 7

const TZ = 'America/Mexico_City'

export function todayIsoMexico(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/** Acepta YYYY-MM-DD o fechas de Excel tipo M/D/AAAA. */
export function parseFacturaDate(raw: string | null | undefined): string | null {
  if (!raw) return null
  const s = String(raw).trim().replace(/\/+/g, '/')
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  let month = Number(m[1])
  let day = Number(m[2])
  const year = Number(m[3])
  if (month > 12 && day <= 12) {
    const swap = month
    month = day
    day = swap
  }
  if (month < 1 || month > 12) return null
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  if (day > last) day = last
  if (day < 1) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function addCalendarDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

/** Límite de pago: fecha de factura más los días de crédito del proveedor. */
export function limitePagoIso(args: {
  fechaFactura: string | null
  fechaPago: string | null
  diasCredito: number | null
  status: FacturaStatus
}): string | null {
  if (args.fechaFactura && args.diasCredito != null) return addCalendarDays(args.fechaFactura, args.diasCredito)
  if (args.status !== 'PAGADA' && args.fechaPago) return args.fechaPago
  return null
}

export function facturaAlerta(args: {
  status: FacturaStatus
  limite: string | null
  today?: string
}): FacturaAlerta {
  if (args.status === 'PAGADA') return 'pagada'
  const today = args.today ?? todayIsoMexico()
  if (args.status === 'VENCIDA') return 'vencida'
  if (!args.limite) return 'sin_fecha'
  if (args.limite < today) return 'vencida'
  const hasta = addCalendarDays(today, POR_VENCER_DIAS)
  if (args.limite <= hasta) return 'por_vencer'
  return 'en_plazo'
}

export function facturaAlertaLabel(alerta: FacturaAlerta): string {
  switch (alerta) {
    case 'pagada':
      return 'Pagada'
    case 'vencida':
      return 'Vencida'
    case 'por_vencer':
      return 'Por vencer'
    case 'en_plazo':
      return 'En plazo'
    default:
      return 'Sin fecha'
  }
}
