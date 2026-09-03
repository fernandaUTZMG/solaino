import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatProduccionSemanalTitleRange, produccionSemanalTasksForPdf, PRODUCCION_SEMANAL_WEEKDAYS } from './bodegaProduccionSemanalFormat'
import { downloadBlob, loadSolainoLogoDataUrl, safeExportFilenamePart } from './bodegaWeeklyPlanExportCommon'
import type { ProduccionSemanalBundle } from './bodegaProduccionSemanalRepo'

const MARGIN = 12
const PAGE_W = 297

type JsPdfWithTable = jsPDF & { lastAutoTable?: { finalY: number } }

function cellLines(text: string): string {
  return produccionSemanalTasksForPdf(text)
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

  if (!logoDataUrl) {
    doc.setFontSize(8)
    doc.setTextColor(120, 120, 120)
    doc.text('Solaino — Soluciones integrales', PAGE_W / 2, 29, { align: 'center' })
  }

  return bandH + 6
}

export async function downloadProduccionSemanalPdf(bundle: ProduccionSemanalBundle): Promise<void> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' }) as JsPdfWithTable
  const logo = await loadSolainoLogoDataUrl()
  let y = drawHeader(doc, bundle, logo)

  const head = [
    'Día',
    bundle.plan.disenadora_label,
    bundle.plan.programacion_label,
    bundle.plan.maquinado_label,
    'Comentarios',
  ]

  const body = bundle.days.map((day) => [
    PRODUCCION_SEMANAL_WEEKDAYS[day.day_index] ?? `Día ${day.day_index + 1}`,
    cellLines(day.disenadora),
    cellLines(day.programacion),
    cellLines(day.maquinado),
    cellLines(day.comentarios),
  ])

  autoTable(doc, {
    startY: y,
    head: [head],
    body,
    margin: { left: MARGIN, right: MARGIN },
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: 3,
      valign: 'top',
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
      textColor: [30, 30, 30],
    },
    headStyles: {
      fillColor: [189, 215, 238],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      halign: 'center',
    },
    columnStyles: {
      0: { cellWidth: 22, fontStyle: 'bold' },
      1: { cellWidth: 58 },
      2: { cellWidth: 58 },
      3: { cellWidth: 58 },
      4: { cellWidth: 52 },
    },
    theme: 'grid',
  })

  const weekPart = safeExportFilenamePart(bundle.plan.week_start)
  const blob = doc.output('blob')
  downloadBlob(`SOLAINO-produccion-semanal-${weekPart}.pdf`, blob)
}
