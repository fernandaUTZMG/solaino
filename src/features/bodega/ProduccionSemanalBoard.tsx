import type { ProduccionSemanalBundle, ProduccionSemanalDayRow } from '../../lib/bodegaProduccionSemanalRepo'
import { formatProduccionSemanalTitleRange, PRODUCCION_SEMANAL_WEEKDAYS } from '../../lib/bodegaProduccionSemanalFormat'
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
  printMode?: boolean
}

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
        <table className="w-full min-w-[720px] border-collapse text-left">
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
                {(['disenadora', 'programacion', 'maquinado', 'comentarios'] as const).map((field) => (
                  <td key={field} className="border border-slate-400 px-3 py-3">
                    {mode === 'edit' ? (
                      <textarea
                        value={day[field]}
                        onChange={(e) =>
                          props.onDayChange?.(day.day_index, { [field]: e.target.value } as Partial<ProduccionSemanalDayRow>)
                        }
                        rows={field === 'comentarios' ? 4 : 5}
                        className="w-full min-h-[5.5rem] resize-y rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[12px] leading-relaxed text-slate-800 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
                        placeholder={field === 'comentarios' ? 'Notas del día…' : 'Una tarea por línea…'}
                      />
                    ) : (
                      <ProduccionSemanalTaskList text={day[field]} variant="board" />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
