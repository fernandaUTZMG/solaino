import { useEffect, useMemo, useState } from 'react'
import type { BodegaPieceIntervalRow } from '../../lib/bodegaPieceIntervalsRepo'
import {
  aggregatePieceMinutesByLane,
  endPieceInterval,
  fetchPieceIntervals,
  pieceLaneElapsedSeconds,
  startPieceInterval,
} from '../../lib/bodegaPieceIntervalsRepo'
import { formatSecondsAsHms } from '../../lib/maquinadoEstimatedTime'
import { useLiveClockTick } from './useLiveClockTick.ts'
import type { BodegaProjectPieceWithProject } from '../../lib/bodegaPiecesRepo'
import { completePerfiladoWithOutcome, type PerfiladoCompletionOutcome } from '../../lib/bodegaPiecesRepo'
import { perfiladoOriginLabel, perfiladoOriginTone } from '../../lib/bodegaPerfiladoFlow'
import {
  loadPerfiladoPiecePdfObjectUrl,
  resolvePerfiladoPiecePdfMeta,
  revokePerfiladoPiecePdfObjectUrl,
} from '../../lib/bodegaPerfiladoPiecePdf'
import {
  BodegaPiecePerfiladoControls,
  pieceHasOpenPerfiladoInterval,
} from './BodegaPiecePerfiladoControls.tsx'
import { BodegaPieceLaneBatchControls } from './BodegaPieceLaneBatchControls.tsx'
import { filterPiecesByQueueSearch } from '../../lib/bodegaPieceQueueSearch'
import { useBodegaPieceQueueBulk, withDeliveryScrollRestore } from './useBodegaPieceQueueBulk.ts'

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
  const [intervalsByPiece, setIntervalsByPiece] = useState<Map<string, BodegaPieceIntervalRow[]>>(() => new Map())
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
    let cancelled = false
    void (async () => {
      const next = new Map<string, BodegaPieceIntervalRow[]>()
      await Promise.all(
        props.rows.map(async (p) => {
          const iv = await fetchPieceIntervals(p.id)
          next.set(p.id, iv)
        }),
      )
      if (!cancelled) setIntervalsByPiece(next)
    })()
    return () => {
      cancelled = true
    }
  }, [props.rows])

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
  const selectedIntervals = selected ? (intervalsByPiece.get(selected.id) ?? []) : []
  const selectedMins = aggregatePieceMinutesByLane(selectedIntervals).get(LANE) ?? 0
  const anyActive = filtered.some((p) => pieceHasOpenPerfiladoInterval(intervalsByPiece.get(p.id) ?? [], p.id))
  const clockNow = useLiveClockTick(anyActive)

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

  async function reloadIntervalsFor(pieceId: string) {
    const iv = await fetchPieceIntervals(pieceId)
    setIntervalsByPiece((prev) => {
      const next = new Map(prev)
      next.set(pieceId, iv)
      return next
    })
  }

  async function onStart(pieceId: string) {
    setBusy(true)
    setErr(null)
    try {
      await startPieceInterval(pieceId, LANE)
      await reloadIntervalsFor(pieceId)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo iniciar el perfilado')
    } finally {
      setBusy(false)
    }
  }

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
      await endPieceInterval(pieceId, LANE)
      await completePerfiladoWithOutcome({ pieceId, outcome })
      await props.onReload()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo terminar el perfilado')
    } finally {
      setBusy(false)
    }
  }

  async function reloadIntervalsForPieces(pieceIds: string[]) {
    await Promise.all(pieceIds.map((id) => reloadIntervalsFor(id)))
  }

  async function onBatchDone() {
    await withDeliveryScrollRestore(async () => {
      await reloadIntervalsForPieces(bulkSelectedIds)
      await props.onReload()
    })
    clearBulkSelection()
  }

  const cncCount = props.rows.filter((p) => p.programmer_bucket === 'cnc').length
  const tornoCount = props.rows.filter((p) => p.programmer_bucket === 'torno').length
  const pdfCount = props.rows.filter((p) => p.programmer_bucket === 'perfilado').length

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-teal-200/70 bg-teal-50/50 px-5 py-4 sm:px-6">
        <p className="text-[14px] leading-relaxed text-teal-950">
          Piezas de <strong>CNC</strong> y <strong>Torno</strong> (y PDF de diseño). Elige una pieza, abre el{' '}
          <strong>PDF</strong>,           <strong>Inicio</strong> y al terminar elige <strong>Detallado</strong> (lo habitual) o, si hace falta,{' '}
          <strong>CNC</strong> / <strong>Torno</strong> para otra programación.
        </p>
        <p className="mt-2 text-[12px] text-teal-900/80">
          En cola: {props.rows.length} · CNC {cncCount} · Torno {tornoCount}
          {pdfCount > 0 ? ` · PDF ${pdfCount}` : ''}
        </p>
      </div>

      {err ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-900">
          {err}
        </div>
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
              originFilter === id
                ? 'bg-teal-700 text-white shadow-sm'
                : 'border border-slate-200 bg-white text-slate-800 hover:bg-slate-50',
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
          <p className="text-[15px] font-medium text-slate-700">No hay piezas en cola de perfilado</p>
          <p className="mx-auto mt-2 max-w-md text-[13px] text-slate-500">
            Aparecen aquí con asignación <strong>Perfilado</strong> (tras confirmar rutas) o cuando CNC/Torno terminan con «→ Perfilado».
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-start lg:gap-6">
          <section className="rounded-2xl border border-slate-200/90 bg-white shadow-sm ring-1 ring-slate-900/[0.03]">
            <div className="border-b border-slate-100 px-4 py-3 sm:px-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Piezas en cola</p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    className="rounded-lg border border-teal-300 bg-white px-2 py-1 text-[10px] font-bold text-teal-900 hover:bg-teal-50 disabled:opacity-50"
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
              placeholder="Buscar pieza (ej. base, folio)…"
              className="mx-4 mb-2 mt-2 w-[calc(100%-2rem)] rounded-xl border border-slate-200 px-3 py-2 text-[13px] shadow-sm focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-200/60 sm:mx-5"
              autoComplete="off"
            />
            <ul className="max-h-[min(520px,55vh)] divide-y divide-slate-100 overflow-y-auto overscroll-contain scroll-py-2 scroll-pb-4">
              {filteredVisible.length === 0 ? (
                <li className="px-4 py-6 text-center text-[12px] text-slate-600 sm:px-5">
                  {filtered.length === 0
                    ? 'Sin piezas.'
                    : `Ninguna coincide con «${pieceFilter.trim()}».`}
                </li>
              ) : null}
              {filteredVisible.map((r) => {
                const iv = intervalsByPiece.get(r.id) ?? []
                const active = pieceHasOpenPerfiladoInterval(iv, r.id)
                const selectedRow = r.id === selectedId
                const bulkChecked = bulkSelectedIds.includes(r.id)
                const proj = r.bodega_projects
                return (
                  <li key={r.id}>
                    <div
                      className={[
                        'flex gap-1',
                        selectedRow || bulkChecked ? 'bg-teal-50 ring-1 ring-inset ring-teal-200/80' : '',
                      ].join(' ')}
                    >
                      <label
                        className="flex shrink-0 cursor-pointer items-center px-3 py-3.5 sm:px-4"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-teal-400 text-teal-700"
                          checked={bulkChecked}
                          onChange={() => toggleBulkPiece(r.id)}
                        />
                      </label>
                      <button
                        type="button"
                        className={[
                          'flex min-w-0 flex-1 flex-col gap-1 py-3.5 pr-4 text-left transition sm:pr-5',
                          !selectedRow && !bulkChecked ? 'hover:bg-slate-50/90' : '',
                        ].join(' ')}
                        onClick={() => setSelectedId(r.id)}
                      >
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={[
                            'rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                            perfiladoOriginTone(r),
                          ].join(' ')}
                        >
                          {perfiladoOriginLabel(r)}
                        </span>
                        {active ? (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-800">
                            En curso
                          </span>
                        ) : null}
                      </div>
                      <span className="break-all font-mono text-[11px] text-slate-500">{proj?.folio ?? '—'}</span>
                      <span className="break-words text-[14px] font-bold leading-snug text-slate-900">{r.label}</span>
                      <span className="break-words text-[12px] leading-snug text-slate-600">{proj?.nombre ?? 'Proyecto'}</span>
                      <span className="font-mono text-[12px] font-bold tabular-nums text-slate-800">
                        {formatSecondsAsHms(pieceLaneElapsedSeconds(iv, r.id, LANE, clockNow))}
                        {active ? (
                          <span className="ml-1.5 text-[10px] font-bold uppercase text-emerald-700">●</span>
                        ) : null}
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
                  intervalsByPiece={intervalsByPiece}
                  canWork
                  busy={busy}
                  onDone={onBatchDone}
                />
              </div>
            ) : null}
          </section>

          <section className="min-w-0">
            {showBatchPanel ? (
              <div className="rounded-2xl border border-teal-200/80 bg-gradient-to-br from-teal-50/90 to-white px-5 py-4 shadow-sm">
                <p className="text-[11px] font-bold uppercase text-teal-900">Varias piezas seleccionadas</p>
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
                  intervalsByPiece={intervalsByPiece}
                  canWork
                  busy={busy}
                  onDone={onBatchDone}
                />
              </div>
            ) : selected ? (
              <>
                {bulkPieces.length > 1 ? (
                  <p className="mb-3 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-[12px] text-teal-950">
                    Tienes <strong>{bulkPieces.length} piezas</strong> marcadas — usa el panel de lote para inicio
                    y fin masivos.
                  </p>
                ) : null}
                <BodegaPiecePerfiladoControls
                piece={selected}
                originLabel={perfiladoOriginLabel(selected)}
                minutes={selectedMins}
                intervals={selectedIntervals}
                canWork
                busy={busy}
                pdfLabel={pdfLabel}
                pdfPreviewUrl={pdfPreviewUrl}
                pdfLoading={pdfLoading}
                pdfError={pdfError}
                onViewPdf={() => onViewPdf()}
                onStart={() => onStart(selected.id)}
                onFinishPerfilado={(outcome) => onFinishPerfilado(selected.id, outcome)}
              />
              </>
            ) : null}
          </section>
        </div>
      )}
    </div>
  )
}
