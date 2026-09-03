import type { InventoryItem } from '../types/inventory'
import { formatFechaHoraLocal } from './formatDateTime'

const UTF8_BOM = '\uFEFF'

/** Separador `;` para que Excel (configuración regional es-MX / es-ES) abra columnas alineadas. */
const DELIM = ';'

function csvCell(v: string | number | undefined | null): string {
  const s = v === undefined || v === null ? '' : String(v)
  if (/[";\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function row(values: (string | number | undefined | null)[]): string {
  return values.map(csvCell).join(DELIM)
}

function fmtNumber(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n)) return ''
  return String(n)
}

function fmtMoney(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n)) return ''
  return (Math.round(n * 100) / 100).toFixed(2)
}

/**
 * CSV con BOM UTF-8 y separador `;` para abrir en Excel con columnas separadas (México / España).
 * Encabezados legibles en español; incluye stock, costo, fechas y ubicación.
 */
export function buildProductosCsv(items: InventoryItem[]): string {
  const header = row([
    'Código',
    'Nombre del material',
    'Medida',
    'Descripción',
    'Cód. producto',
    'Cant. por pieza',
    'Stock actual',
    'Stock mínimo',
    'Unidad',
    'Área',
    'Ubicación',
    'Costo unitario (MXN)',
    'Estado',
    'Última entrada',
    'Última salida',
    'Part number',
    'Fabricante',
    'ID',
  ])
  const lines = [header]
  for (const i of items) {
    lines.push(
      row([
        i.codigo,
        i.nombre,
        i.medida ?? '',
        i.descripcion ?? '',
        i.codigoProducto ?? '',
        fmtNumber(i.cantidadPorPza),
        fmtNumber(i.stockActual),
        fmtNumber(i.stockMinimo),
        i.unidad,
        i.ubicacion.area,
        i.ubicacion.ubicacion,
        fmtMoney(i.costoUnitario),
        i.estado,
        formatFechaHoraLocal(i.ultimaEntradaISO),
        formatFechaHoraLocal(i.ultimaSalidaISO),
        i.partNumber ?? '',
        i.fabricante ?? '',
        i.id,
      ]),
    )
  }
  return lines.join('\r\n')
}

export function downloadProductosCsv(items: InventoryItem[], baseName = 'inventario'): void {
  const d = new Date()
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const body = UTF8_BOM + buildProductosCsv(items)
  const blob = new Blob([body], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${baseName}-${stamp}.csv`
  a.rel = 'noopener'
  a.click()
  URL.revokeObjectURL(url)
}
