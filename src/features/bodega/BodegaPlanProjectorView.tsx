import { useEffect, useMemo } from 'react'
import { weeklyPlanPrioridadDisplay } from '../../lib/bodegaProjectPrioridad'
import { formatWeekRangeEs } from '../../lib/bodegaWeekCalendar'
import { formatPlanDateLongEs } from '../../lib/bodegaWeeklyPlanExportCommon'
import { HEADER_LABELS, PLAN_EXPORT_BRAND, PLAN_EXPORT_TITLE } from '../../lib/bodegaWeeklyPlanExportTheme'
import {
  weeklyPlanStatusLabelFromProject,
  type BodegaWeeklyPlanItemEnriched,
} from '../../lib/bodegaWeeklyPlanRepo'

/** Columnas visibles en proyector (sin factura). */
const PROJECTOR_HEADERS = HEADER_LABELS.filter((h) => h !== 'FACTURA')
const COL_COUNT = PROJECTOR_HEADERS.length

const HEADER_BG = '#BDD7EE'
const DONE_ROW_BG = '#E2EFDA'
const DATA_BAR = '#FFC000'
const STATUS_RED = '#CC0000'

type Props = {
  weekStart: string
  items: BodegaWeeklyPlanItemEnriched[]
  lastUpdated: Date | null
  refreshing: boolean
  onMinimize: () => void
  onClose: () => void
}

function planItemStatusLabel(it: BodegaWeeklyPlanItemEnriched): string {
  if (it.projectStatus) return weeklyPlanStatusLabelFromProject(it.projectStatus)
  return it.status_label.trim()
}

function DataBarCell({ pct }: { pct: number }) {
  const p = Math.min(100, Math.max(0, Math.round(pct)))
  return (
    <td className="border border-black p-0 align-middle">
      <div className="relative flex min-h-[2rem] items-center justify-center bg-white sm:min-h-[2.35rem]">
        <div
          className="absolute inset-y-0 left-0"
          style={{ width: `${p}%`, backgroundColor: DATA_BAR }}
          aria-hidden
        />
        <span className="relative z-[1] px-1 font-mono text-[clamp(10px,1.1vw,14px)] font-semibold tabular-nums text-black">
          {p}%
        </span>
      </div>
    </td>
  )
}

function ProjectorRow(props: { it: BodegaWeeklyPlanItemEnriched; index: number }) {
  const { it, index } = props
  const done = it.projectTerminado
  const rowBg = done ? DONE_ROW_BG : index % 2 === 1 ? '#F9FFF6' : '#FFFFFF'
  const status = planItemStatusLabel(it).toUpperCase() || '—'
  const statusEntregado = /entregado|terminado/i.test(status)

  const cellCls =
    'border border-black px-1 py-1 text-center align-middle text-[clamp(9px,0.95vw,13px)] font-normal text-black'

  return (
    <tr style={{ backgroundColor: rowBg }}>
      <td className={`${cellCls} font-semibold tabular-nums`}>{weeklyPlanPrioridadDisplay(it.prioridadNivel)}</td>
      <td className={cellCls}>{(it.cliente || '—').toUpperCase()}</td>
      <td className={cellCls}>{(it.requisitor || '—').toUpperCase()}</td>
      <td className={`${cellCls} font-mono text-[clamp(8px,0.85vw,12px)]`}>{it.po_numero || '—'}</td>
      <td className={`${cellCls} text-[clamp(8px,0.8vw,11px)] leading-tight`}>
        {formatPlanDateLongEs(it.po_fecha)}
      </td>
      <td className="border border-black px-2 py-1 text-left align-middle text-[clamp(9px,0.9vw,12px)] font-semibold uppercase leading-snug text-black">
        {it.proyecto_nombre}
      </td>
      <DataBarCell pct={it.actual.diseno} />
      <DataBarCell pct={it.actual.programacion} />
      <DataBarCell pct={it.actual.maquinado} />
      <DataBarCell pct={it.actual.armado} />
      <td className={`${cellCls} text-[clamp(8px,0.8vw,11px)] leading-tight`}>
        {formatPlanDateLongEs(it.fecha_entrega)}
      </td>
      <td
        className={`${cellCls} font-bold uppercase`}
        style={statusEntregado ? { color: STATUS_RED } : undefined}
      >
        {status}
      </td>
    </tr>
  )
}

/** Barra flotante cuando el proyector está activo pero minimizado. */
export function BodegaPlanProjectorMiniBar(props: {
  refreshing: boolean
  lastUpdated: Date | null
  onExpand: () => void
  onClose: () => void
}) {
  const time =
    props.lastUpdated != null
      ? props.lastUpdated.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
      : '—'

  return (
    <div
      className="fixed bottom-4 right-4 z-[240] flex max-w-[min(100vw-2rem,22rem)] items-center gap-2 rounded-2xl border-2 border-violet-500 bg-violet-600 px-3 py-2.5 text-white shadow-lg ring-2 ring-violet-300/60"
      role="status"
      aria-live="polite"
    >
      <span
        className={`h-2.5 w-2.5 shrink-0 rounded-full ${props.refreshing ? 'animate-pulse bg-amber-300' : 'bg-emerald-300'}`}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-bold leading-tight">● Proyector activo</p>
        <p className="text-[10px] text-violet-100">En vivo · {time}</p>
      </div>
      <button
        type="button"
        className="shrink-0 rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-bold text-violet-900 hover:bg-violet-50"
        onClick={props.onExpand}
      >
        Mostrar
      </button>
      <button
        type="button"
        className="shrink-0 rounded-lg border border-violet-300/80 px-2 py-1.5 text-[11px] font-semibold text-white hover:bg-violet-700"
        onClick={props.onClose}
        title="Desactivar proyector"
      >
        ✕
      </button>
    </div>
  )
}

export function BodegaPlanProjectorView(props: Props) {
  const weekLabel = formatWeekRangeEs(props.weekStart)
  const rows = props.items

  const updatedLabel = useMemo(() => {
    if (!props.lastUpdated) return '—'
    try {
      return props.lastUpdated.toLocaleTimeString('es-MX', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    } catch {
      return '—'
    }
  }, [props.lastUpdated])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onMinimize()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [props.onMinimize])

  function enterFullscreen() {
    const el = document.documentElement
    void el.requestFullscreen?.().catch(() => {})
  }

  return (
    <div
      className="fixed inset-0 z-[250] flex flex-col overflow-hidden bg-white text-black shadow-2xl"
      role="dialog"
      aria-label="Vista proyector — plan de trabajo MAQUINADOS"
    >
      <header className="relative shrink-0 border-b-2 border-black px-3 pb-2 pt-3 sm:px-5">
        <div className="flex items-start gap-3">
          <img
            src="/img/logo2.png"
            alt="Solaino"
            className="h-10 w-auto shrink-0 object-contain sm:h-12"
            onError={(e) => {
              ;(e.target as HTMLImageElement).style.display = 'none'
            }}
          />
          <div className="min-w-0 flex-1 text-center">
            <h1 className="text-[clamp(22px,3.2vw,36px)] font-bold uppercase tracking-wide text-black">
              {PLAN_EXPORT_TITLE}
            </h1>
            <p className="mt-0.5 text-[clamp(11px,1.4vw,16px)] text-[#404040]">
              Plan de trabajo bodega · {weekLabel} · Prioridad: 1 = más urgente
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-600 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-900 sm:text-[11px]">
              <span
                className={`h-2 w-2 rounded-full ${props.refreshing ? 'animate-pulse bg-amber-500' : 'bg-emerald-600'}`}
                aria-hidden
              />
              En vivo
            </span>
            <div className="flex flex-wrap justify-end gap-1">
              <button
                type="button"
                className="rounded-lg border border-slate-400 bg-white px-2 py-1 text-[11px] font-semibold text-slate-800 hover:bg-slate-100"
                onClick={enterFullscreen}
              >
                Pantalla completa
              </button>
              <button
                type="button"
                className="rounded-lg border border-violet-400 bg-violet-50 px-2 py-1 text-[11px] font-semibold text-violet-900 hover:bg-violet-100"
                onClick={props.onMinimize}
              >
                Minimizar
              </button>
              <button
                type="button"
                className="rounded-lg border border-slate-400 bg-white px-2 py-1 text-[11px] font-semibold text-slate-800 hover:bg-slate-100"
                onClick={props.onClose}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-2 sm:p-3">
        <table
          className="w-full min-w-[1000px] border-collapse border border-black bg-white"
          style={{ tableLayout: 'fixed' }}
        >
          <colgroup>
            <col style={{ width: '4.5%' }} />
            <col style={{ width: '7%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '26%' }} />
            <col style={{ width: '6%' }} />
            <col style={{ width: '7%' }} />
            <col style={{ width: '6%' }} />
            <col style={{ width: '6%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '8%' }} />
          </colgroup>
          <thead>
            <tr>
              {PROJECTOR_HEADERS.map((label) => (
                <th
                  key={label}
                  className="border border-black px-1 py-2 text-center text-[clamp(8px,0.85vw,11px)] font-bold uppercase leading-tight text-black"
                  style={{ backgroundColor: HEADER_BG }}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={COL_COUNT} className="border border-black px-4 py-12 text-center text-lg text-slate-600">
                  Sin proyectos en el plan de esta semana.
                </td>
              </tr>
            ) : (
              rows.map((it, i) => <ProjectorRow key={it.id} it={it} index={i} />)
            )}
          </tbody>
        </table>
      </div>

      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-300 bg-slate-50 px-4 py-2 text-[11px] text-slate-700 sm:text-[12px]">
        <p>
          Actualización automática cada 30 s · Última: <strong>{updatedLabel}</strong>
          {props.refreshing ? <span className="ml-2 text-sky-700">Refrescando…</span> : null}
          <span className="ml-2 text-slate-500">· Esc = minimizar</span>
        </p>
        <p className="text-slate-500">{PLAN_EXPORT_BRAND}</p>
      </footer>
    </div>
  )
}
