import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { sumOrdenTimeBreakdowns, type ProjectOrdenTimeBreakdown } from './bodegaProjectOrdenTimes'
import type { BodegaOcReportGroup, BodegaReportesBundle } from './bodegaReportesRepo'
import { formatWeekCell, quePasoEstaSemana, tallerWeekMinutes, type ReportAdvance } from './bodegaReportWeek'

const NAVY: [number, number, number] = [4, 26, 56]
const SLATE: [number, number, number] = [51, 65, 85]
const MARGIN = 12

type JsPdfWithTable = jsPDF & { lastAutoTable?: { finalY: number } }

function formatDateEs(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  try {
    return d.toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })
  } catch {
    return String(iso).slice(0, 10)
  }
}

function formatDateTimeEs(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  try {
    return d.toLocaleString('es-MX', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

async function loadSolainoLogoDataUrl(): Promise<string | null> {
  const { loadSolainoLogoArrayBuffer } = await import('./bodegaWeeklyPlanExportCommon')
  const buf = await loadSolainoLogoArrayBuffer()
  if (!buf) return null
  const blob = new Blob([buf], { type: 'image/png' })
  return blobToDataUrl(blob)
}

function pageBottom(doc: jsPDF): number {
  return doc.internal.pageSize.getHeight() - 12
}

function ensureSpace(doc: jsPDF, y: number, need: number): number {
  if (y + need > pageBottom(doc)) {
    doc.addPage()
    return MARGIN + 4
  }
  return y
}

function addPageFooter(doc: jsPDF, weekLabel: string): void {
  const n = doc.getNumberOfPages()
  const h = doc.internal.pageSize.getHeight()
  for (let i = 1; i <= n; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(...SLATE)
    doc.text(`SOLAINO — Reporte semanal ${weekLabel}`, MARGIN, h - 7)
    doc.text(`Página ${i} de ${n}`, doc.internal.pageSize.getWidth() - MARGIN, h - 7, { align: 'right' })
  }
}

export type ReportesPdfStats = {
  nOc: number
  nProjects: number
  nTerminados: number
  nEnCurso: number
  nConContratiempo: number
  nConNotas: number
  totalTimes: ProjectOrdenTimeBreakdown
  weekTimes: ProjectOrdenTimeBreakdown
}

export function computeReportesPdfStats(
  ocGroups: BodegaOcReportGroup[],
): ReportesPdfStats {
  let nProjects = 0
  let nTerminados = 0
  let nConContratiempo = 0
  let nConNotas = 0
  const parts: ProjectOrdenTimeBreakdown[] = []
  const weekParts: ProjectOrdenTimeBreakdown[] = []
  for (const g of ocGroups) {
    for (const pr of g.projects) {
      nProjects++
      if (pr.project.status === 'terminado') nTerminados++
      if (pr.project.design_contratiempo_notes) nConContratiempo++
      if (pr.activityNotes.length > 0) nConNotas++
      parts.push(pr.times)
      weekParts.push(pr.weekTimes)
    }
  }
  return {
    nOc: ocGroups.length,
    nProjects,
    nTerminados,
    nEnCurso: nProjects - nTerminados,
    nConContratiempo,
    nConNotas,
    totalTimes: sumOrdenTimeBreakdowns(parts),
    weekTimes: sumOrdenTimeBreakdowns(weekParts),
  }
}

function drawPdfHeader(doc: jsPDF, logoDataUrl: string | null, generatedAt: string, weekLabel: string): number {
  const w = doc.internal.pageSize.getWidth()
  doc.setFillColor(...NAVY)
  doc.rect(0, 0, w, 28, 'F')
  doc.setFillColor(245, 158, 11)
  doc.rect(0, 28, w, 1.4, 'F')

  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, 'PNG', MARGIN, 7, 38, 13)
    } catch {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(14)
      doc.setTextColor(255, 255, 255)
      doc.text('SOLAINO', MARGIN, 16)
    }
  } else {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.setTextColor(255, 255, 255)
    doc.text('SOLAINO', MARGIN, 16)
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(255, 255, 255)
  doc.text('Reporte semanal', w - MARGIN, 13, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(191, 219, 254)
  doc.text(`Semana ${weekLabel}   ·   ${formatDateTimeEs(generatedAt)}`, w - MARGIN, 20, { align: 'right' })
  return 36
}

function drawKpiRow(doc: jsPDF, y: number, stats: ReportesPdfStats, filterNote: string): number {
  const cards: Array<[string, string]> = [
    ['Órdenes', String(stats.nOc)],
    ['Proyectos', String(stats.nProjects)],
    ['Terminados', String(stats.nTerminados)],
    ['En curso', String(stats.nEnCurso)],
    ['Con contratiempo', String(stats.nConContratiempo)],
  ]
  const gap = 3
  const width = doc.internal.pageSize.getWidth() - MARGIN * 2
  const cardW = (width - gap * (cards.length - 1)) / cards.length
  cards.forEach(([label, value], i) => {
    const x = MARGIN + i * (cardW + gap)
    doc.setFillColor(248, 250, 252)
    doc.setDrawColor(226, 232, 240)
    doc.roundedRect(x, y, cardW, 16, 1.5, 1.5, 'FD')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(...NAVY)
    doc.text(value, x + 3, y + 7)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...SLATE)
    doc.text(label, x + 3, y + 12)
  })
  y += 20

  if (filterNote) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(8)
    doc.setTextColor(...SLATE)
    doc.text(filterNote, MARGIN, y, { maxWidth: width })
    y += 6
  }
  return y
}

function drawWeekNote(doc: jsPDF, y: number, weekNote: string): number {
  const note = weekNote.trim()
  if (!note) return y
  const width = doc.internal.pageSize.getWidth() - MARGIN * 2
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(120, 53, 15)
  const lines = doc.splitTextToSize(note, width - 8)
  const boxH = 8 + lines.length * 4.2
  doc.setFillColor(255, 247, 237)
  doc.setDrawColor(251, 191, 36)
  doc.roundedRect(MARGIN, y, width, boxH, 1.5, 1.5, 'FD')
  doc.setFontSize(7)
  doc.text('NOTA DE LA SEMANA', MARGIN + 4, y + 4.5)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(lines, MARGIN + 4, y + 9)
  return y + boxH + 5
}

function weekCells(t: ProjectOrdenTimeBreakdown, done?: Pick<ReportAdvance, 'disenoCumplido' | 'programacionCumplido' | 'maquinadoCumplido' | 'tallerCumplido'> | null): string[] {
  return [
    formatWeekCell(t.disenoMin, done?.disenoCumplido ?? false),
    formatWeekCell(t.programacionMin, done?.programacionCumplido ?? false),
    formatWeekCell(t.maquinadoMin, done?.maquinadoCumplido ?? false),
    formatWeekCell(tallerWeekMinutes(t), done?.tallerCumplido ?? false),
  ]
}

function quePasoColors(raw: unknown): { text: [number, number, number]; fill: [number, number, number] } | null {
  const text = String(raw ?? '')
  if (/ausente|No se maquinó|Sin movimiento|Esperando|falta|esperan la foto|siguen en proceso/i.test(text)) {
    return { text: [120, 53, 15], fill: [255, 247, 237] }
  }
  if (/Avanzó|Terminado|En revisión/i.test(text)) {
    return { text: [6, 78, 59], fill: [236, 253, 245] }
  }
  return null
}

function drawOcSection(doc: jsPDF, y: number, g: BodegaOcReportGroup, weekNote: string): number {
  const width = doc.internal.pageSize.getWidth() - MARGIN * 2
  y = ensureSpace(doc, y, 28)
  doc.setFillColor(...NAVY)
  doc.roundedRect(MARGIN, y, width, 12, 1.2, 1.2, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(255, 255, 255)
  doc.text(`OC ${g.numero}`, MARGIN + 3, y + 7.5)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  const meta = `${g.empresaNombre}  ·  ${g.solicitante}  ·  ${formatDateEs(g.ocFecha)}  ·  ${g.nTerminados}/${g.nProjects} terminados  ·  ${g.avgAvancePct}%`
  doc.text(meta, MARGIN + 42, y + 7.5, { maxWidth: width - 46 })
  y += 14

  const body = g.projects.map((pr) => {
    const p = pr.project
    const happened = quePasoEstaSemana({
      status: p.status,
      week: pr.weekTimes,
      contratiempo: p.design_contratiempo_notes,
      weekNote,
      advance: pr.advance,
    })
    return [
      `${p.folio}  ${p.nombre}`,
      ...weekCells(pr.weekTimes, pr.advance),
      `${pr.advance.headline} — ${happened}`,
    ]
  })
  const every = (flag: (a: ReportAdvance) => boolean) => g.projects.length > 0 && g.projects.every((pr) => flag(pr.advance))
  body.push([
    'Suma de la OC',
    ...weekCells(g.weekTimesSum, {
      disenoCumplido: every((a) => a.disenoCumplido),
      programacionCumplido: every((a) => a.programacionCumplido),
      maquinadoCumplido: every((a) => a.maquinadoCumplido),
      tallerCumplido: every((a) => a.tallerCumplido),
    }),
    '',
  ])

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    theme: 'plain',
    styles: { fontSize: 8, cellPadding: 2.2, lineColor: [226, 232, 240], lineWidth: 0.15 },
    headStyles: { fillColor: [241, 245, 249], textColor: NAVY, fontStyle: 'bold', fontSize: 8, halign: 'center' },
    bodyStyles: { textColor: [30, 41, 59], valign: 'middle' },
    head: [['Proyecto', 'Diseño', 'Programación', 'Maquinado', 'Taller', 'Qué pasó']],
    body,
    columnStyles: {
      0: { cellWidth: 62, fontStyle: 'bold' },
      1: { cellWidth: 26, halign: 'center' },
      2: { cellWidth: 32, halign: 'center' },
      3: { cellWidth: 28, halign: 'center' },
      4: { cellWidth: 24, halign: 'center' },
      5: { cellWidth: 'auto' },
    },
    didParseCell: (data) => {
      if (data.section !== 'body') return
      const last = data.row.index === body.length - 1
      if (last) {
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.fillColor = [241, 245, 249]
        data.cell.styles.textColor = NAVY
        return
      }
      if (data.column.index >= 1 && data.column.index <= 4 && String(data.cell.raw ?? '') === 'Cumplido') {
        data.cell.styles.textColor = [6, 78, 59]
        data.cell.styles.fontStyle = 'bold'
      }
      if (data.column.index === 5) {
        const colors = quePasoColors(data.cell.raw)
        if (colors) {
          data.cell.styles.textColor = colors.text
          data.cell.styles.fillColor = colors.fill
        }
      }
      else if (data.row.index % 2 === 1) data.cell.styles.fillColor = [248, 250, 252]
    },
  })
  return ((doc as JsPdfWithTable).lastAutoTable?.finalY ?? y) + 8
}

export type DownloadBodegaReportesPdfArgs = {
  bundle: BodegaReportesBundle
  ocGroups: BodegaOcReportGroup[]
  /** Texto opcional si el PDF refleja un filtro de búsqueda. */
  filterNote?: string
  /** Ausencias u otras aclaraciones de la semana. */
  weekNote?: string
}

/** Genera y descarga el PDF de reportes (OC, tiempos, contratiempos y notas). */
export async function downloadBodegaReportesPdf(args: DownloadBodegaReportesPdfArgs): Promise<void> {
  const { bundle, ocGroups, filterNote } = args
  const weekNote = args.weekNote?.trim() ?? ''
  const logo = await loadSolainoLogoDataUrl()
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const stats = computeReportesPdfStats(ocGroups)

  let y = drawPdfHeader(doc, logo, bundle.loadedAt, bundle.week.label)
  y = drawKpiRow(doc, y, stats, filterNote ?? '')
  y = drawWeekNote(doc, y, weekNote)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...NAVY)
  doc.text('Tiempo de esta semana (lun–vie, 8:00 a 17:30)', MARGIN, y)
  y += 4
  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    theme: 'plain',
    styles: { fontSize: 8, cellPadding: 2, halign: 'center' },
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold' },
    bodyStyles: { textColor: NAVY, fontStyle: 'bold', fillColor: [248, 250, 252] },
    head: [['Diseño', 'Programación', 'Maquinado', 'Taller']],
    body: [weekCells(stats.weekTimes)],
  })
  y = ((doc as JsPdfWithTable).lastAutoTable?.finalY ?? y) + 8

  y = ensureSpace(doc, y, 16)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(...NAVY)
  doc.text('Por orden de compra', MARGIN, y)
  y += 6

  if (ocGroups.length === 0) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(...SLATE)
    doc.text('No hay órdenes que coincidan con el criterio del reporte.', MARGIN, y)
  } else {
    for (const g of ocGroups) {
      y = drawOcSection(doc, y, g, weekNote)
    }
  }

  addPageFooter(doc, bundle.week.label)
  const stamp = new Date().toISOString().slice(0, 10)
  doc.save(`reporte-semanal-solaino-${stamp}.pdf`)
}
