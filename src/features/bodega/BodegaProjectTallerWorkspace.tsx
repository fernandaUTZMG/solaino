import { useCallback, useEffect, useState } from 'react'
import type { BodegaProjectPieceWithProject } from '../../lib/bodegaPiecesRepo'
import {
  fetchProjectPiecesQueueArmado,
  fetchProjectPiecesQueueDetallado,
  fetchProjectPiecesQueuePerfilado,
} from '../../lib/bodegaPiecesRepo'
import { BodegaOperatorPerfiladoWorkspace } from './BodegaOperatorPerfiladoWorkspace.tsx'
import { BodegaOperatorTallerStageWorkspace } from './BodegaOperatorTallerStageWorkspace.tsx'
import { TALLER_STAGE_TAB_LABELS, TALLER_STAGE_TAB_ORDER, type TallerStageTabId } from './bodegaTallerTabs.ts'

/** Taller del proyecto: perfilado, armado y detallado solo para piezas de este folio. */
export function BodegaProjectTallerWorkspace(props: {
  projectId: string
  projectFolio: string
}) {
  const [tab, setTab] = useState<TallerStageTabId>('perfilado')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<BodegaProjectPieceWithProject[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      let list: BodegaProjectPieceWithProject[] = []
      if (tab === 'perfilado') list = await fetchProjectPiecesQueuePerfilado(props.projectId)
      else if (tab === 'armado') list = await fetchProjectPiecesQueueArmado(props.projectId)
      else list = await fetchProjectPiecesQueueDetallado(props.projectId)
      setRows(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las piezas de taller')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [props.projectId, tab])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="space-y-5">
      <p className="rounded-xl border border-teal-200/80 bg-teal-50/80 px-4 py-3 text-[13px] text-teal-950">
        Piezas del proyecto <strong className="font-mono">{props.projectFolio}</strong> en etapa de taller. Elige la
        pestaña según el trabajo: <strong>Perfilado</strong>, <strong>Detallado</strong> o <strong>Armado</strong>.
      </p>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Etapas de taller del proyecto">
        {TALLER_STAGE_TAB_ORDER.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={[
              'min-w-[6.5rem] rounded-xl px-4 py-2.5 text-[13px] font-semibold transition',
              tab === id
                ? id === 'perfilado'
                  ? 'bg-teal-700 text-white shadow-sm'
                  : id === 'detallado'
                    ? 'bg-indigo-700 text-white shadow-sm'
                    : 'bg-emerald-700 text-white shadow-sm'
                : 'border border-slate-200 bg-white text-slate-800 hover:bg-slate-50',
            ].join(' ')}
            onClick={() => setTab(id)}
          >
            {TALLER_STAGE_TAB_LABELS[id]}
          </button>
        ))}
      </div>

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
