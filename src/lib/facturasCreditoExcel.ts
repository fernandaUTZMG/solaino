import ExcelJS from 'exceljs'
import { downloadBlob } from './bodegaWeeklyPlanExportCommon'
import { facturaAlertaLabel, todayIsoMexico, type FacturaAlerta } from './facturasCreditoDue'
import type { FacturaCreditoPdfRow } from './facturasCreditoPdf'

const HEADERS = [
  'Proveedor',
  'Descripción',
  'Factura',
  'Monto',
  'Fecha factura',
  'Días',
  'Límite',
  'Fecha de pago',
  'Estado',
  'Archivo',
] as const

const ALERT_FILL: Record<FacturaAlerta, string> = {
  vencida: 'FFFFE4E6',
  por_vencer: 'FFFEF3C7',
  en_plazo: 'FFF8FAFC',
  sin_fecha: 'FFF8FAFC',
  pagada: 'FFD1FAE5',
}

function formatIso(iso: string | null): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d}/${m}/${y}`
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

function sumMonto(rows: FacturaCreditoPdfRow[], alertas: FacturaAlerta[]): number {
  return rows.reduce((sum, row) => {
    if (!alertas.includes(row.alerta)) return sum
    return sum + (row.monto ?? 0)
  }, 0)
}

export async function downloadFacturasCreditoExcel(rows: FacturaCreditoPdfRow[]): Promise<void> {
  const sorted = sortRows(rows)
  const generated = todayIsoMexico()
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'SOLAINO'
  workbook.created = new Date()
  const sheet = workbook.addWorksheet('Facturas crédito', {
    views: [{ state: 'frozen', ySplit: 5 }],
  })

  sheet.mergeCells('A1:J1')
  sheet.mergeCells('A2:J2')
  const title = sheet.getCell('A1')
  title.value = 'FACTURAS CRÉDITO'
  title.font = { name: 'Calibri', bold: true, size: 18, color: { argb: 'FF0F172A' } }
  title.alignment = { vertical: 'middle', horizontal: 'left' }
  sheet.getRow(1).height = 28

  const sub = sheet.getCell('A2')
  sub.value = `${sorted.length} facturas  ·  ${formatIso(generated)}`
  sub.font = { name: 'Calibri', size: 11, color: { argb: 'FF475569' } }
  sheet.getRow(2).height = 18

  const boxes: Array<{ label: string; count: number; amount: number; fill: string }> = [
    { label: 'Vencidas', count: sorted.filter((r) => r.alerta === 'vencida').length, amount: sumMonto(sorted, ['vencida']), fill: 'FFFFE4E6' },
    { label: 'Por vencer', count: sorted.filter((r) => r.alerta === 'por_vencer').length, amount: sumMonto(sorted, ['por_vencer']), fill: 'FFFEF3C7' },
    {
      label: 'En plazo',
      count: sorted.filter((r) => r.alerta === 'en_plazo' || r.alerta === 'sin_fecha').length,
      amount: sumMonto(sorted, ['en_plazo', 'sin_fecha']),
      fill: 'FFF1F5F9',
    },
    { label: 'Pagadas', count: sorted.filter((r) => r.alerta === 'pagada').length, amount: sumMonto(sorted, ['pagada']), fill: 'FFD1FAE5' },
  ]
  boxes.forEach((box, i) => {
    const col = i * 2 + 1
    const label = sheet.getCell(3, col)
    label.value = `${box.label} (${box.count})`
    label.font = { name: 'Calibri', bold: true, size: 11, color: { argb: 'FF0F172A' } }
    label.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: box.fill } }
    label.alignment = { vertical: 'middle', horizontal: 'left' }
    const amount = sheet.getCell(4, col)
    amount.value = box.amount
    amount.numFmt = '"$"#,##0.00'
    amount.font = { name: 'Calibri', size: 12, color: { argb: 'FF0F172A' } }
    amount.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: box.fill } }
    sheet.mergeCells(3, col, 3, col + 1)
    sheet.mergeCells(4, col, 4, col + 1)
  })
  sheet.getRow(3).height = 18
  sheet.getRow(4).height = 20

  const header = sheet.getRow(5)
  header.height = 22
  HEADERS.forEach((label, i) => {
    const cell = header.getCell(i + 1)
    cell.value = label
    cell.font = { name: 'Calibri', bold: true, size: 11, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  })

  sorted.forEach((row, index) => {
    const excelRow = sheet.getRow(6 + index)
    excelRow.height = 18
    const values: Array<string | number | null> = [
      row.proveedor || '—',
      row.descripcion || '—',
      row.factura || '—',
      row.monto,
      formatIso(row.fechaFactura),
      row.dias,
      formatIso(row.limite),
      formatIso(row.fechaPago),
      facturaAlertaLabel(row.alerta),
      row.archivo ? 'Sí' : '—',
    ]
    values.forEach((value, i) => {
      const cell = excelRow.getCell(i + 1)
      cell.value = value ?? '—'
      cell.font = { name: 'Calibri', size: 11, color: { argb: 'FF1E293B' } }
      cell.alignment = { vertical: 'middle', wrapText: i === 1 }
      if (i === 3 && typeof value === 'number') cell.numFmt = '"$"#,##0.00'
      if (i === 8) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ALERT_FILL[row.alerta] } }
        cell.font = { name: 'Calibri', bold: true, size: 11, color: { argb: 'FF0F172A' } }
        cell.alignment = { vertical: 'middle', horizontal: 'center' }
      }
    })
  })

  sheet.columns = [
    { width: 36 },
    { width: 42 },
    { width: 22 },
    { width: 16 },
    { width: 16 },
    { width: 10 },
    { width: 16 },
    { width: 16 },
    { width: 14 },
    { width: 12 },
  ]

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  downloadBlob(`SOLAINO-facturas-credito-${generated}.xlsx`, blob)
}
