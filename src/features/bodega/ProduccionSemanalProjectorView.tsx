import { useEffect, useMemo } from 'react'
import { formatProduccionSemanalTitleRange, PRODUCCION_SEMANAL_WEEKDAYS } from '../../lib/bodegaProduccionSemanalFormat'
import type { ProduccionSemanalDayRow } from '../../lib/bodegaProduccionSemanalRepo'
import { produccionDayScore, produccionLaneTasks, produccionWeekScore, summarizeProduccionWeek, type ProduccionDayScore, type ProduccionProjectLive, type ProduccionTaskLane } from '../../lib/bodegaProduccionSemanalTasks'
import { produccionCausaDurationLabel, produccionCausaElapsedSeconds, type ProduccionCausaEvento } from '../../lib/bodegaProduccionCausasRepo'
import { ProduccionSemanalTaskList } from './ProduccionSemanalTaskList.tsx'

const HEADER_BG = '#BDD7EE'

type Props = {
  weekStart: string
  labels: {
    disenadora_label: string
    programacion_label: string
    maquinado_label: string
  }
  days: ProduccionSemanalDayRow[]
  liveByProject: Map<string, ProduccionProjectLive>
  causaEventos?: ProduccionCausaEvento[]
  lastUpdated: Date | null
  refreshing: boolean
  onMinimize: () => void
  onClose: () => void
}

export function ProduccionSemanalProjectorView(props: Props) {
  const titleRange = formatProduccionSemanalTitleRange(props.weekStart)

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
    void document.documentElement.requestFullscreen?.().catch(() => {})
  }

  const columns: Array<{ key: 'disenadora' | 'programacion' | 'maquinado' | 'armado'; label: string; lane: ProduccionTaskLane }> = [
    { key: 'disenadora', label: props.labels.disenadora_label, lane: 'disenadora' },
    { key: 'programacion', label: props.labels.programacion_label, lane: 'programacion' },
    { key: 'maquinado', label: props.labels.maquinado_label, lane: 'maquinado' },
    { key: 'armado', label: 'Armado', lane: 'armado' },
  ]
  const summary = summarizeProduccionWeek(props.days)
  const week = produccionWeekScore(props.days, props.liveByProject)

  return (
    <div
      className="fixed inset-0 z-[250] flex flex-col overflow-hidden bg-white text-black shadow-2xl"
      role="dialog"
      aria-label="Vista proyector — producción semanal"
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
              PRODUCCIÓN
            </h1>
            <p className="mt-0.5 text-[clamp(11px,1.4vw,16px)] font-semibold uppercase text-[#404040]">
              {titleRange}
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
        <table className="w-full min-w-[900px] border-collapse border border-black bg-white">
          <thead>
            <tr>
              <th
                className="w-[10%] border border-black px-2 py-2.5 text-center text-[clamp(9px,1vw,13px)] font-bold uppercase text-black"
                style={{ backgroundColor: HEADER_BG }}
              >
                Día
              </th>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="border border-black px-2 py-2.5 text-center text-[clamp(9px,1vw,13px)] font-bold text-black"
                  style={{ backgroundColor: HEADER_BG }}
                >
                  {col.label}
                </th>
              ))}
              <th className="border border-black px-2 py-2.5 text-center text-[clamp(9px,1vw,13px)] font-bold text-black" style={{ backgroundColor: HEADER_BG }}>
                Meta diaria
              </th>
              <th className="border border-black px-2 py-2.5 text-center text-[clamp(9px,1vw,13px)] font-bold text-black" style={{ backgroundColor: HEADER_BG }}>
                Avance real diario
              </th>
              <th className="border border-black px-2 py-2.5 text-center text-[clamp(9px,1vw,13px)] font-bold text-black" style={{ backgroundColor: HEADER_BG }}>
                Comentarios
              </th>
            </tr>
          </thead>
          <tbody>
            {props.days.map((day, rowIndex) => (
              <tr key={day.id} style={{ backgroundColor: rowIndex % 2 === 1 ? '#F9FFF6' : '#FFFFFF' }}>
                <td className="border border-black bg-[#f3f4f6] px-2 py-2 text-center align-top text-[clamp(10px,1.1vw,14px)] font-bold text-black">
                  {PRODUCCION_SEMANAL_WEEKDAYS[day.day_index]}
                </td>
                {columns.map((col) => (
                  <td key={col.key} className="border border-black px-2 py-1.5 align-top">
                    <ProduccionSemanalTaskList
                      tasks={produccionLaneTasks(day, col.lane)}
                      lane={col.lane}
                      liveByProject={props.liveByProject}
                      variant="projector"
                    />
                  </td>
                ))}
                {(() => {
                  const score = produccionDayScore(day, props.liveByProject)
                  return (
                    <>
                      <td className="border border-black px-2 py-2 align-top text-[11px] leading-snug">
                        {score.goals.length === 0
                          ? '—'
                          : score.goals.map((goal) => (
                              <p key={`${goal.lane}-${goal.text}`}>
                                <span className="font-bold">{goal.lane}: </span>
                                {goal.text}
                              </p>
                            ))}
                      </td>
                      <td className="border border-black px-2 py-2 align-top text-[11px] leading-snug">
                        <ProjectorReal score={score} />
                      </td>
                    </>
                  )
                })()}
                <td className="border border-black px-2 py-1.5 align-top">
                  <ProduccionSemanalTaskList text={day.comentarios} variant="projector" />
                  {(props.causaEventos ?? [])
                    .filter((event) => event.day_id === day.id)
                    .map((event) => (
                      <p key={event.id} className="mt-1 text-[11px] font-semibold leading-snug text-black">
                        {event.nombre} · {produccionCausaDurationLabel(produccionCausaElapsedSeconds(event, Date.now()))}
                        {event.ended_at == null ? ' (en curso)' : ''}
                      </p>
                    ))}
                  {produccionDayScore(day, props.liveByProject).gaps.map((gap) => (
                    <p key={gap} className="mt-1 text-[11px] font-semibold leading-snug text-black">
                      {gap}
                    </p>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-300 bg-slate-50 px-4 py-2 text-[11px] text-slate-700 sm:text-[12px]">
        <p>
          Actualización automática cada 30 s · Última: <strong>{updatedLabel}</strong>
          {props.refreshing ? <span className="ml-2 text-sky-700">Refrescando…</span> : null}
          {summary.tareas > 0 ? (
            <span className="ml-2">
              {week.meta != null ? `· Meta semanal ${week.meta}% ` : ''}
              {week.real != null ? `· Avance real semanal ${week.real}% ` : ''}
              · {summary.conProyecto} con proyecto · {summary.marcadas} con avance a mano · {summary.sinTocar} sin avance a mano
            </span>
          ) : null}
          <span className="ml-2 text-slate-500">· Esc = minimizar</span>
        </p>
        <p className="text-slate-500">Solaino — Soluciones integrales</p>
      </footer>
    </div>
  )
}

function ProjectorReal(props: { score: ProduccionDayScore }) {
  const { score } = props
  if (score.goals.length === 0) return <>—</>
  return (
    <div>
      {score.real != null ? <p className="font-bold">{score.real}%</p> : null}
      <p className="mt-1 font-bold">Cumplido</p>
      {score.done.length === 0 ? <p>Nada todavía</p> : score.done.map((line) => (
        <p key={`ok-${line.lane}-${line.text}-${line.detail}`}>
          <span className="font-bold">{line.lane}: </span>
          {line.text} · {line.detail}
        </p>
      ))}
      <p className="mt-1 font-bold">Falta</p>
      {score.missing.length === 0 ? <p>Nada pendiente</p> : score.missing.map((line) => (
        <p key={`no-${line.lane}-${line.text}-${line.detail}`}>
          <span className="font-bold">{line.lane}: </span>
          {line.text} · {line.detail}
        </p>
      ))}
    </div>
  )
}
