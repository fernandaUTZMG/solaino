import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatBusinessMinutesShort } from './bodegaProjectPhaseDurations'
import {
  ordenSegmentMinutes,
  ORDEN_TIME_SEGMENTS,
  sumOrdenTimeBreakdowns,
  type ProjectOrdenTimeBreakdown,
} from './bodegaProjectOrdenTimes'
import type { BodegaOcReportGroup, BodegaProjectReportRow, BodegaReportesBundle } from './bodegaReportesRepo'
import { bodegaProjectStatusLabelEs } from './bodegaProjectsRepo'

const NAVY: [number, number, number] = [4, 26, 56]
const SLATE: [number, number, number] = [51, 65, 85]
const MARGIN = 14
const PAGE_H = 297

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

function ensureSpace(doc: jsPDF, y: number, need: number): number {
  if (y + need > PAGE_H - MARGIN) {
    doc.addPage()
    return MARGIN + 4
  }
  return y
}

function addPageFooter(doc: jsPDF): void {
  const n = doc.getNumberOfPages()
  for (let i = 1; i <= n; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(...SLATE)
    doc.text(
      `SOLAINO — Reportes · Página ${i} de ${n}`,
      doc.internal.pageSize.getWidth() / 2,
      PAGE_H - 8,
      { align: 'center' },
    )
  }
}

function timesRow(t: ProjectOrdenTimeBreakdown): string[] {
  return [
    ...ORDEN_TIME_SEGMENTS.map((s) => formatBusinessMinutesShort(ordenSegmentMinutes(t, s.key))),
    formatBusinessMinutesShort(t.totalTrackedMin),
  ]
}

const TIME_HEADERS = [...ORDEN_TIME_SEGMENTS.map((s) => s.label), 'Total']

export type ReportesPdfStats = {
  nOc: number
  nProjects: number
  nTerminados: number
  nEnCurso: number
  nConContratiempo: number
  nConNotas: number
  totalTimes: ProjectOrdenTimeBreakdown
}

export function computeReportesPdfStats(
  ocGroups: BodegaOcReportGroup[],
): ReportesPdfStats {
  let nProjects = 0
  let nTerminados = 0
  let nConContratiempo = 0
  let nConNotas = 0
  const parts: ProjectOrdenTimeBreakdown[] = []
  for (const g of ocGroups) {
    for (const pr of g.projects) {
      nProjects++
      if (pr.project.status === 'terminado') nTerminados++
      if (pr.project.design_contratiempo_notes) nConContratiempo++
      if (pr.activityNotes.length > 0) nConNotas++
      parts.push(pr.times)
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
  }
}

function drawPdfHeader(doc: jsPDF, logoDataUrl: string | null, generatedAt: string): number {
  let y = MARGIN
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, 'PNG', MARGIN, y, 42, 14)
      y += 18
    } catch {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(14)
      doc.setTextColor(...NAVY)
      doc.text('SOLAINO', MARGIN, y + 5)
      y += 10
    }
  } else {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.setTextColor(...NAVY)
    doc.text('SOLAINO', MARGIN, y + 5)
    y += 10
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(...NAVY)
  doc.text('Reportes', MARGIN, y + 6)
  y += 12

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...SLATE)
  doc.text(`Generado: ${formatDateTimeEs(generatedAt)}`, MARGIN, y)
  y += 5
  doc.text('Tiempos por reloj en horario hábil: lunes a viernes, 8:00 a 17:30.', MARGIN, y)
  y += 5
  doc.text(
    'Cada proyecto acumula su propio tiempo; la suma por OC puede reflejar varios folios en paralelo.',
    MARGIN,
    y,
    { maxWidth: doc.internal.pageSize.getWidth() - MARGIN * 2 },
  )
  return y + 8
}

function drawStatsSection(doc: jsPDF, y: number, stats: ReportesPdfStats, filterNote: string): number {
  y = ensureSpace(doc, y, 40)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(...NAVY)
  doc.text('Resumen estadístico', MARGIN, y)
  y += 6

  if (filterNote) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(9)
    doc.setTextColor(...SLATE)
    doc.text(filterNote, MARGIN, y, { maxWidth: doc.internal.pageSize.getWidth() - MARGIN * 2 })
    y += 8
  }

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    theme: 'grid',
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontSize: 9 },
    bodyStyles: { fontSize: 9, textColor: SLATE },
    head: [['Indicador', 'Valor']],
    body: [
      ['Órdenes de compra (OC)', String(stats.nOc)],
      ['Proyectos (folios)', String(stats.nProjects)],
      ['Proyectos terminados', String(stats.nTerminados)],
      ['Proyectos en curso', String(stats.nEnCurso)],
      ['Con nota de contratiempo', String(stats.nConContratiempo)],
      ['Con notas en historial', String(stats.nConNotas)],
    ],
  })
  y = (doc as JsPdfWithTable).lastAutoTable?.finalY ?? y + 30
  y += 6

  y = ensureSpace(doc, y, 35)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...NAVY)
  doc.text('Tiempo total registrado (todas las OC del reporte)', MARGIN, y)
  y += 5

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    theme: 'striped',
    headStyles: { fillColor: [30, 58, 95], fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    head: [TIME_HEADERS],
    body: [timesRow(stats.totalTimes)],
  })
  return ((doc as JsPdfWithTable).lastAutoTable?.finalY ?? y) + 10
}

function drawOcSection(doc: jsPDF, y: number, g: BodegaOcReportGroup): number {
  y = ensureSpace(doc, y, 35)
  doc.setFillColor(240, 245, 255)
  doc.setDrawColor(180, 198, 230)
  doc.roundedRect(MARGIN, y - 2, doc.internal.pageSize.getWidth() - MARGIN * 2, 10, 2, 2, 'FD')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...NAVY)
  doc.text(`OC ${g.numero}`, MARGIN + 3, y + 5)
  y += 12

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    theme: 'plain',
    styles: { fontSize: 8, cellPadding: 1.5 },
    body: [
      ['Empresa', g.empresaNombre],
      ['Requisitor / cliente', g.solicitante],
      ['Fecha OC (escaneo)', formatDateEs(g.ocFecha)],
      ['Proyectos', `${g.nTerminados} terminados de ${g.nProjects}`],
      ['Avance promedio', `${g.avgAvancePct}%`],
    ],
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 42, textColor: NAVY },
      1: { cellWidth: 'auto' },
    },
  })
  y = (doc as JsPdfWithTable).lastAutoTable?.finalY ?? y + 20
  y += 2

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...NAVY)
  doc.text('Tiempos sumados de la OC', MARGIN, y)
  y += 4

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    theme: 'grid',
    headStyles: { fillColor: [59, 89, 152], fontSize: 7 },
    bodyStyles: { fontSize: 7 },
    head: [TIME_HEADERS],
    body: [timesRow(g.timesSum)],
  })
  y = (doc as JsPdfWithTable).lastAutoTable?.finalY ?? y + 12
  y += 4

  for (const pr of g.projects) {
    y = drawProjectSection(doc, y, pr)
  }
  return y + 6
}

function drawProjectSection(doc: jsPDF, y: number, pr: BodegaProjectReportRow): number {
  const p = pr.project
  y = ensureSpace(doc, y, 28)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...NAVY)
  doc.text(`Proyecto ${p.folio}`, MARGIN, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...SLATE)
  const sub = `${p.nombre} · ${bodegaProjectStatusLabelEs(p.status)} · Avance ${p.avance_pct}%`
  doc.text(sub, MARGIN, y + 4, { maxWidth: doc.internal.pageSize.getWidth() - MARGIN * 2 })
  y += 10

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    theme: 'striped',
    headStyles: { fillColor: [100, 116, 139], fontSize: 7 },
    bodyStyles: { fontSize: 7 },
    head: [TIME_HEADERS],
    body: [timesRow(pr.times)],
  })
  y = (doc as JsPdfWithTable).lastAutoTable?.finalY ?? y + 10
  y += 3

  if (p.design_contratiempo_notes) {
    y = ensureSpace(doc, y, 20)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(146, 64, 14)
    doc.text('Contratiempo / motivo de retraso', MARGIN, y)
    y += 4
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      theme: 'plain',
      bodyStyles: { fontSize: 8, textColor: [120, 53, 15] },
      body: [[p.design_contratiempo_notes]],
      columnStyles: { 0: { cellWidth: 'auto' } },
    })
    y = (doc as JsPdfWithTable).lastAutoTable?.finalY ?? y + 12
    y += 3
  }

  const noteRows: string[][] = []
  for (const n of pr.activityNotes.slice(0, 25)) {
    noteRows.push([
      formatDateTimeEs(n.created_at),
      n.authorLabel,
      n.typeLabel,
      n.comment,
    ])
  }
  if (noteRows.length > 0) {
    y = ensureSpace(doc, y, 18)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...NAVY)
    doc.text('Notas e historial (por qué, observaciones)', MARGIN, y)
    y += 4
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      theme: 'striped',
      headStyles: { fillColor: [71, 85, 105], fontSize: 7 },
      bodyStyles: { fontSize: 7, valign: 'top' },
      head: [['Fecha', 'Quién', 'Tipo', 'Comentario']],
      body: noteRows,
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: 36 },
        2: { cellWidth: 24 },
        3: { cellWidth: 'auto' },
      },
    })
    y = (doc as JsPdfWithTable).lastAutoTable?.finalY ?? y + 12
  } else if (!p.design_contratiempo_notes) {
    doc.setFontSize(7)
    doc.setTextColor(148, 163, 184)
    doc.text('Sin notas registradas en historial.', MARGIN, y)
    y += 5
  }

  return y + 4
}

export type DownloadBodegaReportesPdfArgs = {
  bundle: BodegaReportesBundle
  ocGroups: BodegaOcReportGroup[]
  /** Texto opcional si el PDF refleja un filtro de búsqueda. */
  filterNote?: string
}

/** Genera y descarga el PDF de reportes (OC, tiempos, contratiempos y notas). */
export async function downloadBodegaReportesPdf(args: DownloadBodegaReportesPdfArgs): Promise<void> {
  const { bundle, ocGroups, filterNote } = args
  const logo = await loadSolainoLogoDataUrl()
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const stats = computeReportesPdfStats(ocGroups)

  let y = drawPdfHeader(doc, logo, bundle.loadedAt)
  y = drawStatsSection(doc, y, stats, filterNote ?? '')

  y = ensureSpace(doc, y, 20)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(...NAVY)
  doc.text('Detalle por orden de compra', MARGIN, y)
  y += 8

  if (ocGroups.length === 0) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(...SLATE)
    doc.text('No hay órdenes que coincidan con el criterio del reporte.', MARGIN, y)
  } else {
    for (const g of ocGroups) {
      y = drawOcSection(doc, y, g)
    }
  }

  addPageFooter(doc)
  const stamp = new Date().toISOString().slice(0, 10)
  doc.save(`reportes-solaino-${stamp}.pdf`)
}
