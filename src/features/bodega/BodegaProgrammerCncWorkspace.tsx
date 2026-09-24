import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AppRole } from '../../lib/roles'
import { canManageBodegaLikeAdmin, canUploadBodegaMachine } from '../../lib/roles'
import type { BodegaProjectPieceRow } from '../../lib/bodegaPiecesRepo'
import type { ProgrammingExitKind } from '../../lib/bodegaPiecesRepo'
import {
  aggregatePieceMinutesByLane,
  fetchPieceIntervalsForProject,
  startPieceInterval,
} from '../../lib/bodegaPieceIntervalsRepo'
import {
  finishPieceProgramming,
  finishPieceProgrammingWithExistingFile,
  replacePieceProgrammingFile,
} from '../../lib/bodegaPieceProgrammingFile'
import { pieceLaneElapsedSeconds } from '../../lib/bodegaPieceIntervalsRepo'
import { formatSecondsAsHms } from '../../lib/maquinadoEstimatedTime'
import { useLiveClockTick } from './useLiveClockTick.ts'
import {
  pieceAwaitingPostPerfiladoProgramming,
  postPerfiladoTargetModule,
  type PostPerfiladoProgrammingBucket,
} from '../../lib/bodegaPostPerfiladoProgramming'
import {
  pieceLaneForModule,
  piecesPendingInCncModule,
  programmerCncModulesWithPieces,
} from '../../lib/bodegaProgrammerFlow'
import { BodegaPieceProgrammingControls } from './BodegaPieceProgrammingControls.tsx'
import { BodegaPieceProgrammingBatchControls } from './BodegaPieceProgrammingBatchControls.tsx'
import { progSeccionForModule, progTituloForModule, progWorkspacePalette } from './bodegaProgramacionUi.ts'

type CncModule = 'programacion' | 'torno'

type Props = {
  role: AppRole
  projectId: string
  projectFolio: string
  pieces: BodegaProjectPieceRow[]
  designZipPaths?: string[]
  activeModule: CncModule
  onModuleChange: (m: CncModule) => void
  onReload: () => Promise<void>
  /** Vista amplia (pantalla completa). */
  spacious?: boolean
  /** Solo en vista inline: abre pantalla completa (el selector de módulo va arriba en el modal). */
  onOpenFullscreen?: () => void
  /** Sin envoltorio de sección (dentro de BodegaProgramacionWorkspace). */
  embedded?: boolean
}

export function BodegaProgrammerCncWorkspace(props: Props) {
  const prog = canUploadBodegaMachine(props.role)
  const adminLike = canManageBodegaLikeAdmin(props.role)
  const canWork = prog || adminLike
  const spacious = props.spacious ?? false
  const palette = progWorkspacePalette(props.activeModule)

  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [intervalRows, setIntervalRows] = useState<Awaited<ReturnType<typeof fetchPieceIntervalsForProject>>>([])
  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null)
  const [bulkSelectedIds, setBulkSelectedIds] = useState<string[]>([])
  const [pieceFilter, setPieceFilter] = useState('')
  const finishFileInputRef = useRef<HTMLInputElement>(null)
  const [finishTargetId, setFinishTargetId] = useState<string | null>(null)

  const modulesWithPieces = useMemo(() => programmerCncModulesWithPieces(props.pieces), [props.pieces])
  const showModuleTabs = spacious && modulesWithPieces.length > 1
  const modulePieces = useMemo(
    () => piecesPendingInCncModule(props.pieces, props.activeModule),
    [props.pieces, props.activeModule],
  )
  const lane = pieceLaneForModule(props.activeModule)
  const moduleLabel = props.activeModule === 'programacion' ? 'CNC' : 'Torno'

  const filterModulePieces = useCallback(
    (pieces: BodegaProjectPieceRow[]) => {
      const q = pieceFilter.trim().toLowerCase()
      if (!q) return pieces
      return pieces.filter((p) => {
        const label = p.label.toLowerCase()
        const path = (p.source_path ?? '').toLowerCase()
        return label.includes(q) || path.includes(q)
      })
    },
    [pieceFilter],
  )

  const filteredModulePieces = useMemo(
    () => filterModulePieces(modulePieces),
    [modulePieces, filterModulePieces],
  )

  const bulkSelectedVisibleCount = useMemo(
    () => filteredModulePieces.filter((p) => bulkSelectedIds.includes(p.id)).length,
    [filteredModulePieces, bulkSelectedIds],
  )

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const iv = await fetchPieceIntervalsForProject(props.projectId)
        if (!cancelled) setIntervalRows(iv)
      } catch {
        if (!cancelled) setIntervalRows([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [props.projectId, props.pieces])

  const minsByPiece = useMemo(() => {
    const m = new Map<string, number>()
    const byPiece = new Map<string, typeof intervalRows>()
    for (const r of intervalRows) {
      if (!byPiece.has(r.piece_id)) byPiece.set(r.piece_id, [])
      byPiece.get(r.piece_id)!.push(r)
    }
    for (const [pid, rows] of byPiece) {
      m.set(pid, aggregatePieceMinutesByLane(rows).get(lane) ?? 0)
    }
    return m
  }, [intervalRows, lane])

  useEffect(() => {
    if (!modulesWithPieces.includes(props.activeModule) && modulesWithPieces.length > 0) {
      props.onModuleChange(modulesWithPieces[0]!)
    }
  }, [modulesWithPieces, props.activeModule, props.onModuleChange])

  useEffect(() => {
    setPieceFilter('')
  }, [props.activeModule])

  useEffect(() => {
    if (modulePieces.length === 0) {
      setSelectedPieceId(null)
      setBulkSelectedIds([])
      return
    }
    if (!selectedPieceId || !modulePieces.some((p) => p.id === selectedPieceId)) {
      setSelectedPieceId(modulePieces[0]!.id)
    }
    setBulkSelectedIds((prev) => prev.filter((id) => modulePieces.some((p) => p.id === id)))
  }, [modulePieces, selectedPieceId])

  useEffect(() => {
    const pending = props.pieces.filter((p) => pieceAwaitingPostPerfiladoProgramming(p))
    if (pending.length === 0) return
    const bucket = pending[0]!.post_perfilado_programming_bucket as PostPerfiladoProgrammingBucket
    const target = postPerfiladoTargetModule(bucket)
    if (props.activeModule !== target && modulesWithPieces.includes(target)) {
      props.onModuleChange(target)
    }
  }, [props.pieces, props.activeModule, props.onModuleChange, modulesWithPieces])

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

  async function reloadIntervals() {
    const iv = await fetchPieceIntervalsForProject(props.projectId)
    setIntervalRows(iv)
  }

  function toggleBulkPiece(pieceId: string) {
    setBulkSelectedIds((prev) =>
      prev.includes(pieceId) ? prev.filter((id) => id !== pieceId) : [...prev, pieceId],
    )
  }

  function selectAllVisiblePieces() {
    setBulkSelectedIds((prev) => {
      const s = new Set(prev)
      for (const p of filteredModulePieces) s.add(p.id)
      return Array.from(s)
    })
  }

  function clearBulkSelection() {
    setBulkSelectedIds([])
  }

  async function onProgStart(p: BodegaProjectPieceRow) {
    if (!canWork) return
    setBusy(true)
    setErr(null)
    try {
      await startPieceInterval(p.id, lane)
      await reloadIntervals()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se inició el tiempo')
    } finally {
      setBusy(false)
    }
  }

  async function onProgFinish(p: BodegaProjectPieceRow, kind: ProgrammingExitKind, file: File) {
    if (!canWork) return
    setBusy(true)
    setErr(null)
    try {
      await finishPieceProgramming({
        projectFolio: props.projectFolio,
        pieceId: p.id,
        lane,
        exitKind: kind,
        file,
      })
      await reloadIntervals()
      await props.onReload()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se terminó la programación')
    } finally {
      setBusy(false)
    }
  }

  async function onReplaceFile(p: BodegaProjectPieceRow, file: File) {
    if (!canWork) return
    setBusy(true)
    setErr(null)
    try {
      await replacePieceProgrammingFile({
        projectFolio: props.projectFolio,
        pieceId: p.id,
        file,
      })
      await props.onReload()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se subió el archivo')
    } finally {
      setBusy(false)
    }
  }

  const selectedPiece = modulePieces.find((p) => p.id === selectedPieceId) ?? null
  const bulkPieces = useMemo(
    () => modulePieces.filter((p) => bulkSelectedIds.includes(p.id)),
    [modulePieces, bulkSelectedIds],
  )
  const showBatchPanel = bulkPieces.length >= 2

  async function onBatchProgrammingDone(clearSelection = false) {
    await withScrollRestore(async () => {
      await reloadIntervals()
      await props.onReload()
    })
    if (clearSelection) clearBulkSelection()
  }
  const anyModuleActive = modulePieces.some((p) =>
    intervalRows.some(
      (r) => r.piece_id === p.id && r.lane === lane && r.ended_at == null,
    ),
  )
  const clockNow = useLiveClockTick(anyModuleActive || modulePieces.length > 0)

  async function onRowFinish(p: BodegaProjectPieceRow) {
    if (!canWork || p.programming_finished_at) return
    if (p.programming_file_storage_path && p.programming_file_name) {
      setBusy(true)
      setErr(null)
      try {
        await finishPieceProgrammingWithExistingFile({
          pieceId: p.id,
          lane,
          exitKind: 'archivo_adjunto',
          fileStoragePath: p.programming_file_storage_path,
          fileName: p.programming_file_name,
        })
        await reloadIntervals()
        await props.onReload()
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'No se terminó la programación')
      } finally {
        setBusy(false)
      }
      return
    }
    setFinishTargetId(p.id)
    setSelectedPieceId(p.id)
    window.setTimeout(() => finishFileInputRef.current?.click(), 0)
  }

  async function onRowFinishFilePicked(file: File | undefined) {
    const pieceId = finishTargetId
    setFinishTargetId(null)
    if (finishFileInputRef.current) finishFileInputRef.current.value = ''
    if (!file || !pieceId) return
    const p = modulePieces.find((x) => x.id === pieceId)
    if (!p) return
    await onProgFinish(p, 'archivo_adjunto', file)
  }

  const seccion = progSeccionForModule(props.activeModule)
  const titulo = progTituloForModule(props.activeModule)
  const embedded = props.embedded ?? false

  const inner = (
    <>
      {!embedded ? (
        <div
          className={[
            titulo,
            'flex flex-wrap items-center justify-between gap-3',
            showModuleTabs ? '' : 'px-4 py-2.5 sm:px-5',
          ].join(' ')}
        >
          <h3 className="text-[13px] font-bold">Programación — {moduleLabel}</h3>
          {!spacious && props.onOpenFullscreen ? (
            <button
              type="button"
              className="min-h-[40px] shrink-0 rounded-lg border border-programacion-400/80 bg-white px-4 py-2 text-[13px] font-bold text-programacion-900 shadow-sm hover:bg-programacion-50"
              onClick={props.onOpenFullscreen}
            >
              Pantalla completa
            </button>
          ) : null}
        </div>
      ) : props.onOpenFullscreen ? (
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            className="min-h-[40px] rounded-xl border-2 border-programacion-400 bg-white px-4 py-2 text-[13px] font-bold text-programacion-900 shadow-sm hover:bg-programacion-50"
            onClick={props.onOpenFullscreen}
          >
            Pantalla completa
          </button>
        </div>
      ) : null}
      {showModuleTabs ? (
        <div className="border-b border-programacion-100 px-4 py-3 sm:px-5">
          <div role="tablist" aria-label="CNC o Torno" className="grid grid-cols-2 gap-2">
            {(['programacion', 'torno'] as const).map((m) => {
              const count = piecesPendingInCncModule(props.pieces, m).length
              if (count === 0) return null
              const tabPalette = progWorkspacePalette(m)
              return (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={props.activeModule === m}
                  className={[
                    'min-h-[44px] rounded-lg text-[14px] font-bold transition',
                    props.activeModule === m ? tabPalette.tabActive : tabPalette.tabInactive,
                  ].join(' ')}
                  onClick={() => props.onModuleChange(m)}
                >
                  {m === 'programacion' ? 'CNC' : 'Torno'} ({count})
                </button>
              )
            })}
          </div>
        </div>
      ) : null}

      <div className={[embedded ? '' : 'p-4 sm:p-6', spacious ? 'lg:p-8' : ''].join(' ')}>
        {err ? (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-900">{err}</div>
        ) : null}
        <input
          ref={finishFileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => void onRowFinishFilePicked(e.target.files?.[0])}
        />

        {modulePieces.length === 0 ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-[14px] text-emerald-950">
            <p className="font-bold">Programación de {moduleLabel} lista</p>
            <p className="mt-1 text-[13px] leading-relaxed text-emerald-900/90">
              No quedan piezas pendientes aquí. Las que terminaste con archivo ya salieron a{' '}
              <strong>maquinado</strong> (o a perfilado si así las cerraste).
            </p>
          </div>
        ) : (
          <div className={[spacious ? 'grid gap-6 lg:grid-cols-[minmax(220px,320px)_1fr]' : 'space-y-4'].join(' ')}>
            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className={['text-[11px] font-bold uppercase', palette.label].join(' ')}>
                  Piezas en {moduleLabel}
                  {pieceFilter.trim() ? (
                    <span className="font-semibold normal-case text-slate-600">
                      {' '}
                      ({filteredModulePieces.length} de {modulePieces.length})
                    </span>
                  ) : (
                    <span className="font-semibold normal-case text-slate-600"> ({modulePieces.length})</span>
                  )}
                </p>
                {canWork && modulePieces.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      className="rounded-lg border border-programacion-300 bg-white px-2 py-1 text-[10px] font-bold text-programacion-900 hover:bg-programacion-50 disabled:opacity-50"
                      disabled={filteredModulePieces.length === 0}
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
                ) : null}
              </div>
              {bulkSelectedIds.length > 0 ? (
                <p className="mb-2 text-[11px] font-semibold text-programacion-900">
                  Seleccionadas: {bulkSelectedIds.length}
                  {bulkSelectedVisibleCount > 0 && pieceFilter.trim() ? (
                    <span className="text-programacion-800/80"> (visibles: {bulkSelectedVisibleCount})</span>
                  ) : null}
                </p>
              ) : null}
              <input
                type="search"
                value={pieceFilter}
                onChange={(e) => setPieceFilter(e.target.value)}
                placeholder="Buscar pieza (ej. base, jaladera)…"
                className="mb-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-[13px] shadow-sm focus:border-programacion-400 focus:outline-none focus:ring-2 focus:ring-programacion-200/60"
                autoComplete="off"
              />
              <ul className="max-h-[min(70vh,520px)] space-y-2 overflow-y-auto pr-1">
                {filteredModulePieces.length === 0 ? (
                  <li className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-[12px] text-slate-600">
                    Ninguna pieza coincide con «{pieceFilter.trim()}».
                  </li>
                ) : null}
                {filteredModulePieces.map((p) => {
                  const selected = p.id === selectedPieceId
                  const bulkChecked = bulkSelectedIds.includes(p.id)
                  const finished = Boolean(p.programming_finished_at)
                  const afterPerfilado = pieceAwaitingPostPerfiladoProgramming(p)
                  const pieceActive = intervalRows.some(
                    (r) => r.piece_id === p.id && r.lane === lane && r.ended_at == null,
                  )
                  const pieceSec = pieceLaneElapsedSeconds(intervalRows, p.id, lane, clockNow)
                  return (
                    <li key={p.id}>
                      <div
                        className={[
                          'flex gap-2 rounded-xl border transition',
                          selected || bulkChecked ? palette.pieceSelected : palette.pieceIdle,
                          finished ? 'opacity-80' : '',
                        ].join(' ')}
                      >
                        {canWork ? (
                          <label
                            className="flex shrink-0 cursor-pointer items-center px-2 py-3"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-programacion-400 text-programacion-700"
                              checked={bulkChecked}
                              onChange={() => toggleBulkPiece(p.id)}
                            />
                          </label>
                        ) : null}
                        <button
                          type="button"
                          className="min-w-0 flex-1 px-2 py-3 text-left sm:px-3"
                          onClick={() => setSelectedPieceId(p.id)}
                        >
                          <p className="font-bold text-slate-900">{p.label}</p>
                          <p className={['mt-1 font-mono text-[16px] font-bold tabular-nums', palette.meta].join(' ')}>
                            {formatSecondsAsHms(pieceSec)}
                            {pieceActive ? (
                              <span className="ml-1.5 align-middle text-[10px] font-bold uppercase text-emerald-700">
                                En curso
                              </span>
                            ) : null}
                          </p>
                          <p className={['mt-0.5 text-[10px]', palette.meta].join(' ')}>
                            {afterPerfilado
                              ? 'Tras perfilado'
                              : finished
                                ? 'Terminada'
                                : pieceActive
                                  ? 'Reloj activo'
                                  : 'Pendiente — pulsa Inicio'}
                          </p>
                        </button>
                        {canWork && !finished ? (
                          <div className="flex shrink-0 flex-col justify-center gap-1 py-2 pr-2">
                            {!pieceActive ? (
                              <button
                                type="button"
                                disabled={busy}
                                className="min-h-[36px] rounded-lg bg-programacion-700 px-3 py-1.5 text-[11px] font-bold text-white shadow-sm hover:bg-programacion-800 disabled:opacity-50"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setSelectedPieceId(p.id)
                                  void onProgStart(p)
                                }}
                              >
                                Inicio
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={busy}
                                className="min-h-[36px] rounded-lg bg-programacion-900 px-3 py-1.5 text-[11px] font-bold text-white shadow-sm hover:brightness-110 disabled:opacity-50"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  void onRowFinish(p)
                                }}
                              >
                                Fin
                              </button>
                            )}
                          </div>
                        ) : null}
                      </div>
                    </li>
                  )
                })}
              </ul>
              {canWork && bulkPieces.length > 0 && !showBatchPanel ? (
                <BodegaPieceProgrammingBatchControls
                  compact
                  pieces={bulkPieces}
                  intervals={intervalRows}
                  lane={lane}
                  moduleLabel={moduleLabel}
                  projectFolio={props.projectFolio}
                  canWork={canWork}
                  busy={busy}
                  onDone={() => onBatchProgrammingDone(true)}
                />
              ) : null}
            </div>

            {showBatchPanel ? (
              <div className={['rounded-2xl bg-white p-5 shadow-md sm:p-6', palette.detailBox].join(' ')}>
                <p className="text-[10px] font-bold uppercase text-programacion-600">Varias piezas seleccionadas</p>
                <h4 className="mt-1 text-xl font-bold text-slate-900">
                  {bulkPieces.length} piezas — {moduleLabel}
                </h4>
                <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto text-[12px] text-slate-600">
                  {bulkPieces.map((p) => (
                    <li key={p.id} className="truncate font-medium">
                      {p.label}
                    </li>
                  ))}
                </ul>
                <BodegaPieceProgrammingBatchControls
                  pieces={bulkPieces}
                  intervals={intervalRows}
                  lane={lane}
                  moduleLabel={moduleLabel}
                  projectFolio={props.projectFolio}
                  canWork={canWork}
                  busy={busy}
                  spacious
                  onDone={() => onBatchProgrammingDone(true)}
                />
              </div>
            ) : selectedPiece ? (
              <div className={['rounded-2xl bg-white p-5 shadow-md sm:p-6', palette.detailBox].join(' ')}>
                <p className="text-[10px] font-bold uppercase text-programacion-600">Pieza seleccionada</p>
                <h4 className="mt-1 text-xl font-bold text-slate-900">{selectedPiece.label}</h4>
                {selectedPiece.source_path ? (
                  <p className="mt-1 font-mono text-[12px] text-slate-500">{selectedPiece.source_path}</p>
                ) : null}
                <p className="mt-2 text-[13px] text-slate-600">
                  Acabado: <span className="font-semibold">{selectedPiece.finish_spec ?? '—'}</span>
                </p>
                <p className="mt-3 rounded-xl border border-programacion-200/90 bg-programacion-50/60 px-3 py-3 text-[13px] text-slate-800">
                  Destino: <strong>CNC</strong>
                  <span className="mt-1 block text-[12px] text-slate-600">
                    Lo definió diseño. Si hay un contratiempo, déjalo en comentarios; no se usa tiempo estimado de
                    máquina.
                  </span>
                </p>
                {bulkPieces.length > 1 ? (
                  <p className="mt-4 rounded-xl border border-programacion-200 bg-programacion-50/80 px-4 py-3 text-[12px] leading-relaxed text-programacion-950">
                    Tienes <strong>{bulkPieces.length} piezas</strong> marcadas a la izquierda. Usa{' '}
                    <strong>Fin masivo</strong> con un solo archivo (panel de lote arriba o a la derecha) en lugar de
                    subir el mismo NC pieza por pieza.
                  </p>
                ) : null}
                <div className="mt-5">
                  <BodegaPieceProgrammingControls
                    piece={selectedPiece}
                    lane={lane}
                    moduleLabel={moduleLabel}
                    minutes={minsByPiece.get(selectedPiece.id) ?? 0}
                    intervals={intervalRows}
                    canWork={canWork}
                    busy={busy}
                    spacious
                    onStart={() => onProgStart(selectedPiece)}
                    onFinish={(kind, file) => onProgFinish(selectedPiece, kind, file)}
                    onReplaceFile={(file) => onReplaceFile(selectedPiece, file)}
                  />
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </>
  )

  if (embedded) return inner

  return (
    <section className={[seccion, spacious ? 'min-h-0' : ''].join(' ')}>
      {inner}
    </section>
  )
}
