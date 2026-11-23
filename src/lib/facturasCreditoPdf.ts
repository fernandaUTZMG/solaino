import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { downloadBlob, loadSolainoLogoDataUrl } from './bodegaWeeklyPlanExportCommon'
import { facturaAlertaLabel, todayIsoMexico, type FacturaAlerta } from './facturasCreditoDue'

const MARGIN = 10
const PAGE_W = 297
const PAGE_H = 210

const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })

export type FacturaCreditoPdfRow = {
  proveedor: string
  descripcion: string
  factura: string
  monto: number | null
  fechaFactura: string | null
  dias: number | null
  limite: string | null
  fechaPago: string | null
  alerta: FacturaAlerta
  archivo: boolean
}

function formatIso(iso: string | null): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d}/${m}/${y}`
}

function formatMoney(value: number | null): string {
  if (value == null || Number.isNaN(value)) return '—'
  return money.format(value).replace(/\u00a0|\u202f/g, ' ')
}

function sumMonto(rows: FacturaCreditoPdfRow[], alerta?: FacturaAlerta): number {
  return rows.reduce((sum, row) => {
    if (alerta && row.alerta !== alerta) return sum
    return sum + (row.monto ?? 0)
  }, 0)
}

function sortRows(rows: FacturaCreditoPdfRow[]): FacturaCreditoPdfRow[] {
  const rank: Record<FacturaAlerta, number> = {
    vencida: 0,
    por_vencer: 1,
    en_plazo: 2,
    sin_fecha: 3,
    pagada: 4,
  }
  return [...rows].sort((a, b) => {
    const byAlert = rank[a.alerta] - rank[b.alerta]
    if (byAlert !== 0) return byAlert
    const byLimit = (a.limite ?? '9999').localeCompare(b.limite ?? '9999')
    if (byLimit !== 0) return byLimit
    return a.proveedor.localeCompare(b.proveedor, 'es')
  })
}

function drawHeader(doc: jsPDF, logoDataUrl: string | null, generated: string, total: number): number {
  const bandH = 28
  doc.setFillColor(255, 255, 255)
  doc.rect(0, 0, PAGE_W, bandH, 'F')
  doc.setDrawColor(200, 200, 200)
  doc.setLineWidth(0.3)
  doc.line(MARGIN, bandH, PAGE_W - MARGIN, bandH)

  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, 'PNG', MARGIN, 5, 42, 16)
    } catch {
      /* sin imagen */
    }
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(15, 23, 42)
  doc.text('FACTURAS CRÉDITO', PAGE_W / 2, 12, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(71, 85, 105)
  doc.text(`${total} facturas  ·  ${formatIso(generated)}`, PAGE_W / 2, 19, { align: 'center' })

  return bandH + 5
}

function drawSummary(doc: jsPDF, y: number, rows: FacturaCreditoPdfRow[]): number {
  const boxes: Array<{ label: string; count: number; amount: number; fill: [number, number, number] }> = [
    { label: 'Vencidas', count: rows.filter((r) => r.alerta === 'vencida').length, amount: sumMonto(rows, 'vencida'), fill: [255, 228, 230] },
    { label: 'Por vencer', count: rows.filter((r) => r.alerta === 'por_vencer').length, amount: sumMonto(rows, 'por_vencer'), fill: [254, 243, 199] },
    {
      label: 'En plazo',
      count: rows.filter((r) => r.alerta === 'en_plazo' || r.alerta === 'sin_fecha').length,
      amount: rows
        .filter((r) => r.alerta === 'en_plazo' || r.alerta === 'sin_fecha')
        .reduce((sum, row) => sum + (row.monto ?? 0), 0),
      fill: [241, 245, 249],
    },
    { label: 'Pagadas', count: rows.filter((r) => r.alerta === 'pagada').length, amount: sumMonto(rows, 'pagada'), fill: [209, 250, 229] },
  ]
  const gap = 3
  const w = (PAGE_W - MARGIN * 2 - gap * (boxes.length - 1)) / boxes.length
  const h = 14
  boxes.forEach((box, i) => {
    const x = MARGIN + i * (w + gap)
    doc.setFillColor(...box.fill)
    doc.setDrawColor(203, 213, 225)
    doc.roundedRect(x, y, w, h, 1.5, 1.5, 'FD')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(15, 23, 42)
    doc.text(`${box.label}  ${box.count}`, x + 2.5, y + 5.5)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text(formatMoney(box.amount), x + 2.5, y + 10.5)
  })
  return y + h + 5
}

function addFooters(doc: jsPDF): void {
  const n = doc.getNumberOfPages()
  for (let i = 1; i <= n; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(127, 127, 127)
    doc.text(`SOLAINO  ·  Facturas crédito  ·  Página ${i} de ${n}`, PAGE_W / 2, PAGE_H - 5, { align: 'center' })
  }
}

export async function downloadFacturasCreditoPdf(rows: FacturaCreditoPdfRow[]): Promise<void> {
  const sorted = sortRows(rows)
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const logo = await loadSolainoLogoDataUrl()
  const generated = todayIsoMexico()
  let y = drawHeader(doc, logo, generated, sorted.length)
  y = drawSummary(doc, y, sorted)

  autoTable(doc, {
    startY: y,
    head: [['Proveedor', 'Descripción', 'Factura', 'Monto', 'Fecha factura', 'Días', 'Límite', 'Fecha de pago', 'Estado', 'Archivo']],
    body: sorted.map((row) => [
      row.proveedor || '—',
      row.descripcion || '—',
      row.factura || '—',
      formatMoney(row.monto),
      formatIso(row.fechaFactura),
      row.dias == null ? '—' : String(row.dias),
      formatIso(row.limite),
      formatIso(row.fechaPago),
      facturaAlertaLabel(row.alerta),
      row.archivo ? 'Sí' : '—',
    ]),
    margin: { left: MARGIN, right: MARGIN, bottom: 12 },
    styles: {
      font: 'helvetica',
      fontSize: 7,
      cellPadding: 1.4,
      valign: 'middle',
      lineColor: [226, 232, 240],
      lineWidth: 0.15,
      textColor: [30, 41, 59],
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7,
    },
    columnStyles: {
      0: { cellWidth: 46 },
      1: { cellWidth: 52 },
      2: { cellWidth: 36 },
      3: { cellWidth: 26, halign: 'right' },
      4: { cellWidth: 22, halign: 'center' },
      5: { cellWidth: 12, halign: 'center' },
      6: { cellWidth: 22, halign: 'center' },
      7: { cellWidth: 22, halign: 'center' },
      8: { cellWidth: 22, halign: 'center', fontStyle: 'bold' },
      9: { cellWidth: 17, halign: 'center' },
    },
    theme: 'grid',
    didParseCell: (data) => {
      if (data.section !== 'body' || data.column.index !== 8) return
      const alerta = sorted[data.row.index]?.alerta
      if (alerta === 'vencida') data.cell.styles.fillColor = [255, 228, 230]
      else if (alerta === 'por_vencer') data.cell.styles.fillColor = [254, 243, 199]
      else if (alerta === 'pagada') data.cell.styles.fillColor = [209, 250, 229]
    },
  })

  addFooters(doc)
  downloadBlob(`SOLAINO-facturas-credito-${generated}.pdf`, doc.output('blob'))
}
