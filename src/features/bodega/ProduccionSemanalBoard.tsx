import type { ProduccionSemanalBundle, ProduccionSemanalDayRow } from '../../lib/bodegaProduccionSemanalRepo'
import { formatProduccionSemanalTitleRange, PRODUCCION_SEMANAL_WEEKDAYS } from '../../lib/bodegaProduccionSemanalFormat'
import { produccionDayScore, produccionLaneTasks, reconcileProduccionTasks, type ProduccionProjectLive, type ProduccionProjectPick, type ProduccionTaskLane } from '../../lib/bodegaProduccionSemanalTasks'
import type { ProduccionCausa, ProduccionCausaEvento } from '../../lib/bodegaProduccionCausasRepo'
import { ProduccionCausasDia } from './ProduccionCausasDia.tsx'
import { ProduccionSemanalTaskEditor } from './ProduccionSemanalTaskEditor.tsx'
import { ProduccionSemanalTaskList } from './ProduccionSemanalTaskList.tsx'

type BoardProps = {
  bundle: ProduccionSemanalBundle
  mode: 'view' | 'edit'
  draftDays: ProduccionSemanalDayRow[]
  draftLabels: {
    disenadora_label: string
    programacion_label: string
    maquinado_label: string
  }
  onDayChange?: (dayIndex: number, patch: Partial<ProduccionSemanalDayRow>) => void
  onLabelChange?: (patch: Partial<BoardProps['draftLabels']>) => void
  projects?: ProduccionProjectPick[]
  liveByProject?: Map<string, ProduccionProjectLive>
  causas?: ProduccionCausa[]
  causaEventos?: ProduccionCausaEvento[]
  onCausasChanged?: () => Promise<void>
  printMode?: boolean
}

const TASK_FIELDS = ['disenadora', 'programacion', 'maquinado', 'armado'] as const

export function ProduccionSemanalBoard(props: BoardProps) {
  const { bundle, mode, draftDays, draftLabels, printMode } = props

  return (
    <div
      className={[
        'overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-md',
        printMode ? 'produccion-semanal-print' : '',
      ].join(' ')}
    >
      <header className="border-b border-slate-300 bg-white px-6 pb-4 pt-5 text-center sm:px-8">
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start sm:justify-between sm:text-left">
          <img
            src="/img/logo2.png"
            alt="Solaino"
            className="h-12 w-auto object-contain sm:h-14"
          />
          <div className="flex-1 sm:text-center">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">PRODUCCIÓN</h2>
            <p className="mt-1 text-sm font-medium uppercase tracking-wide text-slate-600">
              {formatProduccionSemanalTitleRange(bundle.plan.week_start)}
            </p>
          </div>
          <div className="hidden w-[7rem] sm:block" aria-hidden />
        </div>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1280px] border-collapse text-left">
          <thead>
            <tr className="bg-[#bdd7ee]">
              <th className="border border-slate-400 px-3 py-2.5 text-[12px] font-bold uppercase text-slate-900">
                Día
              </th>
              <th className="border border-slate-400 px-3 py-2.5 text-center text-[12px] font-bold text-slate-900">
                {mode === 'edit' ? (
                  <input
                    type="text"
                    value={draftLabels.disenadora_label}
                    onChange={(e) => props.onLabelChange?.({ disenadora_label: e.target.value })}
                    className="w-full rounded border border-slate-300 bg-white/80 px-2 py-1 text-center text-[12px] font-bold"
                    placeholder="Diseño"
                  />
                ) : (
                  draftLabels.disenadora_label
                )}
              </th>
              <th className="border border-slate-400 px-3 py-2.5 text-center text-[12px] font-bold text-slate-900">
                {mode === 'edit' ? (
                  <input
                    type="text"
                    value={draftLabels.programacion_label}
                    onChange={(e) => props.onLabelChange?.({ programacion_label: e.target.value })}
                    className="w-full rounded border border-slate-300 bg-white/80 px-2 py-1 text-center text-[12px] font-bold"
                    placeholder="Programación"
                  />
                ) : (
                  draftLabels.programacion_label
                )}
              </th>
              <th className="border border-slate-400 px-3 py-2.5 text-center text-[12px] font-bold text-slate-900">
                {mode === 'edit' ? (
                  <input
                    type="text"
                    value={draftLabels.maquinado_label}
                    onChange={(e) => props.onLabelChange?.({ maquinado_label: e.target.value })}
                    className="w-full rounded border border-slate-300 bg-white/80 px-2 py-1 text-center text-[12px] font-bold"
                    placeholder="Maquinado"
                  />
                ) : (
                  draftLabels.maquinado_label
                )}
              </th>
              <th className="border border-slate-400 px-3 py-2.5 text-center text-[12px] font-bold text-slate-900">
                Armado
              </th>
              <th className="border border-slate-400 px-2 py-2.5 text-center text-[12px] font-bold text-slate-900">
                Meta diaria
              </th>
              <th className="border border-slate-400 px-2 py-2.5 text-center text-[12px] font-bold text-slate-900">
                Avance real diario
              </th>
              <th className="border border-slate-400 px-3 py-2.5 text-center text-[12px] font-bold text-slate-900">
                Comentarios
              </th>
            </tr>
          </thead>
          <tbody>
            {draftDays.map((day) => (
              <tr key={day.id} className="align-top">
                <td className="border border-slate-400 bg-slate-50 px-3 py-3 text-[13px] font-bold text-slate-900">
                  {PRODUCCION_SEMANAL_WEEKDAYS[day.day_index]}
                </td>
                {TASK_FIELDS.map((field) => {
                  const lane: ProduccionTaskLane = field
                  return (
                  <td key={field} className="border border-slate-400 px-3 py-3">
                    {mode === 'edit' ? (
                      <>
                        <textarea
                          value={day[field]}
                          onChange={(e) => {
                            const value = e.target.value
                            props.onDayChange?.(day.day_index, {
                              [field]: value,
                              [`${lane}_tareas`]: reconcileProduccionTasks(value, produccionLaneTasks(day, lane)),
                            } as Partial<ProduccionSemanalDayRow>)
                          }}
                          rows={5}
                          className="w-full min-h-[5.5rem] resize-y rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[12px] leading-relaxed text-slate-800 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
                          placeholder="Una tarea por línea…"
                        />
                        <ProduccionSemanalTaskEditor
                          tasks={produccionLaneTasks(day, lane)}
                          lane={lane}
                          projects={props.projects ?? []}
                          liveByProject={props.liveByProject ?? new Map()}
                          onChange={(tasks) =>
                            props.onDayChange?.(day.day_index, {
                              [`${lane}_tareas`]: tasks,
                            } as Partial<ProduccionSemanalDayRow>)
                          }
                        />
                      </>
                    ) : (
                      <ProduccionSemanalTaskList
                        tasks={produccionLaneTasks(day, lane)}
                        lane={lane}
                        liveByProject={props.liveByProject}
                        variant="board"
                      />
                    )}
                  </td>
                  )
                })}
                <DayScoreCells day={day} liveByProject={props.liveByProject} />
                <td className="border border-slate-400 px-3 py-3">
                  {mode === 'edit' ? (
                    <textarea
                      value={day.comentarios}
                      onChange={(e) => props.onDayChange?.(day.day_index, { comentarios: e.target.value })}
                      rows={4}
                      className="w-full min-h-[5.5rem] resize-y rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[12px] leading-relaxed text-slate-800 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
                      placeholder="Notas del día…"
                    />
                  ) : (
                    <ProduccionSemanalTaskList text={day.comentarios} variant="board" />
                  )}
                  <DayGapNotes day={day} liveByProject={props.liveByProject} />
                  <ProduccionCausasDia
                    dayId={day.id}
                    causas={props.causas ?? []}
                    eventos={(props.causaEventos ?? []).filter((event) => event.day_id === day.id)}
                    editable={mode === 'edit'}
                    onChanged={props.onCausasChanged ?? (async () => {})}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function DayScoreCells(props: {
  day: ProduccionSemanalDayRow
  liveByProject?: Map<string, ProduccionProjectLive>
}) {
  const score = produccionDayScore(props.day, props.liveByProject)
  return (
    <>
      <td className="border border-slate-400 bg-slate-50 px-2 py-3 align-top">
        <DayGoalList goals={score.goals} />
      </td>
      <td className="border border-slate-400 px-2 py-3 align-top">
        <DayRealList score={score} />
      </td>
    </>
  )
}

function DayRealList(props: {
  score: { real: number | null; goals: unknown[]; done: Array<{ lane: string; text: string; detail: string }>; missing: Array<{ lane: string; text: string; detail: string }> }
}) {
  const { score } = props
  if (score.goals.length === 0) {
    return <p className="text-center text-[12px] text-slate-400">—</p>
  }
  return (
    <div className="space-y-2">
      {score.real != null ? (
        <p className={['font-mono text-[13px] font-bold tabular-nums', score.real >= 100 ? 'text-emerald-800' : 'text-amber-800'].join(' ')}>
          {score.real}%
        </p>
      ) : null}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-800">Cumplido</p>
        {score.done.length === 0 ? (
          <p className="text-[11px] text-slate-500">Nada todavía</p>
        ) : (
          <ul className="mt-0.5 space-y-1">
            {score.done.map((line) => (
              <li key={`ok-${line.lane}-${line.text}-${line.detail}`} className="text-[11px] leading-snug text-slate-800">
                <span className="font-bold text-slate-900">{line.lane}: </span>
                {line.text}
                <span className="text-emerald-800"> · {line.detail}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wide text-amber-800">Falta</p>
        {score.missing.length === 0 ? (
          <p className="text-[11px] text-emerald-800">Nada pendiente</p>
        ) : (
          <ul className="mt-0.5 space-y-1">
            {score.missing.map((line) => (
              <li key={`no-${line.lane}-${line.text}-${line.detail}`} className="text-[11px] leading-snug text-slate-800">
                <span className="font-bold text-slate-900">{line.lane}: </span>
                {line.text}
                <span className="text-amber-900"> · {line.detail}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function DayGoalList(props: { goals: Array<{ lane: string; text: string }> }) {
  if (props.goals.length === 0) {
    return <p className="text-center text-[12px] text-slate-400">—</p>
  }
  return (
    <ul className="space-y-1.5">
      {props.goals.map((goal) => (
        <li key={`${goal.lane}-${goal.text}`} className="text-[11px] leading-snug text-slate-800">
          <span className="font-bold text-slate-900">{goal.lane}: </span>
          {goal.text}
        </li>
      ))}
    </ul>
  )
}

function DayGapNotes(props: {
  day: ProduccionSemanalDayRow
  liveByProject?: Map<string, ProduccionProjectLive>
}) {
  const gaps = produccionDayScore(props.day, props.liveByProject).gaps
  if (gaps.length === 0) return null
  return (
    <ul className="mt-2 space-y-1">
      {gaps.map((gap) => (
        <li key={gap} className="text-[11px] font-semibold leading-snug text-amber-900">
          {gap}
        </li>
      ))}
    </ul>
  )
}
