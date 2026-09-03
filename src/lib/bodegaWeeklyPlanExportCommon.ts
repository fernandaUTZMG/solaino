import type { BodegaWeeklyPlanBundle } from './bodegaWeeklyPlanRepo'

export type WeeklyPlanExportWeek = {
  weekStart: string
  bundle: BodegaWeeklyPlanBundle
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Ruta pública que funciona en web y en Electron (`base: './'` + `loadFile`). */
export function resolvePublicAssetUrl(assetPath: string): string {
  const clean = assetPath.replace(/^\/+/, '')
  if (typeof window !== 'undefined' && window.location?.href) {
    return new URL(clean, window.location.href).toString()
  }
  const base = String(import.meta.env.BASE_URL ?? '/').replace(/\/?$/, '/')
  return `${base}${clean}`
}

export async function loadSolainoLogoArrayBuffer(): Promise<ArrayBuffer | null> {
  const paths = ['img/logo2.png', 'img/icon-source-full.png', 'solaino-logo.png']
  for (const rel of paths) {
    try {
      const res = await fetch(resolvePublicAssetUrl(rel))
      if (!res.ok) continue
      return await res.arrayBuffer()
    } catch {
      /* siguiente */
    }
  }
  return null
}

export async function loadSolainoLogoDataUrl(): Promise<string | null> {
  const buf = await loadSolainoLogoArrayBuffer()
  if (!buf) return null
  const blob = new Blob([buf], { type: 'image/png' })
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

export function formatPlanDateLongEs(iso: string | null | undefined): string {
  if (!iso?.trim()) return '—'
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`)
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
  try {
    return d.toLocaleDateString('es-MX', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return iso.slice(0, 10)
  }
}

export function formatPlanDateShortEs(iso: string | null | undefined): string {
  if (!iso?.trim()) return '—'
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`)
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
  try {
    return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return iso.slice(0, 10)
  }
}

/** Promedio de avance real por etapa (solo proyectos activos en el plan). */
export function averageStageActualPct(bundle: BodegaWeeklyPlanBundle): {
  diseno: number
  programacion: number
  maquinado: number
  armado: number
} {
  const active = bundle.items.filter((it) => !it.projectTerminado)
  if (active.length === 0) {
    return { diseno: 0, programacion: 0, maquinado: 0, armado: 0 }
  }
  const sum = active.reduce(
    (acc, it) => ({
      diseno: acc.diseno + it.actual.diseno,
      programacion: acc.programacion + it.actual.programacion,
      maquinado: acc.maquinado + it.actual.maquinado,
      armado: acc.armado + it.actual.armado,
    }),
    { diseno: 0, programacion: 0, maquinado: 0, armado: 0 },
  )
  const n = active.length
  return {
    diseno: Math.round(sum.diseno / n),
    programacion: Math.round(sum.programacion / n),
    maquinado: Math.round(sum.maquinado / n),
    armado: Math.round(sum.armado / n),
  }
}

export function safeExportFilenamePart(s: string): string {
  return s.replace(/[^\d-]/g, '') || 'semana'
}
