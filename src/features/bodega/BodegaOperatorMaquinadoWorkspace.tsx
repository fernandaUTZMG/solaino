import { useCallback, useEffect, useMemo, useState } from 'react'
import type { BodegaPieceIntervalRow } from '../../lib/bodegaPieceIntervalsRepo'
import {
  aggregatePieceMinutesByLane,
  closeAllOpenPieceIntervals,
  fetchPieceIntervals,
  pieceLaneElapsedSeconds,
  startPieceInterval,
} from '../../lib/bodegaPieceIntervalsRepo'
import { formatSecondsAsHms } from '../../lib/maquinadoEstimatedTime'
import { useLiveClockTick } from './useLiveClockTick.ts'
import type { BodegaProjectPieceWithProject, PostMaquinadoRoute } from '../../lib/bodegaPiecesRepo'
import {
  createSignedUrlForMaquinadoRealSheet,
  savePieceMaquinadoRealFromCapture,
} from '../../lib/bodegaPieceMaquinadoRealCapture'
import { completeMaquinadoPiece } from '../../lib/bodegaPiecesRepo'
import { maquinadoElapsedSeconds, pieceMaquinadoRealLabel } from '../../lib/maquinadoEstimatedTime'
import { bodegaPiecesSupportsPostMaquinadoRoute } from '../../lib/bodegaPiecesSchema'
import {
  maquinadoOriginLabel,
  maquinadoOriginTone,
  maquinadoPieceStatusLabel,
  maquinadoPieceStatusTone,
  maquinadoPieceUiStatus,
} from '../../lib/bodegaMaquinadoFlow'
import {
  loadPerfiladoPiecePdfObjectUrl,
  resolvePerfiladoPiecePdfMeta,
  revokePerfiladoPiecePdfObjectUrl,
} from '../../lib/bodegaPerfiladoPiecePdf'
import { maquinadoUi } from './bodegaMaquinadoUi.ts'
import {
  BodegaPieceMaquinadoControls,
  pieceHasOpenMaquinadoInterval,
} from './BodegaPieceMaquinadoControls.tsx'
import { BodegaPieceMaquinadoBatchControls } from './BodegaPieceMaquinadoBatchControls.tsx'

const LANE = 'maquinado' as const

type OriginFilter = 'all' | 'cnc' | 'torno' | 'perfilado'

type Props = {
  rows: BodegaProjectPieceWithProject[]
  loading: boolean
  onReload: () => Promise<void>
}

export function BodegaOperatorMaquinadoWorkspace(props: Props) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [originFilter, setOriginFilter] = useState<OriginFilter>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [intervalsByPiece, setIntervalsByPiece] = useState<Map<string, BodegaPieceIntervalRow[]>>(() => new Map())
  const [pdfLabel, setPdfLabel] = useState<string | null>(null)
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const [dbReady, setDbReady] = useState<boolean | null>(null)
  const [realSheetPreviewUrl, setRealSheetPreviewUrl] = useState<string | null>(null)
  const [captureBusy, setCaptureBusy] = useState(false)
  const [captureErr, setCaptureErr] = useState<string | null>(null)
  const [varianceNotes, setVarianceNotes] = useState('')
  const [pieceFilter, setPieceFilter] = useState('')
  const [bulkSelectedIds, setBulkSelectedIds] = useState<string[]>([])

  const filtered = useMemo(() => {
    const list = [...props.rows].sort((a, b) => {
      const fa = a.bodega_projects?.folio ?? ''
      const fb = b.bodega_projects?.folio ?? ''
      if (fa !== fb) return fa.localeCompare(fb, 'es')
      return a.label.localeCompare(b.label, 'es')
    })
    if (originFilter === 'all') return list
    return list.filter((p) => p.programmer_bucket === originFilter)
  }, [props.rows, originFilter])

  const filterBySearch = useCallback(
    (pieces: BodegaProjectPieceWithProject[]) => {
      const q = pieceFilter.trim().toLowerCase()
      if (!q) return pieces
      return pieces.filter((p) => {
        const label = p.label.toLowerCase()
        const path = (p.source_path ?? '').toLowerCase()
        const folio = (p.bodega_projects?.folio ?? '').toLowerCase()
        const nombre = (p.bodega_projects?.nombre ?? '').toLowerCase()
        return label.includes(q) || path.includes(q) || folio.includes(q) || nombre.includes(q)
      })
    },
    [pieceFilter],
  )

  const filteredVisible = useMemo(
    () => filterBySearch(filtered),
    [filtered, filterBySearch],
  )

  const bulkSelectedVisibleCount = useMemo(
    () => filteredVisible.filter((p) => bulkSelectedIds.includes(p.id)).length,
    [filteredVisible, bulkSelectedIds],
  )

  const bulkPieces = useMemo(
    () => filtered.filter((p) => bulkSelectedIds.includes(p.id)),
    [filtered, bulkSelectedIds],
  )

  const showBatchPanel = bulkPieces.length >= 2

  useEffect(() => {
    let cancelled = false
    void bodegaPiecesSupportsPostMaquinadoRoute().then((ok) => {
      if (!cancelled) setDbReady(ok)
    })
    return () => {
      cancelled = true
    }
  }, [])

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
  }, [originFilter])

  useEffect(() => {
    if (filtered.length === 0) {
      setSelectedId(null)
      setBulkSelectedIds([])
      return
    }
    if (!selectedId || !filtered.some((p) => p.id === selectedId)) {
      setSelectedId(filtered[0]!.id)
    }
    setBulkSelectedIds((prev) => prev.filter((id) => filtered.some((p) => p.id === id)))
  }, [filtered, selectedId])

  const selected = filtered.find((p) => p.id === selectedId) ?? null
  const selectedIntervals = selected ? (intervalsByPiece.get(selected.id) ?? []) : []
  const selectedMins = aggregatePieceMinutesByLane(selectedIntervals).get(LANE) ?? 0
  const anyActive = filtered.some((p) =>
    pieceHasOpenMaquinadoInterval(intervalsByPiece.get(p.id) ?? [], p.id),
  )
  const clockNow = useLiveClockTick(anyActive)
  const selectedElapsedSec = selected
    ? maquinadoElapsedSeconds(selectedIntervals, selected.id, clockNow)
    : 0

  useEffect(() => {
    setVarianceNotes(selected?.maquinado_time_variance_notes ?? '')
    setCaptureErr(null)
  }, [selected?.id, selected?.maquinado_time_variance_notes])

  useEffect(() => {
    let cancelled = false
    setRealSheetPreviewUrl(null)
    const path = selected?.maquinado_real_sheet_storage_path
    if (!path) return
    void createSignedUrlForMaquinadoRealSheet(path).then((url) => {
      if (!cancelled) setRealSheetPreviewUrl(url)
    })
    return () => {
      cancelled = true
    }
  }, [selected?.id, selected?.maquinado_real_sheet_storage_path])

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

  function getDeliveryScrollEl(): HTMLElement | null {
    return document.querySelector('[data-bodega-delivery-scroll]') as HTMLElement | null
  }

  async function withScrollRestore<T>(fn: () => Promise<T>): Promise<T> {
    const el = getDeliveryScrollEl()
    const top = el?.scrollTop ?? null
    const out = await fn()
    if (el && top != null) {
      requestAnimationFrame(() => {
        el.scrollTop = top
      })
    }
    return out
  }

  async function reloadIntervalsFor(pieceId: string) {
    const iv = await fetchPieceIntervals(pieceId)
    setIntervalsByPiece((prev) => {
      const next = new Map(prev)
      next.set(pieceId, iv)
      return next
    })
  }

  async function reloadIntervalsForPieces(pieceIds: string[]) {
    await Promise.all(pieceIds.map((id) => reloadIntervalsFor(id)))
  }

  function toggleBulkPiece(pieceId: string) {
    setBulkSelectedIds((prev) =>
      prev.includes(pieceId) ? prev.filter((id) => id !== pieceId) : [...prev, pieceId],
    )
  }

  function selectAllVisiblePieces() {
    setBulkSelectedIds((prev) => {
      const s = new Set(prev)
      for (const p of filteredVisible) s.add(p.id)
      return Array.from(s)
    })
  }

  function clearBulkSelection() {
    setBulkSelectedIds([])
  }

  async function onBatchMaquinadoDone() {
    await withScrollRestore(async () => {
      await reloadIntervalsForPieces(bulkSelectedIds)
      await props.onReload()
    })
    clearBulkSelection()
  }

  async function onStart(pieceId: string) {
    setBusy(true)
    setErr(null)
    try {
      await startPieceInterval(pieceId, LANE)
      await reloadIntervalsFor(pieceId)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo iniciar el maquinado')
    } finally {
      setBusy(false)
    }
  }

  async function onUploadRealCapture(file: File, manualLabel?: string) {
    if (!selected?.bodega_projects?.folio) {
      setCaptureErr('Falta el folio del proyecto.')
      return
    }
    setCaptureBusy(true)
    setCaptureErr(null)
    try {
      await savePieceMaquinadoRealFromCapture({
        projectFolio: selected.bodega_projects.folio,
        pieceId: selected.id,
        file,
        manualLabel: manualLabel ?? null,
      })
      await props.onReload()
    } catch (e) {
      setCaptureErr(e instanceof Error ? e.message : 'No se leyó el tiempo de la captura')
    } finally {
      setCaptureBusy(false)
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

  async function onFinishMaquinado(pieceId: string, route: PostMaquinadoRoute) {
    setBusy(true)
    setErr(null)
    try {
      await closeAllOpenPieceIntervals(pieceId, LANE)
      const notesTrim = varianceNotes.trim()
      await completeMaquinadoPiece({
        pieceId,
        route,
        varianceNotes: notesTrim || null,
      })
      await reloadIntervalsFor(pieceId)
      await props.onReload()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo terminar el maquinado')
    } finally {
      setBusy(false)
    }
  }

  const cncCount = props.rows.filter((p) => p.programmer_bucket === 'cnc').length
  const tornoCount = props.rows.filter((p) => p.programmer_bucket === 'torno').length
  const enCursoCount = props.rows.filter((p) => {
    const iv = intervalsByPiece.get(p.id) ?? []
    return pieceHasOpenMaquinadoInterval(iv, p.id)
  }).length
  const pendienteCount = props.rows.length - enCursoCount

  return (
    <section className={maquinadoUi.section}>
      <header className={maquinadoUi.header}>
        <p className={maquinadoUi.headerKicker}>Maquinado</p>
        <h3 className={maquinadoUi.headerTitle}>Piezas en máquina</h3>
        <p className={maquinadoUi.headerBody}>
          Piezas de <strong className="text-white">CNC</strong> y <strong className="text-white">Torno</strong> con
          archivo de programación (cerradas sin perfilado). Las asignadas a <strong className="text-white">Perfilado</strong>{' '}
          van a <strong className="text-white">Taller → Perfilado</strong>. Por cada pieza:{' '}
          <strong className="text-white">Inicio</strong> en máquina → captura SURFCAM (una por pieza o <strong className="text-white">la misma en lote</strong> si son iguales) → al terminar envías a{' '}
          <strong className="text-white">Armado</strong> o <strong className="text-white">Detallado</strong>. La
          programación del archivo se hace en Bodega → Programación.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className={maquinadoUi.statChip}>{props.rows.length} en cola</span>
          <span className={maquinadoUi.statChipActive}>{enCursoCount} maquinando</span>
          <span className={maquinadoUi.statChipMuted}>{pendienteCount} pendientes</span>
          <span className={maquinadoUi.statChipMuted}>
            CNC {cncCount} · Torno {tornoCount}
          </span>
        </div>
      </header>

      <div className="space-y-4 px-4 py-5 sm:px-5">
        {dbReady === false ? (
          <div className="rounded-xl border-2 border-rose-300 bg-rose-50 px-4 py-4 text-[13px] leading-relaxed text-rose-950">
            <p className="font-bold">Configuración pendiente en Supabase</p>
            <p className="mt-2">
              Para usar <strong>Terminación de maquinado → Armado / Detallado</strong>, abre el{' '}
              <strong>SQL Editor</strong> y ejecuta el archivo completo{' '}
              <code className="rounded bg-white/80 px-1 font-mono text-[11px]">
                supabase/patch_bodega_complete_maquinado.sql
              </code>
              . Luego en <strong>Settings → API</strong> recarga el esquema y vuelve a cargar esta página.
            </p>
          </div>
        ) : null}

        <div className={maquinadoUi.flowCard}>
          <p className={maquinadoUi.flowTitle}>Flujo de maquinado</p>
          <ol className={`${maquinadoUi.flowText} mt-2 list-decimal space-y-1.5 pl-5`}>
            <li>
              En <strong>CNC</strong> la pieza debe cerrarse con <strong>Terminar (sin perfilado)</strong> y archivo
              adjunto.
            </li>
            <li>La pieza aparece en esta lista (CNC o Torno según su ruta).</li>
            <li>
              Elige la pieza → revisa PDF y programa → <strong>Iniciar tiempo de maquinado</strong>.
            </li>
            <li>
              Al acabar en máquina: <strong>Terminar → Armado</strong> (ensamble) o{' '}
              <strong>Terminar → Detallado</strong> (salta armado).
            </li>
          </ol>
          <p className="mt-3 text-[12px] text-amber-900/75">
            Si elegiste <strong>Terminar → Perfilado</strong> en programación, la pieza va a Taller (perfilado), no
            entra aquí.
          </p>
        </div>

        {err ? (
          <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-[13px] leading-relaxed text-rose-950">
            {err}
          </div>
        ) : null}

        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-amber-900/80">Filtrar por origen</p>
          <div className="mt-2 flex flex-wrap gap-2">
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
                  originFilter === id ? maquinadoUi.filterActive : maquinadoUi.filterIdle,
                ].join(' ')}
                onClick={() => setOriginFilter(id)}
              >
                {label} ({count})
              </button>
            ))}
          </div>
        </div>

        {props.loading ? (
          <div className="rounded-2xl border border-amber-200 bg-white px-6 py-14 text-center text-[14px] text-amber-950/80">
            Cargando piezas…
          </div>
        ) : filtered.length === 0 ? (
          <div className={maquinadoUi.empty}>
            <p className="text-[16px] font-bold text-amber-950">Nada pendiente de maquinado</p>
            <p className="mx-auto mt-3 max-w-md text-[13px] leading-relaxed text-amber-900/85">
              Las piezas entran cuando en la pestaña <strong>CNC</strong> terminas con{' '}
              <strong>sin perfilado</strong> y subes el archivo de la pieza.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-6">
            <section className={maquinadoUi.listSection}>
              <div className={maquinadoUi.listHeader}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-amber-900/75">
                    1. Elige pieza(s)
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      className="rounded-lg border border-amber-300 bg-white px-2 py-1 text-[10px] font-bold text-amber-950 hover:bg-amber-50 disabled:opacity-50"
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
                <p className="text-[13px] text-amber-950/80">
                  {pieceFilter.trim()
                    ? `${filteredVisible.length} de ${filtered.length}`
                    : filtered.length}{' '}
                  pieza{filtered.length === 1 ? '' : 's'}
                  {bulkSelectedIds.length > 0 ? (
                    <span className="font-semibold">
                      {' '}
                      · {bulkSelectedIds.length} seleccionada{bulkSelectedIds.length === 1 ? '' : 's'}
                      {bulkSelectedVisibleCount > 0 && pieceFilter.trim()
                        ? ` (${bulkSelectedVisibleCount} visibles)`
                        : ''}
                    </span>
                  ) : null}
                </p>
              </div>
              <input
                type="search"
                value={pieceFilter}
                onChange={(e) => setPieceFilter(e.target.value)}
                placeholder="Buscar pieza (ej. base, folio)…"
                className="mx-4 mb-2 w-[calc(100%-2rem)] rounded-xl border border-amber-200 px-3 py-2 text-[13px] shadow-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-200/60 sm:mx-5"
                autoComplete="off"
              />
              <ul className="max-h-[min(520px,55vh)] divide-y divide-amber-100/80 overflow-y-auto overscroll-contain">
                {filteredVisible.length === 0 ? (
                  <li className="px-4 py-6 text-center text-[12px] text-slate-600 sm:px-5">
                    {filtered.length === 0
                      ? 'Sin piezas en este filtro.'
                      : `Ninguna coincide con «${pieceFilter.trim()}».`}
                  </li>
                ) : null}
                {filteredVisible.map((r) => {
                  const iv = intervalsByPiece.get(r.id) ?? []
                  const active = pieceHasOpenMaquinadoInterval(iv, r.id)
                  const status = maquinadoPieceUiStatus(active)
                  const selectedRow = r.id === selectedId
                  const bulkChecked = bulkSelectedIds.includes(r.id)
                  const proj = r.bodega_projects
                  const pieceReal = pieceMaquinadoRealLabel(r)
                  return (
                    <li key={r.id}>
                      <div
                        className={[
                          'flex gap-1 transition',
                          selectedRow || bulkChecked ? maquinadoUi.listSelected : '',
                        ].join(' ')}
                      >
                        <label
                          className="flex shrink-0 cursor-pointer items-center px-3 py-3.5 sm:px-4"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-amber-400 text-amber-700"
                            checked={bulkChecked}
                            onChange={() => toggleBulkPiece(r.id)}
                          />
                        </label>
                        <button
                          type="button"
                          className={[
                            'flex min-w-0 flex-1 flex-col gap-1 py-3.5 pr-4 text-left sm:pr-5',
                            !selectedRow && !bulkChecked ? maquinadoUi.listHover : '',
                          ].join(' ')}
                          onClick={() => setSelectedId(r.id)}
                        >
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={[
                              'rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                              maquinadoOriginTone(r),
                            ].join(' ')}
                          >
                            {maquinadoOriginLabel(r)}
                          </span>
                          <span
                            className={[
                              'rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase',
                              maquinadoPieceStatusTone(status),
                            ].join(' ')}
                          >
                            {maquinadoPieceStatusLabel(status)}
                          </span>
                          {pieceReal ? (
                            <span className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-900">
                              {pieceReal}
                            </span>
                          ) : null}
                        </div>
                        <span className="truncate font-mono text-[11px] text-amber-900/60">{proj?.folio ?? '—'}</span>
                        <span className="truncate text-[14px] font-bold text-slate-900">{r.label}</span>
                        <span className="truncate text-[12px] text-slate-600">{proj?.nombre ?? 'Proyecto'}</span>
                        <span className="font-mono text-[12px] font-bold tabular-nums text-amber-950">
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
                <div className="border-t border-amber-100 px-4 py-3 sm:px-5">
                  <BodegaPieceMaquinadoBatchControls
                    compact
                    pieces={bulkPieces}
                    intervalsByPiece={intervalsByPiece}
                    canWork
                    busy={busy}
                    onDone={onBatchMaquinadoDone}
                  />
                </div>
              ) : null}
            </section>

            <section className="min-w-0">
              <div className="mb-3 hidden border-b border-amber-100 pb-2 lg:block">
                <p className="text-[11px] font-bold uppercase tracking-wide text-amber-900/75">
                  {showBatchPanel ? '2. Lote seleccionado' : '2. Trabajar pieza'}
                </p>
                <p className="text-[13px] text-amber-950/80">
                  {showBatchPanel ? 'Tiempo, captura y destino en varias piezas' : 'Documentos, tiempo y destino'}
                </p>
              </div>
              {showBatchPanel ? (
                <div className={maquinadoUi.panel}>
                  <div className={maquinadoUi.panelHeader}>
                    <p className={maquinadoUi.panelKicker}>Varias piezas seleccionadas</p>
                    <p className={maquinadoUi.panelTitle}>
                      {bulkPieces.length} piezas en maquinado
                    </p>
                  </div>
                  <div className="px-5 py-4 sm:px-6">
                    <ul className="max-h-36 space-y-1 overflow-y-auto text-[12px] text-amber-100/90">
                      {bulkPieces.map((p) => (
                        <li key={p.id} className="truncate font-medium">
                          {p.bodega_projects?.folio ? `${p.bodega_projects.folio} · ` : ''}
                          {p.label}
                        </li>
                      ))}
                    </ul>
                    <BodegaPieceMaquinadoBatchControls
                      pieces={bulkPieces}
                      intervalsByPiece={intervalsByPiece}
                      canWork
                      busy={busy}
                      onDone={onBatchMaquinadoDone}
                    />
                  </div>
                </div>
              ) : selected ? (
                <>
                  {bulkPieces.length > 1 ? (
                    <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] leading-relaxed text-amber-950">
                      Tienes <strong>{bulkPieces.length} piezas</strong> marcadas. Usa el panel de lote (arriba en la
                      lista o esta columna con 2+) para inicio, captura y fin masivos.
                    </p>
                  ) : null}
                  <BodegaPieceMaquinadoControls
                    piece={selected}
                    originLabel={maquinadoOriginLabel(selected)}
                    projectFolio={selected.bodega_projects?.folio}
                    projectNombre={selected.bodega_projects?.nombre}
                    minutes={selectedMins}
                    elapsedSeconds={selectedElapsedSec}
                    intervals={selectedIntervals}
                    realSheetPreviewUrl={realSheetPreviewUrl}
                    captureBusy={captureBusy}
                    captureErr={captureErr}
                    onUploadRealCapture={onUploadRealCapture}
                    varianceNotes={varianceNotes}
                    onVarianceNotesChange={setVarianceNotes}
                    canWork
                    busy={busy}
                    pdfLabel={pdfLabel}
                    pdfPreviewUrl={pdfPreviewUrl}
                    pdfLoading={pdfLoading}
                    pdfError={pdfError}
                    onViewPdf={() => onViewPdf()}
                    onStart={() => onStart(selected.id)}
                    onFinishMaquinado={(route) => onFinishMaquinado(selected.id, route)}
                  />
                </>
              ) : (
                <div className="flex min-h-[280px] items-center justify-center rounded-2xl border border-dashed border-amber-300 bg-amber-50/50 px-6 text-center">
                  <p className="max-w-xs text-[14px] text-amber-950/85">
                    Selecciona una pieza de la lista para registrar el maquinado.
                  </p>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </section>
  )
}
