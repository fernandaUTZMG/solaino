import ExcelJS from 'exceljs'
import { otherWorkshopPlanNote } from './bodegaExternalProvider'
import { weeklyPlanPrioridadDisplay } from './bodegaProjectPrioridad'
import { formatWeekRangeEs } from './bodegaWeekCalendar'
import {
  canvasToPngArrayBuffer,
  renderWeeklyPlanDetailChart,
} from './bodegaWeeklyPlanExportCharts'
import {
  downloadBlob,
  formatPlanDateLongEs,
  loadSolainoLogoArrayBuffer,
  safeExportFilenamePart,
  type WeeklyPlanExportWeek,
} from './bodegaWeeklyPlanExportCommon'
import {
  chartSheetNameForWeek,
  COLORS,
  COLUMN_WIDTHS,
  HEADER_LABELS,
  PLAN_EXPORT_TITLE,
  sheetNameForWeek,
  thinBorder,
} from './bodegaWeeklyPlanExportTheme'
import type { BodegaWeeklyPlanItemEnriched } from './bodegaWeeklyPlanRepo'

const HEADER_ROW = 3
const FIRST_DATA_ROW = 4
const LAST_COL_LETTER = 'N'

function applyTitleBand(sheet: ExcelJS.Worksheet, weekLabel: string): void {
  sheet.mergeCells(`A1:${LAST_COL_LETTER}1`)
  sheet.mergeCells(`A2:${LAST_COL_LETTER}2`)
  sheet.getRow(1).height = 36
  sheet.getRow(2).height = 18

  const t = sheet.getCell('A1')
  t.value = PLAN_EXPORT_TITLE
  t.font = { name: 'Calibri', bold: true, size: 22, color: { argb: COLORS.title } }
  t.alignment = { vertical: 'middle', horizontal: 'center' }
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.white } }

  const sub = sheet.getCell('A2')
  sub.value = `Plan de trabajo bodega  ·  ${weekLabel}`
  sub.font = { name: 'Calibri', size: 11, color: { argb: COLORS.subtitle } }
  sub.alignment = { vertical: 'middle', horizontal: 'center' }

  for (let c = 1; c <= 14; c++) {
    for (let r = 1; r <= 2; r++) {
      const cell = sheet.getCell(r, c)
      cell.border = thinBorder
    }
  }
}

function applyTableHeader(sheet: ExcelJS.Worksheet): void {
  const row = sheet.getRow(HEADER_ROW)
  row.height = 24
  HEADER_LABELS.forEach((label, i) => {
    const cell = row.getCell(i + 1)
    cell.value = label
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerBlue } }
    cell.font = { name: 'Calibri', bold: true, size: 10, color: { argb: COLORS.title } }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = thinBorder
  })
}

function writeDataRow(sheet: ExcelJS.Worksheet, rowNum: number, it: BodegaWeeklyPlanItemEnriched): void {
  const row = sheet.getRow(rowNum)
  row.height = it.externalShop ? 36 : 22
  const otherShop = it.externalShop ? otherWorkshopPlanNote(it.proveedor) : null
  const values: (string | number)[] = [
    weeklyPlanPrioridadDisplay(it.prioridadNivel),
    (it.cliente || '—').toUpperCase(),
    (it.requisitor || '—').toUpperCase(),
    it.po_numero || '—',
    formatPlanDateLongEs(it.po_fecha),
    otherShop
      ? `${it.proyecto_nombre.toUpperCase()}\n${otherShop.place} ${otherShop.close}`
      : it.proyecto_nombre.toUpperCase(),
    (it.proveedor || '—').toUpperCase(),
    it.actual.diseno / 100,
    it.actual.programacion / 100,
    it.actual.maquinado / 100,
    it.actual.armado / 100,
    formatPlanDateLongEs(it.fecha_entrega),
    (it.status_label || '—').toUpperCase(),
    it.factura || '',
  ]
  values.forEach((v, i) => {
    const cell = row.getCell(i + 1)
    cell.value = v
    cell.border = thinBorder
    cell.font = { name: 'Calibri', size: 10, color: { argb: COLORS.title } }
    const col = i + 1
    if (col === 6 || col === 7) {
      cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
    } else if (col >= 8 && col <= 11) {
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
      if (it.externalShop) {
        cell.value = col === 8 && otherShop ? `${otherShop.place} ${otherShop.close}` : ''
        cell.numFmt = '@'
        cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
        cell.font = { name: 'Calibri', bold: true, size: 10, color: { argb: 'FF92400E' } }
      } else {
        cell.numFmt = '0%'
      }
    } else {
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: col === 5 || col === 12 }
    }
    if (col === 14) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.facturaYellow } }
    } else if (it.projectTerminado) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.doneGreen } }
    }
    if (col === 14) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.facturaYellow } }
    }
    if (col === 13 && /entregado|terminado/i.test(String(it.status_label))) {
      cell.font = { name: 'Calibri', bold: true, size: 10, color: { argb: COLORS.statusRed } }
    }
  })
  if (it.externalShop) sheet.mergeCells(rowNum, 8, rowNum, 11)
}

async function buildDataSheet(
  workbook: ExcelJS.Workbook,
  entry: WeeklyPlanExportWeek,
  logoBuf: ArrayBuffer | null,
): Promise<number> {
  const { weekStart, bundle } = entry
  const weekLabel = formatWeekRangeEs(weekStart)
  const sheet = workbook.addWorksheet(sheetNameForWeek(weekStart), {
    views: [{ showGridLines: true }],
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
  })

  COLUMN_WIDTHS.forEach((w, i) => {
    sheet.getColumn(i + 1).width = w
  })

  if (logoBuf) {
    const imgId = workbook.addImage({ buffer: logoBuf, extension: 'png' })
    sheet.addImage(imgId, {
      tl: { col: 0.15, row: 0.1 },
      ext: { width: 168, height: 48 },
    })
  }

  applyTitleBand(sheet, weekLabel)
  applyTableHeader(sheet)

  let rowNum = FIRST_DATA_ROW
  bundle.items.forEach((it) => {
    writeDataRow(sheet, rowNum, it)
    rowNum++
  })

  const lastData = rowNum - 1
  if (lastData >= FIRST_DATA_ROW) {
    sheet.addConditionalFormatting({
      ref: `H${FIRST_DATA_ROW}:K${lastData}`,
      rules: [
        {
          type: 'dataBar',
          priority: 1,
          cfvo: [{ type: 'num', value: 0 }, { type: 'num', value: 1 }],
          showValue: true,
          gradient: false,
          color: { argb: COLORS.dataBarOrange },
        } as ExcelJS.DataBarRuleType,
      ],
    })
  }

  sheet.views = [{ state: 'frozen', ySplit: HEADER_ROW, showGridLines: true }]
  return lastData
}

async function buildChartsSheet(
  workbook: ExcelJS.Workbook,
  entry: WeeklyPlanExportWeek,
  logoBuf: ArrayBuffer | null,
): Promise<void> {
  const sheet = workbook.addWorksheet(chartSheetNameForWeek(entry.weekStart), {
    views: [{ showGridLines: false }],
  })

  sheet.mergeCells('B2:H3')
  const t = sheet.getCell('B2')
  t.value = `Gráfica — ${formatWeekRangeEs(entry.weekStart)}`
  t.font = { name: 'Calibri', bold: true, size: 16 }
  t.alignment = { horizontal: 'left', vertical: 'middle' }

  if (logoBuf) {
    const imgId = workbook.addImage({ buffer: logoBuf, extension: 'png' })
    sheet.addImage(imgId, { tl: { col: 0.2, row: 0.2 }, ext: { width: 140, height: 40 } })
  }

  const chartBuf = await canvasToPngArrayBuffer(renderWeeklyPlanDetailChart(entry.bundle, 1400, 1040))
  const image = workbook.addImage({ buffer: chartBuf, extension: 'png' })
  sheet.addImage(image, { tl: { col: 1, row: 4 }, ext: { width: 980, height: 728 } })
}

export async function downloadWeeklyPlanExcel(weeks: WeeklyPlanExportWeek[]): Promise<void> {
  if (weeks.length === 0) throw new Error('Selecciona al menos una semana.')
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'SOLAINO'
  workbook.created = new Date()
  const logoBuf = await loadSolainoLogoArrayBuffer()

  for (const entry of weeks) {
    await buildDataSheet(workbook, entry, logoBuf)
    await buildChartsSheet(workbook, entry, logoBuf)
  }

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const name =
    weeks.length === 1
      ? `maquinados-plan-${safeExportFilenamePart(weeks[0].weekStart)}.xlsx`
      : `maquinados-plan-${weeks.length}-semanas.xlsx`
  downloadBlob(name, blob)
}
