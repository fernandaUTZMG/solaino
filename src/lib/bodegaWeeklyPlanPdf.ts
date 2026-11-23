import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { otherWorkshopPlanNote } from './bodegaExternalProvider'
import { formatWeekRangeEs } from './bodegaWeekCalendar'
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
import { weeklyPlanDisplayStatus, type BodegaWeeklyPlanItemEnriched } from './bodegaWeeklyPlanRepo'

const MARGIN = 10
const PAGE_W = 297
const PAGE_H = 210

type JsPdfWithTable = jsPDF & { lastAutoTable?: { finalY: number } }

function itemTableBody(items: BodegaWeeklyPlanItemEnriched[]) {
  return items.map((it, index) => {
    const otherShop = it.externalShop ? otherWorkshopPlanNote(it.proveedor) : null
    const stages = otherShop
      ? [
          {
            content: `${otherShop.place} ${otherShop.close}`,
            colSpan: 4,
            styles: {
              halign: 'left' as const,
              valign: 'middle' as const,
              fontStyle: 'bold' as const,
              fontSize: 6.5,
              textColor: [146, 64, 14] as [number, number, number],
            },
          },
        ]
      : [`${it.actual.diseno}%`, `${it.actual.programacion}%`, `${it.actual.maquinado}%`, `${it.actual.armado}%`]
    return [
      String(index + 1),
      (it.cliente || '—').toUpperCase(),
      (it.requisitor || '—').toUpperCase(),
      it.po_numero || '—',
      formatPlanDateLongEs(it.po_fecha),
      otherShop
        ? `${it.proyecto_nombre.toUpperCase()}\n${otherShop.place} ${otherShop.close}`
        : it.proyecto_nombre.toUpperCase(),
      (it.proveedor || '—').toUpperCase(),
      ...stages,
      formatPlanDateLongEs(it.fecha_entrega),
      (weeklyPlanDisplayStatus(it) || '—').toUpperCase(),
      it.factura || '',
    ]
  })
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
  doc.text(formatWeekRangeEs(entry.weekStart), PAGE_W / 2, 21, {
    align: 'center',
  })
  doc.setFontSize(8)
  doc.setTextColor(127, 127, 127)
  doc.text(PLAN_EXPORT_BRAND, PAGE_W / 2, 27, { align: 'center' })

  return bandH + 4
}

function drawKpiStrip(doc: jsPDF, y: number, entry: WeeklyPlanExportWeek): number {
  const summary = entry.bundle.weekSummary
  const boxes: { label: string; value: string }[] = [
    { label: 'Meta semanal', value: `${summary.plannedOverallPct}%` },
    { label: 'Avance real', value: `${summary.actualOverallPct}%` },
    { label: 'Con atraso', value: String(summary.itemsBehind) },
    { label: 'Finalizados', value: String(summary.itemsCompleted) },
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

function drawDataTable(doc: jsPDF, startY: number, entry: WeeklyPlanExportWeek): number {
  autoTable(doc, {
    startY,
    head: [HEADER_LABELS.map((label, index) => (index === 0 ? '#' : label))],
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
      5: { cellWidth: 34, halign: 'left' },
      6: { cellWidth: 22, halign: 'left' },
      7: { cellWidth: 13, halign: 'center', minCellHeight: 8 },
      8: { cellWidth: 13, halign: 'center', minCellHeight: 8 },
      9: { cellWidth: 13, halign: 'center', minCellHeight: 8 },
      10: { cellWidth: 13, halign: 'center', minCellHeight: 8 },
      11: { cellWidth: 24, fontSize: 6 },
      12: { cellWidth: 15, halign: 'center' },
      13: { cellWidth: 14, fillColor: COLORS.facturaYellowPdf },
    },
    margin: { left: MARGIN, right: MARGIN },
    didParseCell: (data) => {
      if (data.section !== 'body') return
      const it = entry.bundle.items[data.row.index]
      if (!it) return
      if (it.projectTerminado) {
        data.cell.styles.fillColor = COLORS.doneGreenPdf
      }
      if (data.column.index === 13) {
        data.cell.styles.fillColor = COLORS.facturaYellowPdf
      }
      if (data.column.index === 12 && /entregado|terminado/i.test(String(it.status_label))) {
        data.cell.styles.textColor = COLORS.statusRedPdf
        data.cell.styles.fontStyle = 'bold'
      }
      if (data.column.index >= 7 && data.column.index <= 10 && !it.externalShop) {
        data.cell.text = []
      }
    },
    didDrawCell: (data) => {
      if (data.section !== 'body') return
      if (data.column.index < 7 || data.column.index > 10) return
      const it = entry.bundle.items[data.row.index]
      if (!it || it.externalShop) return
      const stages = ['diseno', 'programacion', 'maquinado', 'armado'] as const
      const stage = stages[data.column.index - 7]
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7)
      const pct = it.actual[stage]
      const behind = !it.projectTerminado && it.lagStages.includes(stage)
      doc.setTextColor(behind ? 159 : 6, behind ? 18 : 95, behind ? 57 : 70)
      doc.text(`${pct}%`, data.cell.x + data.cell.width / 2, data.cell.y + data.cell.height / 2 + 1, {
        align: 'center',
        baseline: 'middle',
      })
    },
  })
  return (doc as JsPdfWithTable).lastAutoTable?.finalY ?? startY
}

function drawWeekSection(
  doc: jsPDF,
  y: number,
  title: string,
  rows: string[][],
  fill: [number, number, number],
  ink: [number, number, number],
): number {
  if (y > PAGE_H - 40) {
    doc.addPage('a4', 'l')
    y = MARGIN
  }
  autoTable(doc, {
    startY: y,
    head: [
      [{ content: title, colSpan: 2, styles: { fillColor: fill, textColor: ink, halign: 'left', fontSize: 11 } }],
      [
        { content: 'Proyecto', styles: { fillColor: fill, textColor: ink } },
        { content: 'Detalle', styles: { fillColor: fill, textColor: ink } },
      ],
    ],
    body: rows.length > 0 ? rows : [['—', 'Nada en esta semana.']],
    margin: { left: MARGIN, right: MARGIN, bottom: 14 },
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: 2.2,
      valign: 'middle',
      textColor: [15, 23, 42],
      lineColor: [203, 213, 225],
      lineWidth: 0.2,
      overflow: 'linebreak',
    },
    headStyles: { fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 108, fontStyle: 'bold' },
      1: { cellWidth: 169 },
    },
  })
  return ((doc as JsPdfWithTable).lastAutoTable?.finalY ?? y) + 6
}

function drawWeekBriefPage(doc: jsPDF, entry: WeeklyPlanExportWeek, logoDataUrl: string | null): void {
  doc.addPage('a4', 'l')
  let y = MARGIN
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, 'PNG', MARGIN, y, 40, 14)
    } catch {
      /* ignore */
    }
  }
  doc.setFillColor(189, 215, 238)
  doc.roundedRect(MARGIN + 48, y, PAGE_W - MARGIN * 2 - 48, 16, 2, 2, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(15, 23, 42)
  doc.text(`Esta semana  ·  ${formatWeekRangeEs(entry.weekStart)}`, PAGE_W / 2 + 16, y + 7, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(71, 85, 105)
  doc.text('Meta 100%. Solo lo que pasó entre el lunes y el viernes.', PAGE_W / 2 + 16, y + 12.5, { align: 'center' })
  y += 22

  const jobs = entry.bundle.weekFocus.jobs
  const sections: Array<{ title: string; rows: string[][]; fill: [number, number, number]; ink: [number, number, number] }> = [
    {
      title: 'Se cumplió',
      fill: [209, 250, 229],
      ink: [6, 78, 59],
      rows: jobs.flatMap((job) => job.done.map((line) => [job.name, line])),
    },
    {
      title: 'Hizo falta',
      fill: [254, 243, 199],
      ink: [146, 64, 14],
      rows: jobs.flatMap((job) => job.missing.map((line) => [job.name, line])),
    },
    {
      title: 'En qué nos atrasamos',
      fill: [255, 228, 230],
      ink: [159, 18, 57],
      rows: jobs.flatMap((job) => job.behind.map((line) => [job.name, line])),
    },
    {
      title: 'En qué hay que trabajar',
      fill: [224, 242, 254],
      ink: [7, 89, 133],
      rows: jobs.filter((job) => job.workOn.length > 0).map((job) => [job.name, job.workOn.join('  ·  ')]),
    },
  ]
  for (const section of sections) {
    y = drawWeekSection(doc, y, section.title, section.rows, section.fill, section.ink)
  }
}

function addWeekToPdf(doc: jsPDF, entry: WeeklyPlanExportWeek, logo: string | null, isFirst: boolean): void {
  if (!isFirst) doc.addPage('a4', 'l')
  let y = drawPdfHeader(doc, entry, logo)
  y = drawKpiStrip(doc, y, entry)
  drawDataTable(doc, y + 2, entry)
  drawWeekBriefPage(doc, entry, logo)
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
