import { useEffect, useMemo, useState } from 'react'
import { endPieceInterval } from '../../lib/bodegaPieceIntervalsRepo'
import type { BodegaProjectPieceWithProject } from '../../lib/bodegaPiecesRepo'
import { completePerfiladoWithOutcome, type PerfiladoCompletionOutcome } from '../../lib/bodegaPiecesRepo'
import { perfiladoOriginLabel, perfiladoOriginTone } from '../../lib/bodegaPerfiladoFlow'
import {
  loadPerfiladoPiecePdfObjectUrl,
  resolvePerfiladoPiecePdfMeta,
  revokePerfiladoPiecePdfObjectUrl,
} from '../../lib/bodegaPerfiladoPiecePdf'
import { BodegaPiecePerfiladoControls } from './BodegaPiecePerfiladoControls.tsx'
import { BodegaPieceLaneBatchControls } from './BodegaPieceLaneBatchControls.tsx'
import { filterPiecesByQueueSearch } from '../../lib/bodegaPieceQueueSearch'
import { useBodegaPieceQueueBulk, withDeliveryScrollRestore } from './useBodegaPieceQueueBulk.ts'
import { tallerPerfiladoUi as ui } from './bodegaTallerStageUi.ts'

const LANE = 'perfilado_operador' as const

type OriginFilter = 'all' | 'cnc' | 'torno'

type Props = {
  rows: BodegaProjectPieceWithProject[]
  loading: boolean
  onReload: () => Promise<void>
}

export function BodegaOperatorPerfiladoWorkspace(props: Props) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [originFilter, setOriginFilter] = useState<OriginFilter>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pdfLabel, setPdfLabel] = useState<string | null>(null)
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [pdfError, setPdfError] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const list = [...props.rows].sort((a, b) => {
      const fa = a.bodega_projects?.folio ?? ''
      const fb = b.bodega_projects?.folio ?? ''
      if (fa !== fb) return fa.localeCompare(fb, 'es')
      return a.label.localeCompare(b.label, 'es')
    })
    if (originFilter === 'all') return list
    const bucket = originFilter === 'cnc' ? 'cnc' : 'torno'
    return list.filter((p) => p.programmer_bucket === bucket)
  }, [props.rows, originFilter])

  const {
    pieceFilter,
    setPieceFilter,
    bulkSelectedIds,
    filteredVisible,
    bulkPieces,
    showBatchPanel,
    toggleBulkPiece,
    selectAllVisiblePieces,
    clearBulkSelection,
  } = useBodegaPieceQueueBulk(filtered, filterPiecesByQueueSearch)

  useEffect(() => {
    setPieceFilter('')
  }, [originFilter, setPieceFilter])

  useEffect(() => {
    if (filtered.length === 0) {
      setSelectedId(null)
      return
    }
    if (!selectedId || !filtered.some((p) => p.id === selectedId)) {
      setSelectedId(filtered[0]!.id)
    }
  }, [filtered, selectedId])

  const selected = filtered.find((p) => p.id === selectedId) ?? null

  useEffect(() => {
    setPdfPreviewUrl((prev) => {
      revokePerfiladoPiecePdfObjectUrl(prev)
      return null
    })
    setPdfLabel(null)
    setPdfError(null)
    if (!selected) return

    let cancelled = false
    setPdfLoading(true)
    void resolvePerfiladoPiecePdfMeta(selected.project_id, selected).then((meta) => {
      if (cancelled) return
      setPdfLabel(meta.pdfLabel)
      setPdfError(meta.missingReason)
      setPdfLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [selected?.id, selected?.project_id, selected?.source_path, selected?.label])

  useEffect(() => {
    return () => revokePerfiladoPiecePdfObjectUrl(pdfPreviewUrl)
  }, [pdfPreviewUrl])

  async function onViewPdf() {
    if (!selected) return
    setBusy(true)
    setErr(null)
    try {
      revokePerfiladoPiecePdfObjectUrl(pdfPreviewUrl)
      const { url } = await loadPerfiladoPiecePdfObjectUrl(selected.project_id, selected)
      setPdfPreviewUrl(url)
    } catch (e) {
      setPdfError(e instanceof Error ? e.message : 'No se pudo abrir el PDF')
    } finally {
      setBusy(false)
    }
  }

  async function onFinishPerfilado(pieceId: string, outcome: PerfiladoCompletionOutcome) {
    setBusy(true)
    setErr(null)
    try {
      await endPieceInterval(pieceId, LANE).catch(() => undefined)
      await completePerfiladoWithOutcome({ pieceId, outcome })
      await props.onReload()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo terminar el perfilado')
    } finally {
      setBusy(false)
    }
  }

  async function onBatchDone() {
    await withDeliveryScrollRestore(async () => {
      await props.onReload()
    })
    clearBulkSelection()
  }

  const cncCount = props.rows.filter((p) => p.programmer_bucket === 'cnc').length
  const tornoCount = props.rows.filter((p) => p.programmer_bucket === 'torno').length
  const pdfCount = props.rows.filter((p) => p.programmer_bucket === 'perfilado').length

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-900/[0.03]">
      <header className="border-b border-slate-200 bg-gradient-to-br from-section-navy via-[#0a2848] to-[#123d6b] px-5 py-5 sm:px-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-sky-300/90">Taller — Perfilado</p>
        <h3 className="mt-1 text-[18px] font-bold tracking-tight text-white sm:text-[20px]">Piezas a perfilar</h3>
        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-sky-100/90">
          Sin cronómetro. Revisa el PDF y al terminar envía a <strong className="text-white">Detallado</strong> o, si
          hace falta, a <strong className="text-white">CNC</strong> / <strong className="text-white">Torno</strong>.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-lg bg-white/15 px-3 py-1.5 text-[12px] font-semibold text-white">
            {props.rows.length} en cola
          </span>
          <span className="rounded-lg bg-white/10 px-3 py-1.5 text-[12px] text-sky-100/85">
            CNC {cncCount} · Torno {tornoCount}
            {pdfCount > 0 ? ` · PDF ${pdfCount}` : ''}
          </span>
        </div>
      </header>

      <div className="space-y-4 px-4 py-5 sm:px-5">
        <div className={ui.intro}>
          <p className={ui.introText}>
            Piezas con <strong>Terminar → Perfilado</strong> (o asignación Perfilado). El tiempo de máquina es solo en{' '}
            <strong>maquinado</strong>.
          </p>
        </div>

        {err ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-900">{err}</div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {(
            [
              ['all', 'Todas', props.rows.length],
              ['cnc', 'CNC', cncCount],
              ['torno', 'Torno', tornoCount],
            ] as const
          ).map(([id, label, count]) => (
            <button
              key={id}
              type="button"
              className={[
                'rounded-xl px-4 py-2 text-[13px] font-semibold transition',
                originFilter === id ? ui.filterActive : ui.filterIdle,
              ].join(' ')}
              onClick={() => setOriginFilter(id)}
            >
              {label} ({count})
            </button>
          ))}
        </div>

        {props.loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-6 py-14 text-center text-[14px] text-slate-600">
            Cargando piezas…
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-14 text-center">
            <p className="text-[15px] font-medium text-slate-800">No hay piezas en cola de perfilado</p>
            <p className="mx-auto mt-2 max-w-md text-[13px] text-slate-500">
              Aparecen aquí con asignación <strong>Perfilado</strong> o cuando CNC termina con «→ Perfilado».
            </p>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-start lg:gap-6">
            <section className={ui.listSection}>
              <div className={ui.listHeader}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Piezas en cola</p>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[10px] font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      disabled={filteredVisible.length === 0}
                      onClick={selectAllVisiblePieces}
                    >
                      Seleccionar visibles
                    </button>
                    {bulkSelectedIds.length > 0 ? (
                      <button
                        type="button"
                        className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[10px] font-bold text-slate-700 hover:bg-slate-50"
                        onClick={clearBulkSelection}
                      >
                        Limpiar ({bulkSelectedIds.length})
                      </button>
                    ) : null}
                  </div>
                </div>
                <p className="text-[13px] text-slate-600">
                  {pieceFilter.trim()
                    ? `${filteredVisible.length} de ${filtered.length}`
                    : filtered.length}{' '}
                  para perfilar
                </p>
              </div>
              <input
                type="search"
                value={pieceFilter}
                onChange={(e) => setPieceFilter(e.target.value)}
                placeholder="Buscar pieza…"
                className="mx-4 mb-2 mt-2 w-[calc(100%-2rem)] rounded-xl border border-slate-200 px-3 py-2 text-[13px] shadow-sm outline-none focus:border-section-navy/40 focus:ring-2 focus:ring-section-navy/15 sm:mx-5"
                autoComplete="off"
              />
              <ul className="max-h-[min(70vh,560px)] divide-y divide-slate-100 overflow-y-auto">
                {filteredVisible.map((r) => {
                  const proj = r.bodega_projects
                  const selectedRow = r.id === selectedId
                  const checked = bulkSelectedIds.includes(r.id)
                  return (
                    <li key={r.id} className={selectedRow || checked ? ui.listSelected : ''}>
                      <div className="flex items-stretch gap-0">
                        <label className="flex cursor-pointer items-center px-3 py-3">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-400 text-section-navy"
                            checked={checked}
                            onChange={() => toggleBulkPiece(r.id)}
                          />
                        </label>
                        <button
                          type="button"
                          className={[
                            'flex min-w-0 flex-1 flex-col gap-0.5 px-2 py-3 text-left sm:px-3',
                            !selectedRow && !checked ? ui.listHover : '',
                          ].join(' ')}
                          onClick={() => setSelectedId(r.id)}
                        >
                          <span
                            className={[
                              'w-fit rounded-md border px-1.5 py-0.5 text-[10px] font-bold',
                              perfiladoOriginTone(r),
                            ].join(' ')}
                          >
                            {perfiladoOriginLabel(r)}
                          </span>
                          <span className="break-all font-mono text-[11px] text-slate-400">{proj?.folio ?? '—'}</span>
                          <span className="break-words text-[14px] font-bold leading-snug text-slate-900">{r.label}</span>
                          <span className="break-words text-[12px] leading-snug text-slate-500">
                            {proj?.nombre ?? 'Proyecto'}
                          </span>
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
              {bulkPieces.length > 0 && !showBatchPanel ? (
                <div className="border-t border-slate-100 px-4 py-3 sm:px-5">
                  <BodegaPieceLaneBatchControls
                    compact
                    variant="perfilado"
                    lane={LANE}
                    pieces={bulkPieces}
                    intervalsByPiece={new Map()}
                    canWork
                    busy={busy}
                    onDone={onBatchDone}
                  />
                </div>
              ) : null}
            </section>

            <section className="min-w-0">
              {showBatchPanel ? (
                <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm ring-1 ring-slate-900/[0.03]">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-section-navy">
                    Varias piezas seleccionadas
                  </p>
                  <p className="mt-1 text-[15px] font-bold text-slate-900">{bulkPieces.length} piezas</p>
                  <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-[12px] text-slate-600">
                    {bulkPieces.map((p) => (
                      <li key={p.id} className="truncate font-medium">
                        {p.label}
                      </li>
                    ))}
                  </ul>
                  <BodegaPieceLaneBatchControls
                    variant="perfilado"
                    lane={LANE}
                    pieces={bulkPieces}
                    intervalsByPiece={new Map()}
                    canWork
                    busy={busy}
                    onDone={onBatchDone}
                  />
                </div>
              ) : selected ? (
                <BodegaPiecePerfiladoControls
                  piece={selected}
                  originLabel={perfiladoOriginLabel(selected)}
                  canWork
                  busy={busy}
                  pdfLabel={pdfLabel}
                  pdfPreviewUrl={pdfPreviewUrl}
                  pdfLoading={pdfLoading}
                  pdfError={pdfError}
                  onViewPdf={() => onViewPdf()}
                  onFinishPerfilado={(outcome) => onFinishPerfilado(selected.id, outcome)}
                />
              ) : null}
            </section>
          </div>
        )}
      </div>
    </section>
  )
}
