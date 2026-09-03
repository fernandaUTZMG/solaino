import { useEffect, useMemo, useState } from 'react'
import { bodegaPiecePhotosSupportsPieceId, BODEGA_PIECE_PHOTOS_PIECE_ID_PATCH } from '../../lib/bodegaPiecesSchema'
import type { BodegaProjectPieceRow } from '../../lib/bodegaPiecesRepo'
import {
  canSupervisorFinalizeWithPiecePhotos,
  computeProjectPieceClosureProgress,
  pieceEligibleForProjectPhotos,
  photosForPiece,
} from '../../lib/bodegaPiecePhotosFlow'
import { filterPieceRowsBySearch } from '../../lib/bodegaPieceQueueSearch'
import { pieceStageOriginLabel, pieceStageOriginTone } from '../../lib/bodegaPieceStageFlow'
import type { ProjectPiecePhotoRow } from '../../lib/piecePhotosRepo'
import { createSignedUrlForPiecePhoto } from '../../lib/piecePhotosRepo'
import { fotosUi } from './bodegaFotosUi.ts'
import { useBodegaPieceQueueBulk } from './useBodegaPieceQueueBulk.ts'

function PhotoThumb(props: { path: string; name: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    void createSignedUrlForPiecePhoto(props.path).then((u) => {
      if (!cancelled) setUrl(u)
    })
    return () => {
      cancelled = true
    }
  }, [props.path])
  if (!url) {
    return (
      <div className="flex aspect-square items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-[11px] text-slate-500">
        …
      </div>
    )
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="block overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
      title={props.name}
    >
      <img src={url} alt={props.name} className="h-24 w-full object-cover sm:h-28" />
    </a>
  )
}

type Props = {
  pieces: BodegaProjectPieceRow[]
  photos: ProjectPiecePhotoRow[]
  loading: boolean
  canUpload: boolean
  canFinalize: boolean
  projectFinalized: boolean
  projectFinalizedAt?: string | null
  uploadBusy: boolean
  finalizeBusy: boolean
  onUpload: (pieceId: string, files: File[]) => Promise<void>
  onBatchUpload?: (pieceIds: string[], files: File[]) => Promise<void>
  onFinalize: () => Promise<void>
}

export function BodegaProjectPiecePhotosWorkspace(props: Props) {
  const eligible = useMemo(
    () => props.pieces.filter(pieceEligibleForProjectPhotos),
    [props.pieces],
  )
  const progress = useMemo(
    () => computeProjectPieceClosureProgress(props.pieces, props.photos),
    [props.pieces, props.photos],
  )
  const canFinalize = canSupervisorFinalizeWithPiecePhotos({
    pieces: props.pieces,
    photos: props.photos,
    alreadyFinalized: props.projectFinalized,
  })

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pieceIdColumnOk, setPieceIdColumnOk] = useState<boolean | null>(null)
  const [batchNotice, setBatchNotice] = useState<string | null>(null)

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
  } = useBodegaPieceQueueBulk(eligible, filterPieceRowsBySearch)

  useEffect(() => {
    let cancelled = false
    void bodegaPiecePhotosSupportsPieceId().then((ok) => {
      if (!cancelled) setPieceIdColumnOk(ok)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (eligible.length === 0) {
      setSelectedId(null)
      return
    }
    if (!selectedId || !eligible.some((p) => p.id === selectedId)) {
      setSelectedId(eligible[0]!.id)
    }
  }, [eligible, selectedId])

  const selected = eligible.find((p) => p.id === selectedId) ?? null
  const selectedPhotos = selected ? photosForPiece(props.photos, selected.id) : []

  async function runBatchPhotoUpload(files: File[]) {
    const ids = bulkPieces.map((p) => p.id)
    if (ids.length === 0 || files.length === 0) return
    if (props.onBatchUpload) {
      await props.onBatchUpload(ids, files)
    } else {
      for (const id of ids) {
        await props.onUpload(id, files)
      }
    }
    clearBulkSelection()
    if (ids.length > 1) {
      setBatchNotice(`Fotos enviadas a ${ids.length} piezas.`)
    } else {
      setBatchNotice(null)
    }
  }

  return (
    <section className={fotosUi.section}>
      <header className={fotosUi.header}>
        <p className={fotosUi.headerKicker}>Paso 10 — Cierre del proyecto</p>
        <h3 className={fotosUi.headerTitle}>Fotos por pieza</h3>
        <p className={fotosUi.headerBody}>
          Cada pieza con <strong className="text-white">detallado terminado</strong> debe tener al menos una foto.
          El <strong className="text-white">supervisor</strong> finaliza el proyecto cuando todas las piezas tengan
          evidencia.
        </p>
        <p className="mt-3 text-[13px] font-semibold text-emerald-100">
          Detallado: {progress.detalladoDone} / {progress.totalPieces} piezas · Fotos: {progress.withPhoto} /{' '}
          {progress.totalPieces}
        </p>
      </header>

      <div className="space-y-4 px-4 py-5 sm:px-5">
        {pieceIdColumnOk === false ? (
          <div
            className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] leading-relaxed text-amber-950"
            role="alert"
          >
            <p className="font-bold">Falta migración en Supabase</p>
            <p className="mt-1">
              La tabla <code className="rounded bg-amber-100 px-1">project_piece_photos</code> no tiene la columna{' '}
              <code className="rounded bg-amber-100 px-1">piece_id</code>. Ejecuta en el SQL Editor el archivo{' '}
              <code className="rounded bg-amber-100 px-1">{BODEGA_PIECE_PHOTOS_PIECE_ID_PATCH}</code> y recarga el
              esquema API (Settings → API → Reload schema).
            </p>
          </div>
        ) : null}

        <div className={fotosUi.flowCard}>
          <p className={fotosUi.flowTitle}>Flujo</p>
          <ol className={`${fotosUi.flowText} mt-2 list-decimal space-y-1 pl-5`}>
            <li>Termina detallado de cada pieza en <strong>Taller → Detallado</strong>.</li>
            <li>Elige una o varias piezas (buscador y casillas) y sube las imágenes.</li>
            <li>Piezas iguales: mismas fotos en lote a todas las seleccionadas.</li>
            <li>Repite hasta que todas las piezas tengan foto.</li>
            <li>El supervisor pulsa <strong>Finalizar proyecto</strong>.</li>
          </ol>
        </div>

        {props.projectFinalized ? (
          <div className="rounded-xl border border-emerald-300 bg-emerald-100 px-4 py-3 text-[13px] text-emerald-950">
            Proyecto finalizado
            {props.projectFinalizedAt ? ` · ${props.projectFinalizedAt.slice(0, 16)}` : ''}.
          </div>
        ) : null}

        {props.loading ? (
          <div className="rounded-2xl border bg-white px-6 py-14 text-center text-[14px] text-slate-600">
            Cargando…
          </div>
        ) : props.pieces.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-emerald-300 bg-emerald-50/50 px-6 py-14 text-center">
            <p className="text-[16px] font-bold text-emerald-950">Sin piezas en el proyecto</p>
            <p className="mx-auto mt-2 max-w-md text-[13px] text-emerald-900/80">
              Registra las piezas del diseño en la pestaña <strong>Piezas</strong> antes del cierre.
            </p>
          </div>
        ) : eligible.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50/50 px-6 py-14 text-center">
            <p className="text-[16px] font-bold text-amber-950">Ninguna pieza con detallado listo</p>
            <p className="mx-auto mt-2 max-w-md text-[13px] text-amber-900/80">
              Termina <strong>detallado</strong> de las {progress.totalPieces} pieza(s) en{' '}
              <strong>Taller → Detallado</strong>. El cierre solo aplica cuando todas estén listas.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-6">
            <section className={fotosUi.listSection}>
              <div className={fotosUi.listHeader}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-900/75">
                    1. Elige pieza(s)
                  </p>
                  {props.canUpload && !props.projectFinalized ? (
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        className="rounded-lg border border-emerald-400 bg-white px-2 py-1 text-[10px] font-bold text-emerald-900 hover:bg-emerald-50 disabled:opacity-50"
                        disabled={filteredVisible.length === 0}
                        onClick={selectAllVisiblePieces}
                      >
                        Seleccionar visibles
                      </button>
                      {bulkSelectedIds.length > 0 ? (
                        <button
                          type="button"
                          className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[10px] font-bold text-slate-700 hover:bg-slate-50"
                          onClick={() => {
                            clearBulkSelection()
                            setBatchNotice(null)
                          }}
                        >
                          Limpiar ({bulkSelectedIds.length})
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <p className="text-[13px] text-emerald-950/80">
                  {pieceFilter.trim()
                    ? `${filteredVisible.length} de ${eligible.length}`
                    : eligible.length}{' '}
                  con detallado listo · {progress.totalPieces - progress.detalladoDone} pendiente(s)
                  {bulkSelectedIds.length > 0 ? (
                    <span className="font-semibold"> · {bulkSelectedIds.length} seleccionada(s)</span>
                  ) : null}
                </p>
              </div>
              <input
                type="search"
                value={pieceFilter}
                onChange={(e) => setPieceFilter(e.target.value)}
                placeholder="Buscar pieza (ej. base, nombre)…"
                className="mx-4 mb-2 w-[calc(100%-2rem)] rounded-xl border border-emerald-200 px-3 py-2 text-[13px] shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200/60 sm:mx-5"
                autoComplete="off"
              />
              <ul className="max-h-[min(480px,55vh)] divide-y divide-emerald-100 overflow-y-auto">
                {filteredVisible.length === 0 ? (
                  <li className="px-4 py-6 text-center text-[12px] text-slate-600 sm:px-5">
                    {eligible.length === 0
                      ? 'Sin piezas.'
                      : `Ninguna coincide con «${pieceFilter.trim()}».`}
                  </li>
                ) : null}
                {filteredVisible.map((p) => {
                  const count = photosForPiece(props.photos, p.id).length
                  const selectedRow = p.id === selectedId
                  const bulkChecked = bulkSelectedIds.includes(p.id)
                  return (
                    <li key={p.id}>
                      <div
                        className={[
                          'flex gap-1',
                          selectedRow || bulkChecked ? fotosUi.listSelected : '',
                        ].join(' ')}
                      >
                        {props.canUpload && !props.projectFinalized ? (
                          <label
                            className="flex shrink-0 cursor-pointer items-center px-3 py-3.5 sm:px-4"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-emerald-500 text-emerald-700"
                              checked={bulkChecked}
                              onChange={() => toggleBulkPiece(p.id)}
                            />
                          </label>
                        ) : null}
                        <button
                          type="button"
                          className={[
                            'flex min-w-0 flex-1 flex-col gap-1 py-3.5 pr-4 text-left transition sm:pr-5',
                            !selectedRow && !bulkChecked ? fotosUi.listHover : '',
                          ].join(' ')}
                          onClick={() => setSelectedId(p.id)}
                        >
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={[
                              'rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase',
                              pieceStageOriginTone(p),
                            ].join(' ')}
                          >
                            {pieceStageOriginLabel(p)}
                          </span>
                          <span
                            className={[
                              'rounded-full px-2 py-0.5 text-[10px] font-bold',
                              count > 0 ? 'bg-emerald-200 text-emerald-900' : 'bg-amber-100 text-amber-900',
                            ].join(' ')}
                          >
                            {count > 0 ? `${count} foto${count === 1 ? '' : 's'}` : 'Sin foto'}
                          </span>
                        </div>
                        <span className="truncate text-[14px] font-bold text-slate-900">{p.label}</span>
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
              {bulkPieces.length > 0 && !showBatchPanel && props.canUpload && !props.projectFinalized ? (
                <div className="border-t border-emerald-100 px-4 py-3 sm:px-5">
                  <PhotosBatchUploadPanel
                    compact
                    pieceCount={bulkPieces.length}
                    uploadBusy={props.uploadBusy}
                    onUpload={(files) => void runBatchPhotoUpload(files)}
                  />
                </div>
              ) : null}
            </section>

            <section className="min-w-0 space-y-4">
              {batchNotice ? (
                <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[12px] text-emerald-950">
                  {batchNotice}
                </p>
              ) : null}
              {showBatchPanel && props.canUpload && !props.projectFinalized ? (
                <div className={fotosUi.panel}>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-900/70">
                    Varias piezas seleccionadas
                  </p>
                  <p className="mt-1 text-[16px] font-bold text-slate-900">{bulkPieces.length} piezas</p>
                  <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-[12px] text-slate-600">
                    {bulkPieces.map((p) => (
                      <li key={p.id} className="truncate font-medium">
                        {p.label}
                      </li>
                    ))}
                  </ul>
                  <PhotosBatchUploadPanel
                    pieceCount={bulkPieces.length}
                    uploadBusy={props.uploadBusy}
                    onUpload={(files) => void runBatchPhotoUpload(files)}
                  />
                </div>
              ) : selected ? (
                <>
                  {bulkPieces.length > 1 ? (
                    <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[12px] leading-relaxed text-emerald-950">
                      Tienes <strong>{bulkPieces.length} piezas</strong> marcadas — usa el panel de lote para subir las
                      mismas fotos a todas.
                    </p>
                  ) : null}
                <div className={fotosUi.panel}>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-900/70">
                    2. Fotos de la pieza
                  </p>
                  <p className="mt-1 text-[16px] font-bold text-slate-900">{selected.label}</p>
                  <p className="mt-1 text-[12px] text-slate-600">Origen: {pieceStageOriginLabel(selected)}</p>

                  {props.canUpload && !props.projectFinalized ? (
                    <label className={`mt-4 ${fotosUi.uploadZone}`}>
                      <span className="text-[14px] font-semibold text-emerald-950">
                        {props.uploadBusy ? 'Subiendo…' : 'Elegir imágenes para esta pieza'}
                      </span>
                      <span className="mt-1 text-[12px] text-emerald-900/70">JPG, PNG, WEBP, etc.</span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        disabled={props.uploadBusy}
                        onChange={(e) => {
                          const batch = e.target.files ? Array.from(e.target.files) : []
                          e.currentTarget.value = ''
                          if (batch.length > 0) void props.onUpload(selected.id, batch)
                        }}
                      />
                    </label>
                  ) : null}

                  {selectedPhotos.length > 0 ? (
                    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {selectedPhotos.map((ph) => (
                        <PhotoThumb key={ph.id} path={ph.storage_path} name={ph.filename} />
                      ))}
                    </div>
                  ) : (
                    <p className="mt-4 text-[13px] text-slate-500">Esta pieza aún no tiene fotos.</p>
                  )}
                </div>
                </>
              ) : null}

              {props.canFinalize ? (
                <div className={fotosUi.finalizeBox}>
                  <p className="text-[15px] font-bold text-emerald-950">Finalizar proyecto (supervisor)</p>
                  <p className="mt-2 text-[13px] leading-relaxed text-emerald-950/85">
                    Requiere las <strong>{progress.totalPieces}</strong> piezas con detallado terminado y al menos una
                    foto cada una (detallado {progress.detalladoDone}/{progress.totalPieces} · fotos{' '}
                    {progress.withPhoto}/{progress.totalPieces}).
                  </p>
                  <button
                    type="button"
                    disabled={props.finalizeBusy || !canFinalize}
                    title={
                      !canFinalize
                        ? progress.detalladoDone < progress.totalPieces
                          ? `Faltan ${progress.totalPieces - progress.detalladoDone} pieza(s) por terminar detallado`
                          : `Faltan fotos en ${progress.totalPieces - progress.withPhoto} pieza(s)`
                        : undefined
                    }
                    className={[
                      'mt-4 min-h-[52px] w-full rounded-xl px-5 py-3 text-[15px] font-bold disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto',
                      fotosUi.btnFinalize,
                    ].join(' ')}
                    onClick={() => void props.onFinalize()}
                  >
                    {props.finalizeBusy ? 'Finalizando…' : 'Finalizar proyecto'}
                  </button>
                </div>
              ) : null}
            </section>
          </div>
        )}
      </div>
    </section>
  )
}

function PhotosBatchUploadPanel(props: {
  pieceCount: number
  uploadBusy: boolean
  compact?: boolean
  onUpload: (files: File[]) => void
}) {
  const compact = props.compact ?? false
  return (
    <div
      className={[
        'rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50/50',
        compact ? 'p-2.5' : 'mt-4 p-4',
      ].join(' ')}
    >
      <p className={['font-bold uppercase text-emerald-900', compact ? 'text-[10px]' : 'text-[11px]'].join(' ')}>
        Mismas fotos — {props.pieceCount} pieza{props.pieceCount === 1 ? '' : 's'}
      </p>
      <p className={['mt-1 text-emerald-950/80', compact ? 'text-[10px]' : 'text-[12px]'].join(' ')}>
        Las imágenes se guardan en cada pieza seleccionada (copia por pieza).
      </p>
      <label
        className={[
          fotosUi.uploadZone,
          compact ? 'mt-2 min-h-[88px] py-4' : 'mt-3',
          props.uploadBusy ? 'pointer-events-none opacity-60' : '',
        ].join(' ')}
      >
        <span className="text-[13px] font-semibold text-emerald-950">
          {props.uploadBusy ? 'Subiendo…' : 'Elegir imágenes para las piezas seleccionadas'}
        </span>
        <span className="mt-1 text-[11px] text-emerald-900/70">JPG, PNG, WEBP — varias a la vez</span>
        <input
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          disabled={props.uploadBusy}
          onChange={(e) => {
            const batch = e.target.files ? Array.from(e.target.files) : []
            e.currentTarget.value = ''
            if (batch.length > 0) props.onUpload(batch)
          }}
        />
      </label>
    </div>
  )
}
