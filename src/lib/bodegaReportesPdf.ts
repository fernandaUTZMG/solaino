import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { sumOrdenTimeBreakdowns, type ProjectOrdenTimeBreakdown } from './bodegaProjectOrdenTimes'
import type { BodegaOcReportGroup, BodegaReportesBundle } from './bodegaReportesRepo'
import { projectCierreNote } from './bodegaReportesRepo'
import {
  formatWeekCell,
  formatWeekMinutes,
  quePasoEstaSemana,
  shopWeekTimes,
  tallerWeekMinutes,
  type ReportAdvance,
  type ReportPieceLine,
} from './bodegaReportWeek'

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
  doc.setTextColor(136, 19, 55)
  const lines = doc.splitTextToSize(note, width - 8)
  const boxH = 8 + lines.length * 4.2
  doc.setFillColor(255, 241, 242)
  doc.setDrawColor(225, 29, 72)
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

function drawOcSection(doc: jsPDF, y: number, g: BodegaOcReportGroup, weekNote: string, startFresh: boolean): number {
  if (startFresh && y > MARGIN + 20) {
    doc.addPage()
    y = MARGIN
  }
  const width = doc.internal.pageSize.getWidth() - MARGIN * 2
  y = ensureSpace(doc, y, 24)
  doc.setFillColor(...NAVY)
  doc.roundedRect(MARGIN, y, width, 16, 1.2, 1.2, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(191, 219, 254)
  doc.text('ORDEN DE COMPRA', MARGIN + 4, y + 5.5)
  doc.setFontSize(13)
  doc.setTextColor(255, 255, 255)
  doc.text(g.numero, MARGIN + 42, y + 6)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(226, 232, 240)
  doc.text(
    `${g.empresaNombre}   ·   ${g.solicitante}   ·   ${formatDateEs(g.ocFecha)}   ·   ${g.nProjects} proyectos`,
    MARGIN + 4,
    y + 12,
    { maxWidth: width - 8 },
  )
  y += 22

  if (g.projects.length === 0) {
    doc.setFontSize(9)
    doc.setTextColor(...SLATE)
    doc.text('Esta orden no tiene proyectos.', MARGIN, y)
    return y + 8
  }

  for (const pr of g.projects) {
    y = drawProjectBlock(doc, y, pr, weekNote)
  }
  return y + 2
}

function pieceWasMachined(line: ReportPieceLine): boolean {
  return line.maquinadoWeekMin >= 1 || line.maquinadoTotalMin >= 1
}

const REST_DESTINO_ORDER = ['Perfilado', 'Torno', 'Accesorios', 'CNC', 'Sin destino'] as const

const REST_DESTINO_NOTA: Record<(typeof REST_DESTINO_ORDER)[number], string> = {
  Perfilado: 'Van a perfiladora.',
  Torno: 'Van a torno.',
  Accesorios: 'Son accesorios.',
  CNC: 'Asignadas a CNC. Aún no tienen tiempo de maquinado.',
  'Sin destino': 'Todavía no tienen destino.',
}

/** Piezas que no salen en la tabla de maquinado, cada destino por separado. */
function restPiecesByDestino(lines: ReportPieceLine[]): Array<{ destino: string; n: number; nota: string }> {
  const rest = lines.filter((line) => !pieceWasMachined(line))
  const counts = new Map<string, number>()
  for (const line of rest) counts.set(line.destino, (counts.get(line.destino) ?? 0) + 1)
  return REST_DESTINO_ORDER.filter((key) => (counts.get(key) ?? 0) > 0).map((key) => ({
    destino: key,
    n: counts.get(key) ?? 0,
    nota: REST_DESTINO_NOTA[key],
  }))
}

function drawTimeCard(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  title: string,
  weekValue: string,
  totalValue: string,
): void {
  const h = 24
  doc.setDrawColor(226, 232, 240)
  doc.setFillColor(255, 255, 255)
  doc.rect(x, y, w, h, 'FD')
  doc.setFillColor(...NAVY)
  doc.rect(x, y, w, 6.5, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(255, 255, 255)
  doc.text(title, x + 3, y + 4.4)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...SLATE)
  doc.text('Esta semana', x + 3, y + 13)
  doc.text('Acumulado', x + 3, y + 19.5)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...NAVY)
  doc.text(weekValue, x + w - 3, y + 13.2, { align: 'right' })
  doc.text(totalValue, x + w - 3, y + 19.7, { align: 'right' })
}

function drawProjectBlock(
  doc: jsPDF,
  y: number,
  pr: BodegaOcReportGroup['projects'][number],
  weekNote: string,
): number {
  const p = pr.project
  const width = doc.internal.pageSize.getWidth() - MARGIN * 2
  const machined = pr.pieces.filter(pieceWasMachined)
  y = ensureSpace(doc, y, 52)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  const nameLines = doc.splitTextToSize(p.nombre, width - 8) as string[]
  const headerH = 12 + nameLines.length * 4
  doc.setFillColor(241, 245, 249)
  doc.setDrawColor(203, 213, 225)
  doc.roundedRect(MARGIN, y, width, headerH, 1.2, 1.2, 'FD')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(...SLATE)
  doc.text('PROYECTO', MARGIN + 4, y + 5.2)
  doc.setFontSize(11)
  doc.setTextColor(...NAVY)
  doc.text(p.folio, MARGIN + 28, y + 5.4)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(51, 65, 85)
  doc.text(nameLines, MARGIN + 4, y + 11)
  y += headerH + 4

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...NAVY)
  doc.text('Tiempos', MARGIN, y)
  y += 3
  const gap = 4
  const cardW = (width - gap * 2) / 3
  drawTimeCard(
    doc,
    MARGIN,
    y,
    cardW,
    'DISEÑO',
    formatWeekCell(pr.weekTimes.disenoMin, pr.advance.disenoCumplido),
    formatWeekMinutes(pr.times.disenoMin),
  )
  drawTimeCard(
    doc,
    MARGIN + cardW + gap,
    y,
    cardW,
    'PROGRAMACIÓN',
    formatWeekCell(pr.weekTimes.programacionMin, pr.advance.programacionCumplido),
    formatWeekMinutes(pr.times.programacionMin),
  )
  drawTimeCard(
    doc,
    MARGIN + (cardW + gap) * 2,
    y,
    cardW,
    'ARMADO',
    formatWeekMinutes(pr.weekTimes.armadoMin),
    formatWeekMinutes(pr.times.armadoMin),
  )
  y += 28

  y = ensureSpace(doc, y, 16)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...NAVY)
  doc.text('Maquinado CNC, por pieza', MARGIN, y)
  y += 2

  if (machined.length === 0) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(8)
    doc.setTextColor(...SLATE)
    doc.text('Ninguna pieza CNC registró tiempo de maquinado.', MARGIN, y + 4)
    y += 8
  } else {
    const totalWeek = machined.reduce((sum, line) => sum + line.maquinadoWeekMin, 0)
    const totalProg = machined.reduce((sum, line) => sum + line.progTotalMin, 0)
    const body = machined.map((line) => [
      line.label,
      formatWeekMinutes(line.maquinadoWeekMin),
      formatWeekMinutes(line.progTotalMin),
    ])
    body.push(['Total', formatWeekMinutes(totalWeek), formatWeekMinutes(totalProg)])
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      theme: 'plain',
      styles: {
        fontSize: 8,
        cellPadding: { top: 1.8, right: 3, bottom: 1.8, left: 3 },
        lineColor: [226, 232, 240],
        lineWidth: 0.15,
        valign: 'middle',
      },
      headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold', halign: 'center' },
      bodyStyles: { textColor: [30, 41, 59] },
      head: [['Pieza', 'Esta semana', 'Tiempo de programado']],
      body,
      columnStyles: {
        0: { cellWidth: width - 84, fontStyle: 'bold' },
        1: { cellWidth: 36, halign: 'center' },
        2: { cellWidth: 48, halign: 'center' },
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
        if (data.row.index % 2 === 1) data.cell.styles.fillColor = [248, 250, 252]
      },
    })
    y = ((doc as JsPdfWithTable).lastAutoTable?.finalY ?? y) + 4
  }

  const rest = restPiecesByDestino(pr.pieces)
  if (rest.length > 0) {
    y = ensureSpace(doc, y, 16)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...NAVY)
    doc.text('Otras piezas de este proyecto', MARGIN, y)
    y += 2
    const restBody = rest.map((row) => [row.destino, String(row.n), row.nota])
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      theme: 'plain',
      styles: {
        fontSize: 8,
        cellPadding: { top: 1.8, right: 3, bottom: 1.8, left: 3 },
        lineColor: [226, 232, 240],
        lineWidth: 0.15,
        valign: 'middle',
      },
      headStyles: { fillColor: [71, 85, 105], textColor: 255, fontStyle: 'bold' },
      bodyStyles: { textColor: [30, 41, 59] },
      head: [['Destino', 'Piezas', 'Aclaración']],
      body: restBody,
      columnStyles: {
        0: { cellWidth: 36, fontStyle: 'bold' },
        1: { cellWidth: 22, halign: 'center' },
        2: { cellWidth: width - 58 },
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.row.index % 2 === 1) {
          data.cell.styles.fillColor = [248, 250, 252]
        }
      },
    })
    y = ((doc as JsPdfWithTable).lastAutoTable?.finalY ?? y) + 4
  }

  const happened = quePasoEstaSemana({
    status: p.status,
    week: pr.weekTimes,
    contratiempo: p.design_contratiempo_notes,
    weekNote,
    advance: pr.advance,
  })
  const tallerWeek = tallerWeekMinutes(pr.weekTimes)
  const tallerTotal = tallerWeekMinutes(pr.times)
  const lines = [
    `${pr.advance.headline}. ${happened}.`,
    tallerWeek >= 1 || tallerTotal >= 1
      ? `Taller (perfilado, detallado y armado): esta semana ${formatWeekMinutes(tallerWeek)}, acumulado ${formatWeekMinutes(tallerTotal)}.`
      : '',
  ].filter(Boolean)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  const wrapped = lines.flatMap((line) => doc.splitTextToSize(line, width - 8))
  const boxH = 8 + wrapped.length * 4
  y = ensureSpace(doc, y, boxH + 2)
  doc.setFillColor(255, 251, 235)
  doc.setDrawColor(251, 191, 36)
  doc.roundedRect(MARGIN, y, width, boxH, 1.2, 1.2, 'FD')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(120, 53, 15)
  doc.text('DÓNDE VA EL PROYECTO', MARGIN + 3, y + 4.5)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text(wrapped, MARGIN + 3, y + 9)
  y += boxH + 4

  const cierre = projectCierreNote(pr.activityNotes)
  if (cierre) {
    const cierreLines = doc.splitTextToSize(cierre.comment, width - 8) as string[]
    const cierreH = 10 + cierreLines.length * 4
    y = ensureSpace(doc, y, cierreH + 2)
    doc.setFillColor(255, 251, 235)
    doc.setDrawColor(217, 119, 6)
    doc.roundedRect(MARGIN, y, width, cierreH, 1.2, 1.2, 'FD')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(120, 53, 15)
    doc.text('NOTA DE CIERRE', MARGIN + 3, y + 4.5)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(69, 26, 3)
    doc.text(cierreLines, MARGIN + 3, y + 9)
    y += cierreH + 4
  }

  return y + 2
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
  doc.text('Tiempo de esta semana (lun–vie, 8:00 a 17:30). Cada hora cuenta una vez.', MARGIN, y)
  y += 4
  const listed = ocGroups.flatMap((g) => g.projects)
  const shopWeek = shopWeekTimes({
    workIntervals: listed.flatMap((row) => row.weekWork),
    pieceIntervals: listed.flatMap((row) => row.weekPieces),
    now: bundle.week.end,
  })
  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    theme: 'plain',
    styles: { fontSize: 8, cellPadding: 2, halign: 'center' },
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold' },
    bodyStyles: { textColor: NAVY, fontStyle: 'bold', fillColor: [248, 250, 252] },
    head: [['Diseño', 'Programación', 'Maquinado', 'Taller']],
    body: [weekCells(shopWeek)],
  })
  y = ((doc as JsPdfWithTable).lastAutoTable?.finalY ?? y) + 8

  if (ocGroups.length === 0) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(...SLATE)
    doc.text('No hay órdenes que coincidan con el criterio del reporte.', MARGIN, y)
  } else {
    ocGroups.forEach((g, index) => {
      y = drawOcSection(doc, y, g, weekNote, index > 0)
    })
  }

  addPageFooter(doc, bundle.week.label)
  const stamp = new Date().toISOString().slice(0, 10)
  doc.save(`reporte-semanal-solaino-${stamp}.pdf`)
}
