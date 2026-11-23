import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatProduccionSemanalTitleRange, produccionSemanalTasksForPdf, PRODUCCION_SEMANAL_WEEKDAYS } from './bodegaProduccionSemanalFormat'
import type { ProduccionSemanalDayRow, ProduccionSemanalBundle } from './bodegaProduccionSemanalRepo'
import {
  armadoHelpersLabel,
  produccionDayScore,
  produccionWeekScore,
  summarizeProduccionWeek,
  taskProgressBadge,
  type ProduccionLiveTone,
  type ProduccionProjectLive,
  type ProduccionSemanalTask,
  type ProduccionTaskLane,
} from './bodegaProduccionSemanalTasks'
import { produccionCausaDurationLabel, produccionCausaElapsedSeconds, type ProduccionCausaEvento } from './bodegaProduccionCausasRepo'
import { downloadBlob, loadSolainoLogoDataUrl, safeExportFilenamePart } from './bodegaWeeklyPlanExportCommon'

const MARGIN = 12
const PAGE_W = 297
const PAGE_H = 210

type JsPdfWithTable = jsPDF & { lastAutoTable?: { finalY: number } }
type RGB = [number, number, number]

const INK = {
  slate: [15, 23, 42] as RGB,
  sky: [7, 89, 133] as RGB,
  amberTitle: [180, 83, 9] as RGB,
  emeraldFill: [209, 250, 229] as RGB,
  emeraldInk: [6, 78, 59] as RGB,
  skyFill: [224, 242, 254] as RGB,
  skyInk: [8, 47, 73] as RGB,
  amberFill: [254, 243, 199] as RGB,
  amberInk: [69, 26, 3] as RGB,
  idleFill: [241, 245, 249] as RGB,
  idleInk: [71, 85, 105] as RGB,
  lista: [6, 95, 70] as RGB,
  falta: [146, 64, 14] as RGB,
  helper: [51, 65, 85] as RGB,
}

type PdfSpan = { text: string; color: RGB; bold?: boolean; fill?: RGB; rule?: boolean }

const PDF_FONT = 6.5
const PDF_PAD = 1.4

function toneInk(tone: ProduccionLiveTone): { fill: RGB; color: RGB } {
  if (tone === 'done') return { fill: INK.emeraldFill, color: INK.emeraldInk }
  if (tone === 'progress') return { fill: INK.skyFill, color: INK.skyInk }
  if (tone === 'wait') return { fill: INK.amberFill, color: INK.amberInk }
  return { fill: INK.idleFill, color: INK.idleInk }
}

function taskSpans(
  tasks: ProduccionSemanalTask[],
  lane: ProduccionTaskLane,
  liveByProject: Map<string, ProduccionProjectLive> | undefined,
): PdfSpan[] {
  if (tasks.length === 0) return [{ text: '—', color: INK.idleInk }]
  const spans: PdfSpan[] = []
  tasks.forEach((task, index) => {
    if (index > 0) spans.push({ text: '', color: INK.slate, rule: true })
    spans.push({ text: task.text, color: index % 2 === 0 ? INK.sky : INK.amberTitle, bold: true })
    const helped = armadoHelpersLabel(task.helpers)
    if (helped) spans.push({ text: helped, color: INK.helper })
    const badge = taskProgressBadge(task, lane, liveByProject)
    if (!badge || badge.label === 'Cargando avance…') return
    const tone = toneInk(badge.tone)
    spans.push({ text: badge.label, color: tone.color, fill: tone.fill, bold: true })
    for (const piece of badge.pieces) {
      spans.push({
        text: [piece.done ? 'Lista' : 'Falta', piece.name, piece.timeLabel].filter(Boolean).join('  ·  '),
        color: piece.done ? INK.lista : INK.falta,
      })
    }
  })
  return spans
}

function realSpans(score: ReturnType<typeof produccionDayScore>): PdfSpan[] {
  if (score.goals.length === 0) return [{ text: '—', color: INK.idleInk }]
  const spans: PdfSpan[] = []
  if (score.real != null) {
    spans.push({
      text: `${score.real}%`,
      color: score.real >= 100 ? INK.emeraldInk : INK.amberInk,
      bold: true,
    })
  }
  spans.push({ text: 'Cumplido', color: INK.emeraldInk, fill: INK.emeraldFill, bold: true })
  if (score.done.length === 0) spans.push({ text: 'Nada todavía', color: INK.idleInk })
  else {
    for (const line of score.done) {
      spans.push({ text: `${line.lane}: ${line.text} · ${line.detail}`, color: INK.lista })
    }
  }
  spans.push({ text: 'Falta', color: INK.amberInk, fill: INK.amberFill, bold: true })
  if (score.missing.length === 0) spans.push({ text: 'Nada pendiente', color: INK.lista })
  else {
    for (const line of score.missing) {
      spans.push({ text: `${line.lane}: ${line.text} · ${line.detail}`, color: INK.falta })
    }
  }
  return spans
}

function commentSpans(notes: string, gaps: string[], causas: string[]): PdfSpan[] {
  const spans: PdfSpan[] = []
  const typed = produccionSemanalTasksForPdf(notes)
  if (typed && typed !== '—') {
    for (const line of typed.split('\n')) spans.push({ text: line, color: INK.slate })
  }
  for (const gap of gaps) spans.push({ text: gap, color: INK.falta })
  for (const causa of causas) spans.push({ text: causa, color: INK.amberTitle })
  if (spans.length === 0) spans.push({ text: '—', color: INK.idleInk })
  return spans
}

function causaLines(eventos: ProduccionCausaEvento[] | undefined, dayId: string): string[] {
  return (eventos ?? [])
    .filter((event) => event.day_id === dayId)
    .map((event) => {
      const label = produccionCausaDurationLabel(produccionCausaElapsedSeconds(event, Date.now()))
      return event.ended_at == null ? `${event.nombre} · ${label} (en curso)` : `${event.nombre} · ${label}`
    })
}

function wrapSpan(doc: jsPDF, span: PdfSpan, width: number): string[] {
  doc.setFontSize(PDF_FONT)
  doc.setFont('helvetica', span.bold ? 'bold' : 'normal')
  if (span.rule) return ['']
  return doc.splitTextToSize(span.text || ' ', Math.max(8, width)) as string[]
}

function lineHeightMm(doc: jsPDF): number {
  return (PDF_FONT * 1.15) / doc.internal.scaleFactor
}

function innerTextWidth(columnWidth: number): number {
  return Math.max(8, columnWidth - PDF_PAD * 2 - 0.6)
}

/** Parte el texto de una columna en bloques que caben en una hoja. */
function chunkSpans(doc: jsPDF, spans: PdfSpan[], width: number, maxLines: number): PdfSpan[][] {
  const lines: PdfSpan[] = []
  for (const span of spans) {
    if (span.rule) {
      lines.push({ text: '', color: span.color, rule: true })
      continue
    }
    for (const text of wrapSpan(doc, span, width)) {
      lines.push({ text, color: span.color, bold: span.bold, fill: span.fill })
    }
  }
  if (lines.length === 0) return [[]]
  const chunks: PdfSpan[][] = []
  const size = Math.max(1, maxLines)
  for (let i = 0; i < lines.length; i += size) chunks.push(lines.slice(i, i + size))
  return chunks
}

function paintSpans(
  doc: jsPDF,
  cell: { x: number; y: number; width: number; height: number },
  spans: PdfSpan[],
  lineH: number,
) {
  const x = cell.x + PDF_PAD
  const maxW = innerTextWidth(cell.width)
  const bottom = cell.y + cell.height - 0.5
  doc.setFontSize(PDF_FONT)
  doc.saveGraphicsState()
  doc.rect(cell.x + 0.25, cell.y + 0.25, Math.max(1, cell.width - 0.5), Math.max(1, cell.height - 0.5))
  doc.clip()
  doc.discardPath()
  let cursor = cell.y + PDF_PAD
  try {
  for (const span of spans) {
    if (cursor + lineH > bottom) return
    if (span.rule) {
      const y = cursor + lineH * 0.45
      doc.setDrawColor(203, 213, 225)
      doc.setLineWidth(0.2)
      doc.line(x, y, x + maxW, y)
    } else if (span.text) {
      const baseline = cursor + lineH * 0.78
      if (span.fill) {
        doc.setFont('helvetica', span.bold ? 'bold' : 'normal')
        const w = Math.min(maxW, doc.getTextWidth(span.text) + 1.3)
        doc.setFillColor(...span.fill)
        doc.roundedRect(x - 0.3, cursor + 0.35, w, lineH - 0.25, 0.4, 0.4, 'F')
      }
      doc.setFont('helvetica', span.bold ? 'bold' : 'normal')
      doc.setTextColor(...span.color)
      doc.text(span.text, x, baseline)
    }
    cursor += lineH
  }
  } finally {
    doc.restoreGraphicsState()
  }
}

function drawKpis(
  doc: jsPDF,
  y: number,
  bundle: ProduccionSemanalBundle,
  liveByProject: Map<string, ProduccionProjectLive> | undefined,
): number {
  const summary = summarizeProduccionWeek(bundle.days)
  const week = produccionWeekScore(bundle.days, liveByProject)
  const boxes = [
    { label: 'Meta semanal', value: week.meta == null ? '—' : `${week.meta}%`, color: [15, 23, 42] as RGB },
    {
      label: 'Avance real semanal',
      value: week.real == null ? '—' : `${week.real}%`,
      color: (week.real != null && week.real >= 100 ? INK.emeraldInk : INK.amberInk) as RGB,
    },
    { label: 'Tareas', value: String(summary.tareas), color: [15, 23, 42] as RGB },
    { label: 'Con proyecto', value: String(summary.conProyecto), color: INK.skyInk },
    { label: 'Avance a mano', value: String(summary.marcadas), color: INK.emeraldInk },
    { label: 'Sin avance a mano', value: String(summary.sinTocar), color: INK.amberInk },
  ]
  const gap = 3
  const boxW = (PAGE_W - MARGIN * 2 - gap * (boxes.length - 1)) / boxes.length
  let x = MARGIN
  for (const box of boxes) {
    doc.setDrawColor(189, 215, 238)
    doc.setFillColor(248, 250, 252)
    doc.roundedRect(x, y, boxW, 14, 1.5, 1.5, 'FD')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(100, 116, 139)
    doc.text(box.label, x + boxW / 2, y + 5, { align: 'center' })
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(...box.color)
    doc.text(box.value, x + boxW / 2, y + 11, { align: 'center' })
    x += boxW + gap
  }
  return y + 18
}

function drawHeader(doc: jsPDF, bundle: ProduccionSemanalBundle, logoDataUrl: string | null): number {
  const bandH = 34
  const logoW = 52
  const logoH = 18
  doc.setFillColor(255, 255, 255)
  doc.rect(0, 0, PAGE_W, bandH, 'F')
  doc.setDrawColor(200, 200, 200)
  doc.setLineWidth(0.3)
  doc.line(MARGIN, bandH, PAGE_W - MARGIN, bandH)

  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, 'PNG', MARGIN, 8, logoW, logoH)
    } catch {
      /* sin imagen */
    }
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(24)
  doc.setTextColor(0, 0, 0)
  doc.text('PRODUCCIÓN', PAGE_W / 2, 14, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(50, 50, 50)
  doc.text(formatProduccionSemanalTitleRange(bundle.plan.week_start), PAGE_W / 2, 22, { align: 'center' })

  doc.setFontSize(8)
  doc.setTextColor(100, 116, 139)
  doc.text('Solaino — Soluciones integrales', PAGE_W / 2, 29, { align: 'center' })

  return bandH + 4
}

export async function downloadProduccionSemanalPdf(
  bundle: ProduccionSemanalBundle,
  liveByProject?: Map<string, ProduccionProjectLive>,
  causaEventos?: ProduccionCausaEvento[],
): Promise<void> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' }) as JsPdfWithTable
  const logo = await loadSolainoLogoDataUrl()
  let y = drawHeader(doc, bundle, logo)
  y = drawKpis(doc, y, bundle, liveByProject)

  const head = [
    'DÍA',
    bundle.plan.disenadora_label.toUpperCase(),
    bundle.plan.programacion_label.toUpperCase(),
    bundle.plan.maquinado_label.toUpperCase(),
    'ARMADO',
    'META DIARIA',
    'AVANCE REAL',
    'COMENTARIOS',
  ]

  const rawWidths = [16, 30, 30, 30, 34, 42, 50, 40]
  const rawSum = rawWidths.reduce((sum, width) => sum + width, 0)
  const tableW = PAGE_W - MARGIN * 2
  let assigned = 0
  const columnWidths = rawWidths.map((width, index) => {
    if (index === rawWidths.length - 1) return Math.round((tableW - assigned) * 100) / 100
    const next = Math.floor(((width / rawSum) * tableW) * 100) / 100
    assigned += next
    return next
  })
  const bottomMargin = 16
  const topMargin = 12
  const lineH = lineHeightMm(doc)
  const headH = 8
  const room = Math.min(PAGE_H - y - bottomMargin - headH, PAGE_H - topMargin - bottomMargin - headH) - 4
  const maxLines = Math.max(8, Math.min(28, Math.floor((room - PDF_PAD * 2) / lineH)))

  const painted: PdfSpan[][][] = []
  const rowDay: number[] = []
  const body: string[][] = []

  bundle.days.forEach((day: ProduccionSemanalDayRow) => {
    const score = produccionDayScore(day, liveByProject)
    const columns: PdfSpan[][] = [
      [],
      taskSpans(day.disenadora_tareas, 'disenadora', liveByProject),
      taskSpans(day.programacion_tareas, 'programacion', liveByProject),
      taskSpans(day.maquinado_tareas, 'maquinado', liveByProject),
      taskSpans(day.armado_tareas, 'armado', liveByProject),
      score.goals.length === 0
        ? [{ text: '—', color: INK.idleInk }]
        : score.goals.map((goal, index) => ({
            text: `${goal.lane}: ${goal.text}`,
            color: index % 2 === 0 ? INK.sky : INK.amberTitle,
          })),
      realSpans(score),
      commentSpans(day.comentarios, score.gaps, causaLines(causaEventos, day.id)),
    ]
    const chunks = columns.map((spans, index) =>
      index === 0 ? [[]] : chunkSpans(doc, spans, innerTextWidth(columnWidths[index] ?? 20), maxLines),
    )
    const parts = Math.max(1, ...chunks.map((part) => part.length))
    const dayName = PRODUCCION_SEMANAL_WEEKDAYS[day.day_index] ?? `Día ${day.day_index + 1}`
    for (let part = 0; part < parts; part += 1) {
      rowDay.push(day.day_index)
      const rowSpans = chunks.map((partSpans) => partSpans[part] ?? [])
      painted.push(rowSpans)
      body.push(
        rowSpans.map((spans, index) => {
          if (index === 0) return part === 0 ? dayName : `${dayName}\n(sigue)`
          if (spans.length === 0) return ' '
          return spans.map((span) => (span.rule ? ' ' : span.text || ' ')).join('\n')
        }),
      )
    }
  })

  autoTable(doc, {
    startY: y,
    head: [head],
    body,
    margin: { top: topMargin, left: MARGIN, right: MARGIN, bottom: bottomMargin },
    theme: 'grid',
    rowPageBreak: 'avoid',
    showHead: 'everyPage',
    styles: {
      font: 'helvetica',
      fontSize: PDF_FONT,
      cellPadding: PDF_PAD,
      valign: 'top',
      overflow: 'linebreak',
      lineColor: [148, 163, 184],
      lineWidth: 0.2,
      textColor: [15, 23, 42],
    },
    headStyles: {
      fillColor: [189, 215, 238],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      halign: 'center',
      fontSize: 7,
      overflow: 'linebreak',
    },
    columnStyles: {
      0: { cellWidth: columnWidths[0], fontStyle: 'bold', fillColor: [241, 245, 249] },
      1: { cellWidth: columnWidths[1] },
      2: { cellWidth: columnWidths[2] },
      3: { cellWidth: columnWidths[3] },
      4: { cellWidth: columnWidths[4] },
      5: { cellWidth: columnWidths[5] },
      6: { cellWidth: columnWidths[6] },
      7: { cellWidth: columnWidths[7] },
    },
    didParseCell: (data) => {
      if (data.section !== 'body') return
      const dayIndex = rowDay[data.row.index] ?? 0
      if (data.column.index !== 0) {
        data.cell.styles.fillColor = dayIndex % 2 === 0 ? [255, 255, 255] : [248, 250, 252]
      }
      const spans = painted[data.row.index]?.[data.column.index]
      if (!spans || spans.length === 0) return
      const textHeight = spans.length * lineH + PDF_PAD * 2 + 1.2
      data.cell.styles.minCellHeight = textHeight
    },
    willDrawCell: (data) => {
      const spans = data.section === 'body' ? painted[data.row.index]?.[data.column.index] : undefined
      if (spans && spans.length > 0) data.cell.text = []
    },
    didDrawCell: (data) => {
      const spans = data.section === 'body' ? painted[data.row.index]?.[data.column.index] : undefined
      if (!spans || spans.length === 0) return
      paintSpans(doc, data.cell, spans, lineH)
    },
    didDrawPage: (data) => {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(100, 116, 139)
      doc.text('SOLAINO  ·  Producción semanal', MARGIN, PAGE_H - 8)
      doc.text(`Página ${data.pageNumber}`, PAGE_W - MARGIN, PAGE_H - 8, { align: 'right' })
    },
  })

  const weekPart = safeExportFilenamePart(bundle.plan.week_start)
  const blob = doc.output('blob')
  downloadBlob(`SOLAINO-produccion-semanal-${weekPart}.pdf`, blob)
}
