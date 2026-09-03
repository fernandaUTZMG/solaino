import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  addWeeksToMondayKey,
  formatWeekRangeEs,
  listSelectableWeekKeys,
  weekMondayKey,
} from '../../lib/bodegaWeekCalendar'
import { downloadProduccionSemanalPdf } from '../../lib/bodegaProduccionSemanalPdf'
import {
  ensureProduccionSemanalBundle,
  updateProduccionSemanalDay,
  updateProduccionSemanalHeader,
  type ProduccionSemanalBundle,
  type ProduccionSemanalDayRow,
} from '../../lib/bodegaProduccionSemanalRepo'
import { currentWeekMondayKey } from '../../lib/bodegaWeeklyPlanRepo'
import { canManageBodegaWeeklyPlan, type AppRole } from '../../lib/roles'
import { BodegaPlanProjectorMiniBar } from './BodegaPlanProjectorView.tsx'
import { ProduccionSemanalBoard } from './ProduccionSemanalBoard.tsx'
import { ProduccionSemanalProjectorView } from './ProduccionSemanalProjectorView.tsx'

type Props = { role: AppRole }

type ViewMode = 'view' | 'edit'

function cloneBundle(bundle: ProduccionSemanalBundle): {
  days: ProduccionSemanalDayRow[]
  labels: { disenadora_label: string; programacion_label: string; maquinado_label: string }
} {
  return {
    days: bundle.days.map((d) => ({ ...d })),
    labels: {
      disenadora_label: bundle.plan.disenadora_label,
      programacion_label: bundle.plan.programacion_label,
      maquinado_label: bundle.plan.maquinado_label,
    },
  }
}

export function BodegaProduccionSemanalPage(props: Props) {
  const canManage = canManageBodegaWeeklyPlan(props.role)
  const [weekStart, setWeekStart] = useState(() => currentWeekMondayKey())
  const [bundle, setBundle] = useState<ProduccionSemanalBundle | null>(null)
  const [draftDays, setDraftDays] = useState<ProduccionSemanalDayRow[]>([])
  const [draftLabels, setDraftLabels] = useState({
    disenadora_label: 'Diseño',
    programacion_label: 'Programación',
    maquinado_label: 'Maquinado',
  })
  const [viewMode, setViewMode] = useState<ViewMode>(canManage ? 'edit' : 'view')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [projectorActive, setProjectorActive] = useState(false)
  const [projectorExpanded, setProjectorExpanded] = useState(false)
  const [projectorRefreshing, setProjectorRefreshing] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const dirtyRef = useRef(false)

  useEffect(() => {
    dirtyRef.current = dirty
  }, [dirty])

  const weekOptions = useMemo(
    () => listSelectableWeekKeys(weekMondayKey(new Date()), 12, 8),
    [],
  )

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) {
      setLoading(true)
      setError(null)
    } else {
      setProjectorRefreshing(true)
    }
    try {
      const data = await ensureProduccionSemanalBundle(weekStart)
      setBundle(data)
      setLastRefresh(new Date())
      if (!opts?.silent || !dirtyRef.current) {
        const cloned = cloneBundle(data)
        setDraftDays(cloned.days)
        setDraftLabels(cloned.labels)
        if (!opts?.silent) setDirty(false)
      }
    } catch (e) {
      if (!opts?.silent) {
        setError(e instanceof Error ? e.message : 'No se pudo cargar el plan de producción')
        setBundle(null)
      }
    } finally {
      if (!opts?.silent) setLoading(false)
      else setProjectorRefreshing(false)
    }
  }, [weekStart])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!canManage) setViewMode('view')
  }, [canManage])

  useEffect(() => {
    if (!projectorActive) return
    const id = window.setInterval(() => {
      void load({ silent: true })
    }, 30_000)
    return () => window.clearInterval(id)
  }, [projectorActive, load])

  function stopProjector() {
    setProjectorActive(false)
    setProjectorExpanded(false)
    if (document.fullscreenElement) {
      void document.exitFullscreen?.().catch(() => {})
    }
  }

  function toggleProjector() {
    if (!projectorActive) {
      setProjectorActive(true)
      setProjectorExpanded(true)
      void load({ silent: true })
      return
    }
    if (projectorExpanded) {
      setProjectorExpanded(false)
      if (document.fullscreenElement) {
        void document.exitFullscreen?.().catch(() => {})
      }
    } else {
      setProjectorExpanded(true)
    }
  }

  function patchDay(dayIndex: number, patch: Partial<ProduccionSemanalDayRow>) {
    setDraftDays((prev) =>
      prev.map((d) => (d.day_index === dayIndex ? { ...d, ...patch } : d)),
    )
    setDirty(true)
  }

  function patchLabels(patch: Partial<typeof draftLabels>) {
    setDraftLabels((prev) => ({ ...prev, ...patch }))
    setDirty(true)
  }

  async function handleSave() {
    if (!bundle || !canManage) return
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      await updateProduccionSemanalHeader(bundle.plan.id, draftLabels)
      await Promise.all(
        draftDays.map((day) =>
          updateProduccionSemanalDay(day.id, {
            disenadora: day.disenadora,
            programacion: day.programacion,
            maquinado: day.maquinado,
            comentarios: day.comentarios,
          }),
        ),
      )
      setBundle({
        plan: { ...bundle.plan, ...draftLabels },
        days: draftDays.map((d) => ({ ...d })),
      })
      setDirty(false)
      setNotice('Plan de producción guardado.')
      window.setTimeout(() => setNotice(null), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  async function handleExportPdf() {
    if (!bundle) return
    try {
      await downloadProduccionSemanalPdf({
        plan: { ...bundle.plan, ...draftLabels },
        days: draftDays,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo exportar PDF')
    }
  }

  function handlePrint() {
    window.print()
  }

  return (
    <div className="mx-auto max-w-[min(100%,1200px)] space-y-4 print:max-w-none">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .produccion-semanal-print-root,
          .produccion-semanal-print-root * { visibility: visible !important; }
          .produccion-semanal-print-root {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          .produccion-semanal-no-print { display: none !important; }
        }
      `}</style>

      <header className="produccion-semanal-no-print rounded-2xl border border-slate-200/90 bg-white px-5 py-4 shadow-sm sm:px-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Producción</p>
        <h1 className="mt-1 text-xl font-bold text-slate-900">Producción semanal</h1>
        <p className="mt-1 text-[13px] text-slate-600">
          Plan por día: diseño, programación, maquinado y comentarios. Una tarea por línea en cada celda.
        </p>
      </header>

      <div className="produccion-semanal-no-print flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <button
          type="button"
          className="rounded-lg border border-slate-200 px-3 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
          onClick={() => setWeekStart((w) => addWeeksToMondayKey(w, -1))}
          disabled={loading}
        >
          ← Semana anterior
        </button>
        <select
          value={weekStart}
          onChange={(e) => setWeekStart(e.target.value)}
          className="min-w-[12rem] rounded-lg border border-slate-200 px-3 py-2 text-[13px] font-semibold text-slate-800"
          disabled={loading}
        >
          {weekOptions.map((k) => (
            <option key={k} value={k}>
              {formatWeekRangeEs(k)}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="rounded-lg border border-slate-200 px-3 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
          onClick={() => setWeekStart((w) => addWeeksToMondayKey(w, 1))}
          disabled={loading}
        >
          Semana siguiente →
        </button>
        <button
          type="button"
          className="rounded-lg border border-slate-200 px-3 py-2 text-[13px] font-semibold text-slate-700"
          onClick={() => void load()}
          disabled={loading}
        >
          Actualizar
        </button>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {canManage ? (
            <>
              <button
                type="button"
                className={[
                  'rounded-lg px-3 py-2 text-[13px] font-semibold',
                  viewMode === 'edit'
                    ? 'bg-sky-700 text-white'
                    : 'border border-slate-200 text-slate-700 hover:bg-slate-50',
                ].join(' ')}
                onClick={() => setViewMode('edit')}
              >
                Editar plan
              </button>
              <button
                type="button"
                className={[
                  'rounded-lg px-3 py-2 text-[13px] font-semibold',
                  viewMode === 'view'
                    ? 'bg-section-navy text-white'
                    : 'border border-slate-200 text-slate-700 hover:bg-slate-50',
                ].join(' ')}
                onClick={() => setViewMode('view')}
              >
                Vista plan
              </button>
              <button
                type="button"
                disabled={!dirty || saving || loading}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-[13px] font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                onClick={() => void handleSave()}
              >
                {saving ? 'Guardando…' : dirty ? 'Guardar cambios' : 'Guardado'}
              </button>
            </>
          ) : null}
          <button
            type="button"
            disabled={!bundle || loading}
            className={[
              'rounded-lg px-3 py-2 text-[13px] font-bold shadow-sm disabled:opacity-50',
              projectorActive
                ? 'border-2 border-violet-500 bg-violet-600 text-white ring-2 ring-violet-300/80'
                : 'border border-violet-200 bg-violet-50 text-violet-950 hover:bg-violet-100',
            ].join(' ')}
            onClick={() => toggleProjector()}
            title="Vista proyector en pantalla completa (actualiza cada 30 s)"
          >
            {projectorActive
              ? projectorExpanded
                ? '● Proyector activo'
                : '● Proyector (minimizado)'
              : 'Vista proyector'}
          </button>
          <button
            type="button"
            disabled={!bundle || loading}
            className="rounded-lg border border-slate-200 px-3 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            onClick={() => void handleExportPdf()}
          >
            PDF
          </button>
          <button
            type="button"
            disabled={!bundle || loading}
            className="rounded-lg border border-slate-200 px-3 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            onClick={handlePrint}
          >
            Imprimir
          </button>
        </div>
      </div>

      {notice ? (
        <div className="produccion-semanal-no-print rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-[13px] text-emerald-900">
          {notice}
        </div>
      ) : null}
      {error ? (
        <div className="produccion-semanal-no-print rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-900">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-slate-200 border-t-sky-700" aria-hidden />
        </div>
      ) : bundle ? (
        <div className="produccion-semanal-print-root">
          <ProduccionSemanalBoard
            bundle={bundle}
            mode={canManage && viewMode === 'edit' ? 'edit' : 'view'}
            draftDays={draftDays}
            draftLabels={draftLabels}
            onDayChange={canManage ? patchDay : undefined}
            onLabelChange={canManage ? patchLabels : undefined}
            printMode
          />
        </div>
      ) : null}

      {projectorActive && bundle && projectorExpanded ? (
        <ProduccionSemanalProjectorView
          weekStart={weekStart}
          labels={draftLabels}
          days={draftDays}
          lastUpdated={lastRefresh}
          refreshing={projectorRefreshing}
          onMinimize={() => {
            setProjectorExpanded(false)
            if (document.fullscreenElement) {
              void document.exitFullscreen?.().catch(() => {})
            }
          }}
          onClose={stopProjector}
        />
      ) : null}

      {projectorActive && bundle && !projectorExpanded ? (
        <BodegaPlanProjectorMiniBar
          lastUpdated={lastRefresh}
          refreshing={projectorRefreshing}
          onExpand={() => setProjectorExpanded(true)}
          onClose={stopProjector}
        />
      ) : null}
    </div>
  )
}
