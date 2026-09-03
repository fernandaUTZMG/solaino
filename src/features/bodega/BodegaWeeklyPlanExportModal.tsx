import { useMemo, useState } from 'react'
import { formatWeekRangeEs, listSelectableWeekKeys } from '../../lib/bodegaWeekCalendar'
import { downloadWeeklyPlanPdf } from '../../lib/bodegaWeeklyPlanPdf'
import { fetchWeeklyPlanBundle } from '../../lib/bodegaWeeklyPlanRepo'
import { canExportBodegaWeeklyPlan, type AppRole } from '../../lib/roles'

type Props = {
  role: AppRole
  anchorWeekStart: string
  onClose: () => void
  onError: (msg: string) => void
}

export function BodegaWeeklyPlanExportModal(props: Props) {
  const weekOptions = useMemo(() => listSelectableWeekKeys(props.anchorWeekStart), [props.anchorWeekStart])
  const [selected, setSelected] = useState<Set<string>>(() => new Set([props.anchorWeekStart]))
  const [busy, setBusy] = useState(false)
  const [busyLabel, setBusyLabel] = useState('')

  function toggleWeek(key: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function selectAll() {
    setSelected(new Set(weekOptions))
  }

  function selectNone() {
    setSelected(new Set())
  }

  async function runExport(kind: 'excel' | 'pdf') {
    if (!canExportBodegaWeeklyPlan(props.role)) {
      props.onError('Solo el administrador o el supervisor de bodega pueden exportar el plan.')
      return
    }
    const keys = [...selected].sort()
    if (keys.length === 0) {
      props.onError('Selecciona al menos una semana.')
      return
    }
    setBusy(true)
    props.onError('')
    try {
      const weeks = []
      for (let i = 0; i < keys.length; i++) {
        const weekStart = keys[i]
        setBusyLabel(`Cargando ${formatWeekRangeEs(weekStart)} (${i + 1}/${keys.length})…`)
        const bundle = await fetchWeeklyPlanBundle(weekStart)
        weeks.push({ weekStart, bundle })
      }
      setBusyLabel(kind === 'excel' ? 'Generando Excel…' : 'Generando PDF…')
      if (kind === 'excel') {
        const { downloadWeeklyPlanExcel } = await import('../../lib/bodegaWeeklyPlanExcel')
        await downloadWeeklyPlanExcel(weeks)
      } else {
        await downloadWeeklyPlanPdf(weeks)
      }
      props.onClose()
    } catch (e) {
      props.onError(e instanceof Error ? e.message : 'No se pudo exportar.')
    } finally {
      setBusy(false)
      setBusyLabel('')
    }
  }

  return (
    <div className="fixed inset-0 z-[130] flex items-end justify-center bg-slate-950/50 p-4 sm:items-center">
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        role="dialog"
        aria-labelledby="plan-export-title"
      >
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 id="plan-export-title" className="text-[17px] font-bold text-slate-900">
            Exportar plan de trabajo
          </h2>
          <p className="mt-1 text-[12px] text-slate-600">
            Elige una o varias semanas. Formato tipo <strong>MAQUINADOS</strong>: logo, tabla con barras naranjas,
            columna factura amarilla y hoja aparte de gráficas (Excel) o página de gráficas (PDF).
          </p>
        </div>

        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-2">
          <button
            type="button"
            className="text-[11px] font-semibold text-sky-800 underline"
            disabled={busy}
            onClick={selectAll}
          >
            Todas
          </button>
          <button
            type="button"
            className="text-[11px] font-semibold text-slate-600 underline"
            disabled={busy}
            onClick={selectNone}
          >
            Ninguna
          </button>
          <span className="ml-auto text-[11px] text-slate-500">{selected.size} seleccionada(s)</span>
        </div>

        <ul className="flex-1 overflow-y-auto px-3 py-3">
          {weekOptions.map((key) => {
            const isAnchor = key === props.anchorWeekStart
            const checked = selected.has(key)
            return (
              <li key={key}>
                <label
                  className={[
                    'flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5',
                    checked ? 'bg-sky-50 ring-1 ring-sky-200' : 'hover:bg-slate-50',
                  ].join(' ')}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-sky-700"
                    checked={checked}
                    disabled={busy}
                    onChange={() => toggleWeek(key)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold text-slate-900">
                      {formatWeekRangeEs(key)}
                      {isAnchor ? (
                        <span className="ml-2 rounded-md bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-sky-800">
                          Actual
                        </span>
                      ) : null}
                    </span>
                    <span className="font-mono text-[10px] text-slate-500">{key}</span>
                  </span>
                </label>
              </li>
            )
          })}
        </ul>

        {busy && busyLabel ? (
          <p className="border-t border-slate-100 px-5 py-2 text-center text-[12px] font-medium text-sky-800">
            {busyLabel}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2 border-t border-slate-100 p-4">
          <button
            type="button"
            disabled={busy}
            className="min-h-[42px] flex-1 rounded-xl bg-emerald-700 px-4 py-2 text-[13px] font-bold text-white hover:bg-emerald-800 disabled:opacity-60"
            onClick={() => void runExport('excel')}
          >
            {busy ? 'Exportando…' : 'Descargar Excel'}
          </button>
          <button
            type="button"
            disabled={busy}
            className="min-h-[42px] flex-1 rounded-xl bg-section-navy px-4 py-2 text-[13px] font-bold text-white hover:brightness-110 disabled:opacity-60"
            onClick={() => void runExport('pdf')}
          >
            {busy ? 'Exportando…' : 'Descargar PDF'}
          </button>
          <button
            type="button"
            disabled={busy}
            className="min-h-[42px] w-full rounded-xl border border-slate-200 px-4 py-2 text-[13px] font-semibold text-slate-800 sm:w-auto"
            onClick={props.onClose}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
