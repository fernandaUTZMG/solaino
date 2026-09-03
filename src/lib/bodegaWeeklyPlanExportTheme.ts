/** Estilo alineado al Excel «MAQUINADOS» de referencia. */
export const PLAN_EXPORT_TITLE = 'MAQUINADOS'
export const PLAN_EXPORT_BRAND = 'SOLAINO · Soluciones Integrales'

export const COL_COUNT = 13

export const COLORS = {
  headerBlue: 'FFBDD7EE',
  headerBluePdf: [189, 215, 238] as [number, number, number],
  border: 'FF000000',
  title: 'FF000000',
  subtitle: 'FF404040',
  facturaYellow: 'FFFFFF00',
  facturaYellowPdf: [255, 255, 0] as [number, number, number],
  statusRed: 'FFCC0000',
  statusRedPdf: [204, 0, 0] as [number, number, number],
  doneGreen: 'FFE2EFDA',
  doneGreenPdf: [226, 239, 218] as [number, number, number],
  dataBarOrange: 'FFFFC000',
  white: 'FFFFFFFF',
  chartBorder: 'FFD9D9D9',
  navy: [4, 26, 56] as [number, number, number],
} as const

export const HEADER_LABELS = [
  'PRIORIDAD',
  'CLIENTE',
  'REQUISITOR',
  'P.O.',
  'FECHA DE P.O.',
  'PROYECTO',
  'DISEÑO',
  'PROGRAMACION',
  'MAQUINADO',
  'ARMADO',
  'FECHA DE ENTREGA',
  'STATUS',
  'FACTURA',
] as const

/** Anchos de columna (caracteres Excel). */
export const COLUMN_WIDTHS = [9, 14, 20, 16, 28, 42, 11, 14, 12, 11, 28, 14, 14]

import type { Borders } from 'exceljs'

export const thinBorder: Partial<Borders> = {
  top: { style: 'thin', color: { argb: COLORS.border } },
  left: { style: 'thin', color: { argb: COLORS.border } },
  bottom: { style: 'thin', color: { argb: COLORS.border } },
  right: { style: 'thin', color: { argb: COLORS.border } },
}

export function sheetNameForWeek(weekStart: string): string {
  const safe = weekStart.replace(/[^\d-]/g, '').slice(0, 24)
  return `MAQUINADOS ${safe}`.slice(0, 31)
}

export function chartSheetNameForWeek(weekStart: string): string {
  const safe = weekStart.replace(/[^\d-]/g, '').slice(0, 18)
  return `Graficas ${safe}`.slice(0, 31)
}
