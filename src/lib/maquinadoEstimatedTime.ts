import { pieceLaneElapsedSeconds, type BodegaPieceIntervalRow } from './bodegaPieceIntervalsRepo'
import type { BodegaProjectPieceRow } from './bodegaPiecesRepo'

/** Parsea H:M:S o M:S (p. ej. «1:21:4» del Overall de SURFCAM). */
export function parseHmsToSeconds(input: string): number | null {
  const t = input.trim()
  if (!t) return null
  const parts = t.split(':').map((p) => p.trim())
  if (parts.length < 1 || parts.length > 3) return null
  const nums = parts.map((p) => Number.parseInt(p, 10))
  if (nums.some((n) => Number.isNaN(n) || n < 0)) return null
  if (parts.length === 3) return nums[0]! * 3600 + nums[1]! * 60 + nums[2]!
  if (parts.length === 2) return nums[0]! * 60 + nums[1]!
  return nums[0]!
}

/** Reloj HH:MM:SS con ceros a la izquierda (p. ej. 00:05:23). */
export function formatSecondsAsHms(totalSec: number): string {
  const sec = Math.max(0, Math.round(totalSec))
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':')
}

export function pieceMaquinadoEstimatedSeconds(p: BodegaProjectPieceRow): number | null {
  if (p.maquinado_estimated_seconds != null && p.maquinado_estimated_seconds > 0) {
    return p.maquinado_estimated_seconds
  }
  if (p.maquinado_estimated_label) {
    return parseHmsToSeconds(p.maquinado_estimated_label)
  }
  return null
}

export function pieceMaquinadoEstimatedLabel(p: BodegaProjectPieceRow): string | null {
  if (p.maquinado_estimated_label) return p.maquinado_estimated_label
  const sec = p.maquinado_estimated_seconds
  if (sec != null && sec > 0) return formatSecondsAsHms(sec)
  return null
}

export function pieceMaquinadoRealSeconds(p: BodegaProjectPieceRow): number | null {
  if (p.maquinado_real_seconds != null && p.maquinado_real_seconds > 0) {
    return p.maquinado_real_seconds
  }
  if (p.maquinado_real_label) {
    return parseHmsToSeconds(p.maquinado_real_label)
  }
  return null
}

export function pieceMaquinadoRealLabel(p: BodegaProjectPieceRow): string | null {
  if (p.maquinado_real_label) return p.maquinado_real_label
  const sec = p.maquinado_real_seconds
  if (sec != null && sec > 0) return formatSecondsAsHms(sec)
  return null
}

/** Tiempo real en reloj (segundos) de intervalos lane maquinado. */
export function maquinadoElapsedSeconds(
  intervals: BodegaPieceIntervalRow[],
  pieceId: string,
  now: Date = new Date(),
): number {
  return pieceLaneElapsedSeconds(intervals, pieceId, 'maquinado', now)
}

export function maquinadoTimeVarianceSeconds(estimatedSec: number | null, actualSec: number): number | null {
  if (estimatedSec == null || estimatedSec <= 0) return null
  return actualSec - estimatedSec
}

export function formatVarianceLabel(varianceSec: number): string {
  const sign = varianceSec >= 0 ? '+' : '−'
  return `${sign}${formatSecondsAsHms(Math.abs(varianceSec))}`
}
