import { weeklyPlanPrioridadDisplay } from './bodegaProjectPrioridad'
import { formatWeekRangeEs } from './bodegaWeekCalendar'
import { weeklyPlanStageLabelEs, WEEKLY_PLAN_STAGES } from './bodegaWeeklyPlanProgress'
import type { BodegaWeeklyPlanBundle } from './bodegaWeeklyPlanRepo'

function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? '' : String(v)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Exporta el plan semanal a CSV (Excel). */
export function downloadWeeklyPlanCsv(bundle: BodegaWeeklyPlanBundle, weekStart: string): void {
  const headers = [
    '#',
    'Prioridad',
    'Cliente',
    'Requisitor',
    'P.O.',
    'Proyecto',
    'Folio',
    'Estado proyecto',
    'Meta diseño %',
    'Real diseño %',
    'Meta prog. %',
    'Real prog. %',
    'Meta maq. %',
    'Real maq. %',
    'Meta armado %',
    'Real armado %',
    'Meta total %',
    'Real total %',
    'Entrega',
    'Status plan',
    'Motivo atraso',
    'Finalizado',
  ]

  const lines: string[] = []
  lines.push(`Plan de trabajo bodega,${csvCell(formatWeekRangeEs(weekStart))}`)
  lines.push(`Generado,${csvCell(new Date().toISOString())}`)
  lines.push('')
  lines.push(headers.map(csvCell).join(','))

  bundle.items.forEach((it, i) => {
    lines.push(
      [
        i + 1,
        weeklyPlanPrioridadDisplay(it.prioridadNivel),
        it.cliente,
        it.requisitor,
        it.po_numero,
        it.proyecto_nombre,
        it.projectFolio ?? '',
        it.projectStatus ?? '',
        it.plan_diseno_pct,
        it.actual.diseno,
        it.plan_programacion_pct,
        it.actual.programacion,
        it.plan_maquinado_pct,
        it.actual.maquinado,
        it.plan_armado_pct,
        it.actual.armado,
        it.plannedOverallPct,
        it.actualOverallPct,
        it.fecha_entrega ?? '',
        it.status_label,
        it.delay_reason,
        it.projectTerminado ? 'Sí' : 'No',
      ]
        .map(csvCell)
        .join(','),
    )
  })

  lines.push('')
  lines.push(
    [
      'RESUMEN',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      bundle.weekSummary.plannedOverallPct,
      bundle.weekSummary.actualOverallPct,
      '',
      '',
      '',
      '',
    ].join(','),
  )
  lines.push(
    `Activos en plan,${bundle.weekSummary.itemsActive},Con atraso,${bundle.weekSummary.itemsBehind},Finalizados,${bundle.weekSummary.itemsCompleted}`,
  )

  const bom = '\uFEFF'
  const blob = new Blob([bom + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const safeWeek = weekStart.replace(/[^\d-]/g, '')
  downloadBlob(`plan-trabajo-bodega-${safeWeek}.csv`, blob)
}

/** Texto de ayuda para pegar en correos o imprimir. */
export function weeklyPlanSummaryText(bundle: BodegaWeeklyPlanBundle, weekStart: string): string {
  const stageLines = WEEKLY_PLAN_STAGES.map((s) => weeklyPlanStageLabelEs(s)).join(', ')
  return [
    `Plan de trabajo — ${formatWeekRangeEs(weekStart)}`,
    `Proyectos en plan: ${bundle.items.length} (${bundle.weekSummary.itemsActive} activos, ${bundle.weekSummary.itemsCompleted} finalizados)`,
    `Meta semanal (activos): ${bundle.weekSummary.plannedOverallPct}%`,
    `Avance real (activos): ${bundle.weekSummary.actualOverallPct}%`,
    `Con atraso: ${bundle.weekSummary.itemsBehind}`,
    `Sin motivo de atraso: ${bundle.weekSummary.itemsWithoutDelayReason}`,
    `Etapas: ${stageLines}`,
  ].join('\n')
}
