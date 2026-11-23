import type { BodegaWeeklyPlanBundle } from './bodegaWeeklyPlanRepo'
import { averageStageActualPct } from './bodegaWeeklyPlanExportCommon'

const SLATE = '#404040'
const SLATE_MUTED = '#7F7F7F'

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

function fillRound(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string) {
  roundRect(ctx, x, y, w, h, r)
  ctx.fillStyle = fill
  ctx.fill()
}

/** Una sola gráfica: meta 100%, avance real y el detalle por etapa. */
export function renderWeeklyPlanDetailChart(
  bundle: BodegaWeeklyPlanBundle,
  width = 1200,
  height = 680,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  const summary = bundle.weekSummary
  const stagesAvg = averageStageActualPct(bundle)
  const shopItems = bundle.items.filter((item) => !item.externalShop)
  const externalCount = bundle.items.length - shopItems.length
  const total = shopItems.length
  const pctOf = (count: number) => (total === 0 ? 0 : Math.round((count / total) * 100))
  const real = summary.actualOverallPct
  const meta = summary.plannedOverallPct

  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, width, height)
  fillRound(ctx, 16, 16, width - 32, height - 32, 16, '#F8FAFC')
  ctx.strokeStyle = '#E2E8F0'
  ctx.lineWidth = 1
  roundRect(ctx, 16, 16, width - 32, height - 32, 16)
  ctx.stroke()

  ctx.fillStyle = SLATE
  ctx.font = '700 28px Calibri, Segoe UI, Arial, sans-serif'
  ctx.fillText('Avance del plan', 40, 58)
  ctx.fillStyle = SLATE_MUTED
  ctx.font = '15px Calibri, Segoe UI, Arial, sans-serif'
  ctx.fillText('La meta es cumplir el 100% de los renglones. El avance real es el promedio de lo que sí se cumplió.', 40, 84)

  const cards: Array<{ label: string; value: string; note: string; ink: string; fill: string }> = [
    { label: 'META SEMANAL', value: `${meta}%`, note: 'Lo que hay que cumplir', ink: '#0F172A', fill: '#FFFFFF' },
    {
      label: 'AVANCE REAL',
      value: `${real}%`,
      note: externalCount > 0 ? `Promedio de ${total} de este taller` : `Promedio de ${total} renglones`,
      ink: real >= 100 ? '#065F46' : '#9A3412',
      fill: real >= 100 ? '#ECFDF5' : '#FFF7ED',
    },
    { label: 'FINALIZADOS', value: String(summary.itemsCompleted), note: `${pctOf(summary.itemsCompleted)}% del plan`, ink: '#065F46', fill: '#ECFDF5' },
    { label: 'CON ATRASO', value: String(summary.itemsBehind), note: `${pctOf(summary.itemsBehind)}% del plan`, ink: '#9A3412', fill: '#FFF7ED' },
    { label: 'SIN MOTIVO', value: String(summary.itemsWithoutDelayReason), note: `${pctOf(summary.itemsWithoutDelayReason)}% del plan`, ink: '#9F1239', fill: '#FFF1F2' },
  ]
  const cardGap = 14
  const cardX0 = 40
  const cardW = (width - 80 - cardGap * (cards.length - 1)) / cards.length
  const cardY = 108
  const cardH = 92
  cards.forEach((card, index) => {
    const x = cardX0 + index * (cardW + cardGap)
    fillRound(ctx, x, cardY, cardW, cardH, 10, card.fill)
    ctx.strokeStyle = '#E2E8F0'
    ctx.stroke()
    ctx.fillStyle = SLATE_MUTED
    ctx.font = '700 12px Calibri, Segoe UI, Arial, sans-serif'
    ctx.fillText(card.label, x + 14, cardY + 24)
    ctx.fillStyle = card.ink
    ctx.font = '700 30px Calibri, Segoe UI, Arial, sans-serif'
    ctx.fillText(card.value, x + 14, cardY + 58)
    ctx.fillStyle = SLATE_MUTED
    ctx.font = '13px Calibri, Segoe UI, Arial, sans-serif'
    ctx.fillText(card.note, x + 14, cardY + 78)
  })

  const barY = 224
  const barX = 40
  const barW = width - 80
  const barH = 28
  fillRound(ctx, barX, barY, barW, barH, 8, '#E2E8F0')
  const realW = Math.max(0, Math.min(barW, (real / 100) * barW))
  if (realW > 0) fillRound(ctx, barX, barY, realW, barH, 8, real >= 100 ? '#059669' : '#EA580C')
  ctx.fillStyle = real > 12 ? '#FFFFFF' : SLATE
  ctx.font = '700 14px Calibri, Segoe UI, Arial, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText(`${real}% de 100%`, barX + 12, barY + 19)

  const stages = [
    { label: 'Diseño', value: stagesAvg.diseno, color: '#0284C7' },
    { label: 'Programación', value: stagesAvg.programacion, color: '#7C3AED' },
    { label: 'Maquinado', value: stagesAvg.maquinado, color: '#EA580C' },
    { label: 'Armado', value: stagesAvg.armado, color: '#059669' },
  ]
  const stageTop = 268
  const rowH = 58
  stages.forEach((stage, index) => {
    const y = stageTop + index * rowH
    ctx.fillStyle = SLATE
    ctx.font = '700 18px Calibri, Segoe UI, Arial, sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText(stage.label, 40, y + 18)
    ctx.fillStyle = SLATE_MUTED
    ctx.font = '13px Calibri, Segoe UI, Arial, sans-serif'
    ctx.fillText(`Falta ${Math.max(0, 100 - stage.value)}% para la meta`, 40, y + 38)
    const trackX = 280
    const trackW = width - 440
    const trackY = y
    fillRound(ctx, trackX, trackY, trackW, 22, 8, '#E2E8F0')
    const fillW = Math.max(0, Math.min(trackW, (stage.value / 100) * trackW))
    if (fillW > 0) fillRound(ctx, trackX, trackY, fillW, 22, 8, stage.color)
    ctx.textAlign = 'right'
    ctx.fillStyle = stage.color
    ctx.font = '700 26px Calibri, Segoe UI, Arial, sans-serif'
    ctx.fillText(`${stage.value}%`, width - 40, y + 20)
    ctx.textAlign = 'left'
  })

  const activeItems = shopItems.filter((item) => !item.projectTerminado)
  const activeAvg = activeItems.length === 0 ? 0 : Math.round(activeItems.reduce((sum, item) => sum + item.actualOverallPct, 0) / activeItems.length)
  const missing = Math.max(0, 100 - real)
  const whyLines =
    total === 0
      ? ['No hay trabajos en este plan.']
      : real >= 100
        ? [
            `Los ${total} trabajos del plan ya están terminados.`,
            'Por eso la semana queda en 100%.',
            ...(externalCount > 0
              ? [`${externalCount} están en otro taller. Esos no entran al porcentaje.`]
              : []),
          ]
        : [
            `Hay ${total} trabajos en el plan.`,
            `${summary.itemsCompleted} ya terminaron. Esos cuentan como 100%.`,
            `${summary.itemsActive} siguen abiertos. Entre ellos el avance es ${activeAvg}%.`,
            `Al juntar los ${total}, la semana queda en ${real}%.`,
            ...(externalCount > 0
              ? [`${externalCount} están en otro taller. Esos no entran al porcentaje.`]
              : []),
          ]
  const gapLines =
    real >= 100
      ? ['No falta nada. La meta ya se cumplió.']
      : [
          `La meta es 100%. Falta ${missing}%.`,
          ...stages.map((stage) => {
            const gap = Math.max(0, 100 - stage.value)
            return gap === 0 ? `${stage.label}: listo, va en 100%.` : `${stage.label}: va en ${stage.value}%. Le falta ${gap}%.`
          }),
        ]

  const boxY = stageTop + stages.length * rowH + 8
  const boxH = Math.max(240, height - boxY - 28)
  fillRound(ctx, 28, boxY, width - 56, boxH, 12, '#FFFFFF')
  ctx.strokeStyle = '#CBD5E1'
  ctx.lineWidth = 1.5
  ctx.stroke()

  const colGap = 36
  const colW = (width - 56 - 48 - colGap) / 2
  const leftX = 52
  const rightX = leftX + colW + colGap
  drawBulletColumn(ctx, leftX, boxY + 28, colW, `Por qué sale ${real}%`, whyLines, '#0284C7')
  drawBulletColumn(ctx, rightX, boxY + 28, colW, 'Qué falta', gapLines, '#EA580C')
  return canvas
}

function drawBulletColumn(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  title: string,
  lines: string[],
  color: string,
) {
  ctx.fillStyle = color
  ctx.font = '700 26px Calibri, Segoe UI, Arial, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText(title, x, y + 8)
  let cursor = y + 48
  ctx.font = '22px Calibri, Segoe UI, Arial, sans-serif'
  for (const line of lines) {
    ctx.beginPath()
    ctx.fillStyle = color
    ctx.arc(x + 7, cursor - 6, 5, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#1E293B'
    cursor = drawWrapped(ctx, line, x + 24, cursor, width - 24, 30)
    cursor += 14
  }
}

function drawWrapped(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number): number {
  const words = text.split(' ')
  let line = ''
  let cursor = y
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width > maxW && line) {
      ctx.fillText(line, x, cursor)
      line = word
      cursor += lineH
    } else {
      line = next
    }
  }
  if (line) {
    ctx.fillText(line, x, cursor)
    cursor += lineH
  }
  return cursor
}

export function canvasToPngDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/png')
}

export async function canvasToPngArrayBuffer(canvas: HTMLCanvasElement): Promise<ArrayBuffer> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'))
  if (!blob) throw new Error('No se pudo generar la gráfica')
  return blob.arrayBuffer()
}
