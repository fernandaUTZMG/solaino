import type { BodegaWeeklyPlanBundle } from './bodegaWeeklyPlanRepo'
import { averageStageActualPct } from './bodegaWeeklyPlanExportCommon'
import { PLAN_EXPORT_BRAND } from './bodegaWeeklyPlanExportTheme'

const ORANGE = '#FFC000'
const ORANGE_DARK = '#ED7D31'
const BLUE = '#5B9BD5'
const BLUE_DARK = '#2E75B6'
const SLATE = '#404040'
const SLATE_MUTED = '#7F7F7F'
const BORDER = '#D9D9D9'

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rad = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rad, y)
  ctx.arcTo(x + w, y, x + w, y + h, rad)
  ctx.arcTo(x + w, y + h, x, y + h, rad)
  ctx.arcTo(x, y + h, x, y, rad)
  ctx.arcTo(x, y, x + w, y, rad)
  ctx.closePath()
}

function drawCardFrame(ctx: CanvasRenderingContext2D, width: number, height: number, title: string): void {
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, width, height)
  roundRect(ctx, 8, 8, width - 16, height - 16, 8)
  ctx.fillStyle = '#FAFAFA'
  ctx.fill()
  ctx.strokeStyle = BORDER
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.fillStyle = SLATE
  ctx.font = '600 15px Calibri, Segoe UI, Arial, sans-serif'
  ctx.fillText(title, 24, 36)
  ctx.fillStyle = SLATE_MUTED
  ctx.font = '11px Calibri, Segoe UI, Arial, sans-serif'
  ctx.fillText(PLAN_EXPORT_BRAND, 24, 54)
}

/** KPI + barras — estilo informe ejecutivo. */
export function renderWeeklyPlanSummaryChart(
  bundle: BodegaWeeklyPlanBundle,
  width = 640,
  height = 280,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  drawCardFrame(ctx, width, height, 'Resumen de la semana')

  const pairs: { label: string; value: number; color: string; suffix?: string }[] = [
    { label: 'Meta semanal', value: bundle.weekSummary.plannedOverallPct, color: BLUE, suffix: '%' },
    { label: 'Avance real', value: bundle.weekSummary.actualOverallPct, color: BLUE_DARK, suffix: '%' },
    { label: 'Con atraso', value: bundle.weekSummary.itemsBehind, color: ORANGE_DARK },
    { label: 'Finalizados', value: bundle.weekSummary.itemsCompleted, color: '#70AD47' },
  ]

  const chartTop = 72
  const chartH = height - chartTop - 36
  const barW = 100
  const gap = 36
  const startX = (width - (pairs.length * barW + (pairs.length - 1) * gap)) / 2
  const maxVal = Math.max(100, ...pairs.map((p) => p.value), 1)

  pairs.forEach((p, i) => {
    const x = startX + i * (barW + gap)
    const h = Math.max(6, (p.value / maxVal) * chartH)
    const y = chartTop + chartH - h
    ctx.fillStyle = '#F2F2F2'
    roundRect(ctx, x, chartTop, barW, chartH, 4)
    ctx.fill()
    ctx.fillStyle = p.color
    roundRect(ctx, x, y, barW, h, 4)
    ctx.fill()
    ctx.fillStyle = SLATE
    ctx.font = 'bold 16px Calibri, Segoe UI, Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(`${p.value}${p.suffix ?? ''}`, x + barW / 2, y - 10)
    ctx.fillStyle = SLATE_MUTED
    ctx.font = '12px Calibri, Segoe UI, Arial, sans-serif'
    ctx.fillText(p.label, x + barW / 2, height - 22)
  })
  ctx.textAlign = 'left'
  return canvas
}

/** Avance por etapa — barras naranjas como Excel. */
export function renderWeeklyPlanStagesChart(
  bundle: BodegaWeeklyPlanBundle,
  width = 640,
  height = 280,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  drawCardFrame(ctx, width, height, 'Avance real por etapa (proyectos activos)')

  const avg = averageStageActualPct(bundle)
  const stages = [
    { label: 'DISEÑO', value: avg.diseno },
    { label: 'PROGRAMACION', value: avg.programacion },
    { label: 'MAQUINADO', value: avg.maquinado },
    { label: 'ARMADO', value: avg.armado },
  ]

  const chartTop = 78
  const chartH = height - chartTop - 40
  const barW = 110
  const gap = 28
  const startX = (width - (stages.length * barW + (stages.length - 1) * gap)) / 2

  stages.forEach((s, i) => {
    const x = startX + i * (barW + gap)
    const h = Math.max(6, (s.value / 100) * chartH)
    const y = chartTop + chartH - h
    ctx.fillStyle = '#F2F2F2'
    roundRect(ctx, x, chartTop, barW, chartH, 4)
    ctx.fill()
    const grad = ctx.createLinearGradient(x, y, x, y + h)
    grad.addColorStop(0, ORANGE)
    grad.addColorStop(1, ORANGE_DARK)
    ctx.fillStyle = grad
    roundRect(ctx, x, y, barW, h, 4)
    ctx.fill()
    ctx.fillStyle = SLATE
    ctx.font = 'bold 16px Calibri, Segoe UI, Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(`${s.value}%`, x + barW / 2, y - 10)
    ctx.fillStyle = SLATE_MUTED
    ctx.font = '11px Calibri, Segoe UI, Arial, sans-serif'
    ctx.fillText(s.label, x + barW / 2, height - 22)
  })
  ctx.textAlign = 'left'
  return canvas
}

/** Meta vs real por etapa (promedio activos). */
export function renderWeeklyPlanMetaVsRealChart(
  bundle: BodegaWeeklyPlanBundle,
  width = 640,
  height = 280,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  drawCardFrame(ctx, width, height, 'Meta vs avance real (promedio etapas)')

  const active = bundle.items.filter((it) => !it.projectTerminado)
  const n = Math.max(active.length, 1)
  const sum = active.reduce(
    (acc, it) => ({
      planD: acc.planD + it.plan_diseno_pct,
      planP: acc.planP + it.plan_programacion_pct,
      planM: acc.planM + it.plan_maquinado_pct,
      planA: acc.planA + it.plan_armado_pct,
      actD: acc.actD + it.actual.diseno,
      actP: acc.actP + it.actual.programacion,
      actM: acc.actM + it.actual.maquinado,
      actA: acc.actA + it.actual.armado,
    }),
    { planD: 0, planP: 0, planM: 0, planA: 0, actD: 0, actP: 0, actM: 0, actA: 0 },
  )

  const stages = [
    { label: 'DISEÑO', meta: Math.round(sum.planD / n), real: Math.round(sum.actD / n) },
    { label: 'PROG.', meta: Math.round(sum.planP / n), real: Math.round(sum.actP / n) },
    { label: 'MAQ.', meta: Math.round(sum.planM / n), real: Math.round(sum.actM / n) },
    { label: 'ARM.', meta: Math.round(sum.planA / n), real: Math.round(sum.actA / n) },
  ]

  const chartTop = 78
  const chartH = height - chartTop - 48
  const groupW = 120
  const gap = 24
  const barW = 22
  const startX = (width - (stages.length * groupW + (stages.length - 1) * gap)) / 2

  stages.forEach((s, i) => {
    const gx = startX + i * (groupW + gap)
    const metaH = Math.max(4, (s.meta / 100) * chartH)
    const realH = Math.max(4, (s.real / 100) * chartH)
    ctx.fillStyle = '#F2F2F2'
    roundRect(ctx, gx, chartTop, groupW, chartH, 4)
    ctx.fill()
    ctx.fillStyle = BLUE
    roundRect(ctx, gx + 18, chartTop + chartH - metaH, barW, metaH, 2)
    ctx.fill()
    ctx.fillStyle = ORANGE
    roundRect(ctx, gx + 52, chartTop + chartH - realH, barW, realH, 2)
    ctx.fill()
    ctx.fillStyle = SLATE_MUTED
    ctx.font = '11px Calibri, Segoe UI, Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(s.label, gx + groupW / 2, height - 28)
  })

  ctx.textAlign = 'left'
  ctx.fillStyle = BLUE
  ctx.fillRect(24, height - 52, 12, 12)
  ctx.fillStyle = SLATE
  ctx.font = '11px Calibri, Arial, sans-serif'
  ctx.fillText('Meta', 40, height - 42)
  ctx.fillStyle = ORANGE
  ctx.fillRect(90, height - 52, 12, 12)
  ctx.fillText('Real', 106, height - 42)

  return canvas
}

export function canvasToPngDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/png')
}

export async function canvasToPngArrayBuffer(canvas: HTMLCanvasElement): Promise<ArrayBuffer> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'))
  if (!blob) throw new Error('No se pudo generar la gráfica')
  return blob.arrayBuffer()
}
