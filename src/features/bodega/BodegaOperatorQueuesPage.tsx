import { useCallback, useEffect, useState } from 'react'
import type { AppRole } from '../../lib/roles'
import { canAccessTallerOperadorNav } from '../../lib/roles'
import type { BodegaProjectPieceWithProject } from '../../lib/bodegaPiecesRepo'
import {
  fetchPiecesQueueArmado,
  fetchPiecesQueueDetallado,
  fetchPiecesQueuePerfilado,
} from '../../lib/bodegaPiecesRepo'
import { BodegaOperatorPerfiladoWorkspace } from './BodegaOperatorPerfiladoWorkspace.tsx'
import { BodegaOperatorTallerStageWorkspace } from './BodegaOperatorTallerStageWorkspace.tsx'
import { TALLER_STAGE_TAB_LABELS, TALLER_STAGE_TAB_ORDER, type TallerStageTabId } from './bodegaTallerTabs.ts'

type QueueTab = TallerStageTabId

const TAB_META: Record<QueueTab, { label: string; color: 'teal' | 'emerald' | 'indigo' }> = {
  perfilado: { label: 'Perfilado', color: 'teal' },
  armado: { label: 'Armado', color: 'emerald' },
  detallado: { label: 'Detallado', color: 'indigo' },
}

function tabButtonClass(active: boolean, color: 'teal' | 'emerald' | 'indigo'): string {
  if (!active) return 'border border-slate-200 bg-white text-slate-800 hover:bg-slate-50'
  switch (color) {
    case 'teal':
      return 'bg-teal-700 text-white shadow-sm'
    case 'emerald':
      return 'bg-emerald-700 text-white shadow-sm'
    case 'indigo':
      return 'bg-indigo-700 text-white shadow-sm'
  }
}

/** Taller físico: perfilado, armado y detallado (sin maquinado). */
export function BodegaOperatorQueuesPage(props: { role: AppRole }) {
  const [tab, setTab] = useState<QueueTab>('perfilado')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<BodegaProjectPieceWithProject[]>([])

  const load = useCallback(async () => {
    if (!canAccessTallerOperadorNav(props.role)) return
    setLoading(true)
    setError(null)
    try {
      let list: BodegaProjectPieceWithProject[] = []
      if (tab === 'perfilado') list = await fetchPiecesQueuePerfilado()
      else if (tab === 'armado') list = await fetchPiecesQueueArmado()
      else list = await fetchPiecesQueueDetallado()
      setRows(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las colas')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [props.role, tab])

  useEffect(() => {
    void load()
  }, [load])

  if (!canAccessTallerOperadorNav(props.role)) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
        Tu rol no tiene acceso a las etapas de taller. El maquinado CNC/Torno está en{' '}
        <strong>Maquinado</strong>.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm ring-1 ring-slate-900/[0.04] sm:p-6">
        <h1 className="text-xl font-bold text-slate-900">Taller</h1>
        <p className="mt-2 max-w-3xl text-[14px] leading-relaxed text-slate-600">
          Etapas físicas después de programación o perfilado: <strong>Perfilado</strong>,{' '}
          <strong>Detallado</strong> y <strong>Armado</strong>. También puedes usar la pestaña{' '}
          <strong>Taller</strong> dentro de cada proyecto. El CNC/Torno en máquina está en{' '}
          <strong>Maquinado</strong>.
        </p>

        <div className="mt-5 flex flex-wrap gap-2" role="tablist" aria-label="Etapas de taller">
          {TALLER_STAGE_TAB_ORDER.map((id) => {
            const meta = TAB_META[id]
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                className={[
                  'min-w-[7rem] rounded-xl px-4 py-2.5 text-[13px] font-semibold transition',
                  tabButtonClass(tab === id, meta.color),
                ].join(' ')}
                onClick={() => setTab(id)}
              >
                {TALLER_STAGE_TAB_LABELS[id]}
              </button>
            )
          })}
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-900">{error}</div>
      ) : null}

      {tab === 'perfilado' ? (
        <BodegaOperatorPerfiladoWorkspace rows={rows} loading={loading} onReload={load} />
      ) : tab === 'detallado' ? (
        <BodegaOperatorTallerStageWorkspace stage="detallado" rows={rows} loading={loading} onReload={load} />
      ) : (
        <BodegaOperatorTallerStageWorkspace stage="armado" rows={rows} loading={loading} onReload={load} />
      )}
    </div>
  )
}
