import { useEffect, useMemo, useState } from 'react'
import type { BodegaPieceIntervalRow, BodegaPieceLane } from '../../lib/bodegaPieceIntervalsRepo'
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
import { markPieceStageCompleted } from '../../lib/bodegaPiecesRepo'
import { pieceStageOriginLabel, pieceStageOriginTone } from '../../lib/bodegaPieceStageFlow'
import {
  loadPerfiladoPiecePdfObjectUrl,
  resolvePerfiladoPiecePdfMeta,
  revokePerfiladoPiecePdfObjectUrl,
} from '../../lib/bodegaPerfiladoPiecePdf'
import { tallerStageTitle, tallerStageUi, type TallerStageKind } from './bodegaTallerStageUi.ts'
import {
  BodegaPieceTallerStageControls,
  pieceHasOpenLaneInterval,
} from './BodegaPieceTallerStageControls.tsx'
import { BodegaPieceLaneBatchControls } from './BodegaPieceLaneBatchControls.tsx'
import { filterPiecesByQueueSearch } from '../../lib/bodegaPieceQueueSearch'
import { useBodegaPieceQueueBulk, withDeliveryScrollRestore } from './useBodegaPieceQueueBulk.ts'

type OriginFilter = 'all' | 'cnc' | 'torno' | 'perfilado'

type Props = {
  stage: TallerStageKind
  rows: BodegaProjectPieceWithProject[]
  loading: boolean
  onReload: () => Promise<void>
}

const STAGE_LANE: Record<TallerStageKind, BodegaPieceLane> = {
  armado: 'armado',
  detallado: 'detallado',
}

const EMPTY_HELP: Record<TallerStageKind, string> = {
  detallado:
    'Entran piezas con perfilado terminado, maquinado enviado a detallado, o que ya cerraron armado (CNC→armado→detallado).',
  armado:
    'Entran piezas con detallado terminado (tras perfilado o maquinado→detallado), o CNC/Torno con maquinado enviado a armado.',
}

const FLOW_STEPS: Record<TallerStageKind, string[]> = {
  detallado: [
    'Tras terminar perfilado la pieza aparece aquí.',
    'CNC/Torno con perfilado: programación → perfilado → Detallado → Armado.',
    'Pieza solo PDF perfilado: perfilado → Detallado → Armado.',
    'Maquinado con «Terminar → Detallado» también entra aquí.',
    'Inicio al empezar y Fin de detallado al cerrar.',
  ],
  armado: [
    'Tras Fin de detallado (perfilado o maquinado→detallado) la pieza aparece aquí.',
    'CNC/Torno sin perfilado: maquinado → Armado → Detallado (flujo alterno).',
    'Elige pieza, Inicio, y al terminar Fin de armado.',
  ],
}

export function BodegaOperatorTallerStageWorkspace(props: Props) {
  const ui = tallerStageUi(props.stage)
  const lane = STAGE_LANE[props.stage]

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
    if (originFilter === 'perfilado') return list.filter((p) => p.programmer_bucket === 'perfilado')
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
  const selectedMins = aggregatePieceMinutesByLane(selectedIntervals).get(lane) ?? 0
  const anyActive = filtered.some((p) => pieceHasOpenLaneInterval(intervalsByPiece.get(p.id) ?? [], p.id, lane))
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
      await startPieceInterval(pieceId, lane)
      await reloadIntervalsFor(pieceId)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo iniciar')
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

  async function onFinish(pieceId: string) {
    setBusy(true)
    setErr(null)
    try {
      await endPieceInterval(pieceId, lane)
      await markPieceStageCompleted({ pieceId, stage: props.stage })
      await props.onReload()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo terminar la etapa')
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
  const perfiladoCount = props.rows.filter((p) => p.programmer_bucket === 'perfilado').length
  const enCursoCount = props.rows.filter((p) => {
    const iv = intervalsByPiece.get(p.id) ?? []
    return pieceHasOpenLaneInterval(iv, p.id, lane)
  }).length
  const pendienteCount = props.rows.length - enCursoCount

  return (
    <section className={ui.section}>
      <header className={ui.header}>
        <p className={ui.headerKicker}>Taller — {props.stage === 'armado' ? 'Armado' : 'Detallado'}</p>
        <h3 className={ui.headerTitle}>{tallerStageTitle(props.stage)}</h3>
        <p className={ui.headerBody}>
          Misma lógica para todas las piezas: <strong className="text-white">CNC</strong>,{' '}
          <strong className="text-white">Torno</strong> y <strong className="text-white">Perfilado</strong>. Elige una
          pieza, <strong className="text-white">Inicio</strong> y al terminar{' '}
          <strong className="text-white">{props.stage === 'armado' ? 'Fin de armado' : 'Fin de detallado'}</strong>.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className={ui.statChip}>{props.rows.length} en cola</span>
          <span className={ui.statChipActive}>{enCursoCount} en curso</span>
          <span className={ui.statChipMuted}>{pendienteCount} pendientes</span>
          <span className={ui.statChipMuted}>
            CNC {cncCount} · Torno {tornoCount} · Perfilado {perfiladoCount}
          </span>
        </div>
      </header>

      <div className="space-y-4 px-4 py-5 sm:px-5">
        <div className={ui.flowCard}>
          <p className={ui.flowTitle}>¿Quién entra aquí?</p>
          <ul className={`${ui.flowText} mt-2 list-disc space-y-1 pl-5`}>
            {FLOW_STEPS[props.stage].map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>

        {err ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-900">{err}</div>
        ) : null}

        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide opacity-80">Filtrar por origen</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(
              [
                ['all', 'Todas', props.rows.length],
                ['cnc', 'CNC', cncCount],
                ['torno', 'Torno', tornoCount],
                ['perfilado', 'Perfilado', perfiladoCount],
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
        </div>

        {props.loading ? (
          <div className="rounded-2xl border bg-white px-6 py-14 text-center text-[14px] text-slate-600">
            Cargando piezas…
          </div>
        ) : filtered.length === 0 ? (
          <div className={ui.empty}>
            <p className="text-[16px] font-bold">Nada en cola de {props.stage}</p>
            <p className="mx-auto mt-3 max-w-md text-[13px] leading-relaxed opacity-90">{EMPTY_HELP[props.stage]}</p>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-start lg:gap-6">
            <section className={ui.listSection}>
              <div className={ui.listHeader}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] font-bold uppercase tracking-wide opacity-75">1. Elige pieza(s)</p>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[10px] font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
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
                <p className="text-[13px] opacity-90">
                  {pieceFilter.trim()
                    ? `${filteredVisible.length} de ${filtered.length}`
                    : filtered.length}{' '}
                  en cola
                </p>
              </div>
              <input
                type="search"
                value={pieceFilter}
                onChange={(e) => setPieceFilter(e.target.value)}
                placeholder="Buscar pieza (ej. base, folio)…"
                className="mx-4 mb-2 w-[calc(100%-2rem)] rounded-xl border border-slate-200 px-3 py-2 text-[13px] shadow-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200/60 sm:mx-5"
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
                  const active = pieceHasOpenLaneInterval(iv, r.id, lane)
                  const selectedRow = r.id === selectedId
                  const bulkChecked = bulkSelectedIds.includes(r.id)
                  const proj = r.bodega_projects
                  return (
                    <li key={r.id}>
                      <div
                        className={[
                          'flex gap-1',
                          selectedRow || bulkChecked ? ui.listSelected : '',
                        ].join(' ')}
                      >
                        <label
                          className="flex shrink-0 cursor-pointer items-center px-3 py-3.5 sm:px-4"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-400 text-slate-700"
                            checked={bulkChecked}
                            onChange={() => toggleBulkPiece(r.id)}
                          />
                        </label>
                        <button
                          type="button"
                          className={[
                            'flex min-w-0 flex-1 flex-col gap-1 py-3.5 pr-4 text-left transition sm:pr-5',
                            !selectedRow && !bulkChecked ? ui.listHover : '',
                          ].join(' ')}
                          onClick={() => setSelectedId(r.id)}
                        >
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={[
                              'rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                              pieceStageOriginTone(r),
                            ].join(' ')}
                          >
                            {pieceStageOriginLabel(r)}
                          </span>
                          {active ? (
                            <span className="rounded-full border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-900">
                              En curso
                            </span>
                          ) : null}
                        </div>
                        <span className="break-all font-mono text-[11px] text-slate-500">{proj?.folio ?? '—'}</span>
                        <span className="break-words text-[14px] font-bold leading-snug text-slate-900">{r.label}</span>
                        <span className="break-words text-[12px] leading-snug text-slate-600">{proj?.nombre ?? 'Proyecto'}</span>
                        <span className="font-mono text-[12px] font-bold tabular-nums text-slate-800">
                          {formatSecondsAsHms(pieceLaneElapsedSeconds(iv, r.id, lane, clockNow))}
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
                    variant={props.stage}
                    lane={lane}
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
                <div className={ui.panel}>
                  <div className={ui.panelHeader}>
                    <p className={ui.panelKicker}>Varias piezas seleccionadas</p>
                    <p className={ui.panelTitle}>{bulkPieces.length} piezas</p>
                  </div>
                  <div className="px-5 py-4 sm:px-6">
                    <ul className="mb-3 max-h-32 space-y-1 overflow-y-auto text-[12px] text-white/85">
                      {bulkPieces.map((p) => (
                        <li key={p.id} className="truncate font-medium">
                          {p.bodega_projects?.folio ? `${p.bodega_projects.folio} · ` : ''}
                          {p.label}
                        </li>
                      ))}
                    </ul>
                    <BodegaPieceLaneBatchControls
                      variant={props.stage}
                      lane={lane}
                      pieces={bulkPieces}
                      intervalsByPiece={intervalsByPiece}
                      canWork
                      busy={busy}
                      onDone={onBatchDone}
                    />
                  </div>
                </div>
              ) : selected ? (
                <>
                  {bulkPieces.length > 1 ? (
                    <p className="mb-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[12px] text-slate-700">
                      Tienes <strong>{bulkPieces.length} piezas</strong> marcadas — usa el panel de lote para inicio y
                      fin masivos.
                    </p>
                  ) : null}
                  <BodegaPieceTallerStageControls
                  stage={props.stage}
                  lane={lane}
                  piece={selected}
                  originLabel={pieceStageOriginLabel(selected)}
                  projectFolio={selected.bodega_projects?.folio}
                  projectNombre={selected.bodega_projects?.nombre}
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
                  onFinish={() => onFinish(selected.id)}
                />
                </>
              ) : (
                <div className="flex min-h-[280px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 text-center">
                  <p className="max-w-xs text-[14px] text-slate-600">Selecciona una pieza de la lista.</p>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </section>
  )
}
