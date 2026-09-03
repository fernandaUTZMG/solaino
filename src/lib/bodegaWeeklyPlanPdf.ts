import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { weeklyPlanPrioridadDisplay } from './bodegaProjectPrioridad'
import { formatWeekRangeEs } from './bodegaWeekCalendar'
import {
  canvasToPngDataUrl,
  renderWeeklyPlanMetaVsRealChart,
  renderWeeklyPlanStagesChart,
  renderWeeklyPlanSummaryChart,
} from './bodegaWeeklyPlanExportCharts'
import {
  downloadBlob,
  formatPlanDateLongEs,
  loadSolainoLogoDataUrl,
  safeExportFilenamePart,
  type WeeklyPlanExportWeek,
} from './bodegaWeeklyPlanExportCommon'
import {
  COLORS,
  HEADER_LABELS,
  PLAN_EXPORT_BRAND,
  PLAN_EXPORT_TITLE,
} from './bodegaWeeklyPlanExportTheme'
import type { BodegaWeeklyPlanItemEnriched } from './bodegaWeeklyPlanRepo'

const MARGIN = 10
const PAGE_W = 297
const PAGE_H = 210

type JsPdfWithTable = jsPDF & { lastAutoTable?: { finalY: number } }

function itemTableBody(items: BodegaWeeklyPlanItemEnriched[]): string[][] {
  return items.map((it) => [
    weeklyPlanPrioridadDisplay(it.prioridadNivel),
    (it.cliente || '—').toUpperCase(),
    (it.requisitor || '—').toUpperCase(),
    it.po_numero || '—',
    formatPlanDateLongEs(it.po_fecha),
    it.proyecto_nombre.toUpperCase(),
    `${it.actual.diseno}%`,
    `${it.actual.programacion}%`,
    `${it.actual.maquinado}%`,
    `${it.actual.armado}%`,
    formatPlanDateLongEs(it.fecha_entrega),
    (it.status_label || '—').toUpperCase(),
    it.factura || '',
  ])
}

function drawPdfHeader(doc: jsPDF, entry: WeeklyPlanExportWeek, logoDataUrl: string | null): number {
  const bandH = 32
  doc.setFillColor(255, 255, 255)
  doc.rect(0, 0, PAGE_W, bandH, 'F')
  doc.setDrawColor(217, 217, 217)
  doc.setLineWidth(0.3)
  doc.line(MARGIN, bandH, PAGE_W - MARGIN, bandH)

  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, 'PNG', MARGIN, 6, 52, 18)
    } catch {
      /* ignore */
    }
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.setTextColor(0, 0, 0)
  doc.text(PLAN_EXPORT_TITLE, PAGE_W / 2, 14, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(64, 64, 64)
  doc.text(`Plan de trabajo bodega  ·  ${formatWeekRangeEs(entry.weekStart)}`, PAGE_W / 2, 21, {
    align: 'center',
  })
  doc.setFontSize(8)
  doc.setTextColor(127, 127, 127)
  doc.text(PLAN_EXPORT_BRAND, PAGE_W / 2, 27, { align: 'center' })

  return bandH + 4
}

function drawKpiStrip(doc: jsPDF, y: number, entry: WeeklyPlanExportWeek): number {
  const s = entry.bundle.weekSummary
  const boxes: { label: string; value: string }[] = [
    { label: 'Meta semanal', value: `${s.plannedOverallPct}%` },
    { label: 'Avance real', value: `${s.actualOverallPct}%` },
    { label: 'Con atraso', value: String(s.itemsBehind) },
    { label: 'Finalizados', value: String(s.itemsCompleted) },
  ]
  const gap = 4
  const boxW = (PAGE_W - MARGIN * 2 - gap * 3) / 4
  let x = MARGIN
  boxes.forEach((b) => {
    doc.setDrawColor(189, 215, 238)
    doc.setFillColor(248, 250, 252)
    doc.roundedRect(x, y, boxW, 14, 2, 2, 'FD')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(100, 116, 139)
    doc.text(b.label, x + boxW / 2, y + 5, { align: 'center' })
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(0, 0, 0)
    doc.text(b.value, x + boxW / 2, y + 11, { align: 'center' })
    x += boxW + gap
  })
  return y + 18
}

function drawProgressBarInCell(
  doc: jsPDF,
  cell: { x: number; y: number; width: number; height: number },
  pct: number,
): void {
  const pad = 1.2
  const barH = Math.max(2, cell.height - pad * 2)
  const barY = cell.y + pad
  const barX = cell.x + pad
  const barW = cell.width - pad * 2
  doc.setFillColor(242, 242, 242)
  doc.rect(barX, barY, barW, barH, 'F')
  const fillW = (pct / 100) * barW
  if (fillW > 0) {
    doc.setFillColor(255, 192, 0)
    doc.rect(barX, barY, fillW, barH, 'F')
  }
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(0, 0, 0)
  doc.text(`${pct}%`, cell.x + cell.width / 2, cell.y + cell.height / 2 + 1, {
    align: 'center',
    baseline: 'middle',
  })
}

function drawDataTable(doc: jsPDF, startY: number, entry: WeeklyPlanExportWeek): number {
  autoTable(doc, {
    startY,
    head: [HEADER_LABELS as unknown as string[]],
    body: itemTableBody(entry.bundle.items),
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 7,
      cellPadding: 1.5,
      lineColor: [0, 0, 0],
      lineWidth: 0.15,
      textColor: [0, 0, 0],
      overflow: 'linebreak',
      valign: 'middle',
    },
    headStyles: {
      fillColor: COLORS.headerBluePdf,
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      fontSize: 7,
      halign: 'center',
      cellPadding: 2,
    },
    columnStyles: {
      0: { cellWidth: 11, halign: 'center' },
      1: { cellWidth: 18 },
      2: { cellWidth: 22 },
      3: { cellWidth: 16 },
      4: { cellWidth: 28, fontSize: 6 },
      5: { cellWidth: 38, halign: 'left' },
      6: { cellWidth: 14, halign: 'center', minCellHeight: 8 },
      7: { cellWidth: 14, halign: 'center', minCellHeight: 8 },
      8: { cellWidth: 14, halign: 'center', minCellHeight: 8 },
      9: { cellWidth: 14, halign: 'center', minCellHeight: 8 },
      10: { cellWidth: 28, fontSize: 6 },
      11: { cellWidth: 16, halign: 'center' },
      12: { cellWidth: 14, fillColor: COLORS.facturaYellowPdf },
    },
    margin: { left: MARGIN, right: MARGIN },
    didParseCell: (data) => {
      if (data.section !== 'body') return
      const it = entry.bundle.items[data.row.index]
      if (!it) return
      if (it.projectTerminado) {
        data.cell.styles.fillColor = COLORS.doneGreenPdf
      }
      if (data.column.index === 12) {
        data.cell.styles.fillColor = COLORS.facturaYellowPdf
      }
      if (data.column.index === 11 && /entregado|terminado/i.test(String(it.status_label))) {
        data.cell.styles.textColor = COLORS.statusRedPdf
        data.cell.styles.fontStyle = 'bold'
      }
      if (data.column.index >= 6 && data.column.index <= 9) {
        data.cell.text = []
      }
    },
    didDrawCell: (data) => {
      if (data.section !== 'body') return
      if (data.column.index < 6 || data.column.index > 9) return
      const it = entry.bundle.items[data.row.index]
      if (!it) return
      const pcts = [it.actual.diseno, it.actual.programacion, it.actual.maquinado, it.actual.armado]
      const pct = pcts[data.column.index - 6] ?? 0
      drawProgressBarInCell(doc, data.cell, pct)
    },
  })
  return (doc as JsPdfWithTable).lastAutoTable?.finalY ?? startY
}

function drawChartsPage(doc: jsPDF, entry: WeeklyPlanExportWeek, logoDataUrl: string | null): void {
  doc.addPage('a4', 'l')
  let y = MARGIN
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, 'PNG', MARGIN, y, 40, 14)
    } catch {
      /* ignore */
    }
  }
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(0, 0, 0)
  doc.text(`Gráficas — ${formatWeekRangeEs(entry.weekStart)}`, PAGE_W / 2, y + 10, { align: 'center' })
  y += 22

  const w = (PAGE_W - MARGIN * 2 - 6) / 2
  const h = 72
  try {
    const s1 = canvasToPngDataUrl(renderWeeklyPlanSummaryChart(entry.bundle, 800, 340))
    const s2 = canvasToPngDataUrl(renderWeeklyPlanStagesChart(entry.bundle, 800, 340))
    const s3 = canvasToPngDataUrl(renderWeeklyPlanMetaVsRealChart(entry.bundle, 800, 340))
    doc.addImage(s1, 'PNG', MARGIN, y, w, h)
    doc.addImage(s2, 'PNG', MARGIN + w + 6, y, w, h)
    doc.addImage(s3, 'PNG', MARGIN, y + h + 8, PAGE_W - MARGIN * 2, h + 12)
  } catch {
    doc.setFontSize(10)
    doc.text('No se pudieron incrustar las gráficas.', MARGIN, y + 20)
  }
}

function addWeekToPdf(doc: jsPDF, entry: WeeklyPlanExportWeek, logo: string | null, isFirst: boolean): void {
  if (!isFirst) doc.addPage('a4', 'l')
  let y = drawPdfHeader(doc, entry, logo)
  y = drawKpiStrip(doc, y, entry)
  y = drawDataTable(doc, y + 2, entry)
  if (y > PAGE_H - 40 || entry.bundle.items.length > 12) {
    drawChartsPage(doc, entry, logo)
  } else {
    try {
      const w = (PAGE_W - MARGIN * 2 - 6) / 2
      const chartY = y + 6
      doc.addImage(
        canvasToPngDataUrl(renderWeeklyPlanSummaryChart(entry.bundle, 700, 280)),
        'PNG',
        MARGIN,
        chartY,
        w,
        38,
      )
      doc.addImage(
        canvasToPngDataUrl(renderWeeklyPlanStagesChart(entry.bundle, 700, 280)),
        'PNG',
        MARGIN + w + 6,
        chartY,
        w,
        38,
      )
    } catch {
      drawChartsPage(doc, entry, logo)
    }
  }
}

function addPdfFooters(doc: jsPDF): void {
  const n = doc.getNumberOfPages()
  for (let i = 1; i <= n; i++) {
    doc.setPage(i)
    doc.setFontSize(7)
    doc.setTextColor(127, 127, 127)
    doc.text(
      `${PLAN_EXPORT_BRAND}  ·  ${PLAN_EXPORT_TITLE}  ·  Página ${i} de ${n}`,
      PAGE_W / 2,
      PAGE_H - 5,
      { align: 'center' },
    )
  }
}

export async function downloadWeeklyPlanPdf(weeks: WeeklyPlanExportWeek[]): Promise<void> {
  if (weeks.length === 0) throw new Error('Selecciona al menos una semana.')
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const logo = await loadSolainoLogoDataUrl()

  weeks.forEach((entry, i) => {
    addWeekToPdf(doc, entry, logo, i === 0)
  })

  addPdfFooters(doc)
  const blob = doc.output('blob')
  const name =
    weeks.length === 1
      ? `maquinados-plan-${safeExportFilenamePart(weeks[0].weekStart)}.pdf`
      : `maquinados-plan-${weeks.length}-semanas.pdf`
  downloadBlob(name, blob)
}
