import { useCallback, useEffect, useState } from 'react'
import type { BodegaProjectPieceWithProject } from '../../lib/bodegaPiecesRepo'
import {
  fetchProjectPieces,
  fetchProjectPiecesQueueDetallado,
  fetchProjectPiecesQueuePerfilado,
  type BodegaProjectPieceRow,
} from '../../lib/bodegaPiecesRepo'
import { BodegaProjectArmadoPanel } from './BodegaProjectArmadoPanel.tsx'
import { BodegaOperatorPerfiladoWorkspace } from './BodegaOperatorPerfiladoWorkspace.tsx'
import { BodegaOperatorTallerStageWorkspace } from './BodegaOperatorTallerStageWorkspace.tsx'
import { TALLER_STAGE_TAB_LABELS, TALLER_STAGE_TAB_ORDER, type TallerStageTabId } from './bodegaTallerTabs.ts'

/** Taller del proyecto: perfilado, armado y detallado solo para piezas de este folio. */
export function BodegaProjectTallerWorkspace(props: {
  projectId: string
  projectFolio: string
  onActivity?: () => Promise<void>
}) {
  const [tab, setTab] = useState<TallerStageTabId>('perfilado')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<BodegaProjectPieceWithProject[]>([])
  const [armadoPieces, setArmadoPieces] = useState<BodegaProjectPieceRow[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      if (tab === 'armado') {
        setArmadoPieces(await fetchProjectPieces(props.projectId))
        setRows([])
      } else {
        const list =
          tab === 'perfilado'
            ? await fetchProjectPiecesQueuePerfilado(props.projectId)
            : await fetchProjectPiecesQueueDetallado(props.projectId)
        setRows(list)
      }
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
      <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[13px] leading-relaxed text-slate-700">
        Piezas del proyecto <strong className="font-mono text-section-navy">{props.projectFolio}</strong> en taller.
        <strong>Perfilado</strong> y <strong>Detallado</strong> siguen por pieza. <strong>Armado</strong> junta todas
        las de este proyecto y toma un solo tiempo.
      </p>

      <div
        className="inline-flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm"
        role="tablist"
        aria-label="Etapas de taller del proyecto"
      >
        {TALLER_STAGE_TAB_ORDER.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={[
              'min-h-[44px] min-w-[6.5rem] rounded-lg px-4 py-2.5 text-[13px] font-semibold transition outline-none focus-visible:ring-2 focus-visible:ring-section-navy/40',
              tab === id
                ? 'bg-section-navy text-white shadow-sm'
                : 'text-slate-700 hover:bg-slate-100',
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
        <BodegaProjectArmadoPanel
          projectId={props.projectId}
          projectFolio={props.projectFolio}
          pieces={armadoPieces}
          loading={loading}
          onReload={async () => {
            await load()
            await props.onActivity?.()
          }}
        />
      )}
    </div>
  )
}
