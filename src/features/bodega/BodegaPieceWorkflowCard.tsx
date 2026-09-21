import { useEffect, useState, type DragEvent } from 'react'
import {
  pieceEligibleForProjectPhotos,
  photosForPiece,
} from '../../lib/bodegaPiecePhotosFlow'
import type { BodegaProjectPieceRow, ProgrammerBucket } from '../../lib/bodegaPiecesRepo'
import { PIECE_FINISH_SPEC_LABELS } from '../../lib/bodegaPiecesRepo'
import { canReassignProgrammerCncTorno } from '../../lib/bodegaProgrammerFlow'
import { pieceNeedsSecondProgrammingSession } from '../../lib/bodegaPostPerfiladoProgramming'
import { pieceNeedsMaquinado } from '../../lib/bodegaProjectPipelineProgress'
import type { ProjectPiecePhotoRow } from '../../lib/piecePhotosRepo'
import { createSignedUrlForPiecePhoto } from '../../lib/piecePhotosRepo'
import { labelFromZipPath } from '../../lib/zipDesignPackage'
import { BodegaPiecePlanoAttach } from './BodegaPiecePlanoAttach.tsx'
import { programmingExitLabelEs } from './BodegaPieceProgrammingControls.tsx'


const BUCKET_META: Record<
  ProgrammerBucket,
  { label: string; badge: string; active: string; idle: string }
> = {
  cnc: {
    label: 'CNC',
    badge: 'bg-programacion-600 text-white',
    active: 'bg-programacion-600 text-white shadow-sm',
    idle: 'border border-programacion-200 bg-programacion-50 text-programacion-950 hover:bg-programacion-100',
  },
  torno: {
    label: 'Torno',
    badge: 'bg-programacion-800 text-white',
    active: 'bg-programacion-800 text-white shadow-sm',
    idle: 'border border-programacion-300 bg-programacion-100 text-programacion-950 hover:bg-programacion-200/80',
  },
  perfilado: {
    label: 'Perfilado',
    badge: 'bg-fuchsia-700 text-white',
    active: 'bg-fuchsia-700 text-white shadow-sm',
    idle: 'border border-fuchsia-200 bg-fuchsia-50 text-fuchsia-950 hover:bg-fuchsia-100',
  },
  accesorios: {
    label: 'Accesorios',
    badge: 'bg-slate-600 text-white',
    active: 'bg-slate-600 text-white shadow-sm',
    idle: 'border border-slate-300 bg-slate-50 text-slate-900 hover:bg-slate-100',
  },
}

type Stage = { id: string; label: string; done: boolean; hint?: string; skip?: boolean }

function pieceSkipsTallerStages(piece: BodegaProjectPieceRow): boolean {
  return (
    piece.programmer_bucket === 'torno' ||
    piece.programmer_bucket === 'perfilado' ||
    piece.programmer_bucket === 'accesorios'
  )
}

function pieceStages(piece: BodegaProjectPieceRow, hasPhoto: boolean): Stage[] {
  // Torno / perfilado / accesorios: sin tiempo ni proceso de taller → completo al dirigirse.
  if (pieceSkipsTallerStages(piece)) {
    const destino =
      piece.programmer_bucket === 'torno'
        ? 'Torno'
        : piece.programmer_bucket === 'perfilado'
          ? 'Perfilado'
          : 'Accesorios'
    return [
      {
        id: 'destino',
        label: destino,
        done: true,
        hint: 'Sin tiempo',
      },
      {
        id: 'foto',
        label: 'Foto',
        done: hasPhoto,
        hint: hasPhoto ? undefined : 'Pendiente',
      },
    ]
  }

  // CNC: el cierre de programación define la ruta (→ Perfilado vs archivo → Maquinado).
  const exit = piece.programming_exit_kind
  const wentToPerfilado =
    exit === 'a_perfilado' || Boolean(piece.perfilado_completed_at) || Boolean(piece.post_perfilado_programming_bucket)
  const skippedPerfilado = exit === 'archivo_adjunto' && !wentToPerfilado
  const needsMaq = pieceNeedsMaquinado(piece)

  let perfiladoDone = Boolean(piece.perfilado_completed_at)
  let perfiladoHint: string | undefined
  if (skippedPerfilado) {
    perfiladoDone = true
    perfiladoHint = 'No aplica'
  } else if (perfiladoDone && piece.post_perfilado_programming_bucket && !piece.programming_finished_at) {
    perfiladoHint = `→ ${piece.post_perfilado_programming_bucket === 'torno' ? 'Torno' : 'CNC'}`
  } else if (exit === 'a_perfilado' && !perfiladoDone) {
    perfiladoHint = 'En taller'
  }

  let maquinadoDone = Boolean(piece.maquinado_completed_at)
  let maquinadoHint: string | undefined
  if (!needsMaq) {
    // Terminé → Perfilado (u otra ruta sin archivo CNC): maquinado no aplica.
    maquinadoDone = true
    maquinadoHint = exit === 'a_perfilado' ? 'No aplica' : piece.programming_finished_at ? 'No aplica' : undefined
    // Si aún no terminó programación, no marcar maquinado como listo con "No aplica".
    if (!piece.programming_finished_at && exit == null) {
      maquinadoDone = false
      maquinadoHint = undefined
    }
  }

  const stages: Stage[] = [
    { id: 'perfilado', label: 'Perfilado', done: perfiladoDone, hint: perfiladoHint },
    { id: 'maquinado', label: 'Maquinado', done: maquinadoDone, hint: maquinadoHint },
    { id: 'armado', label: 'Armado', done: Boolean(piece.armado_completed_at) },
    { id: 'detallado', label: 'Detallado', done: Boolean(piece.detallado_completed_at) },
  ]
  // Tras detallado (o si ya es elegible), la foto de cierre es la etapa que falta.
  if (pieceEligibleForProjectPhotos(piece)) {
    stages.push({
      id: 'foto',
      label: 'Foto',
      done: hasPhoto,
      hint: hasPhoto ? undefined : 'Cierre',
    })
  }
  return stages
}

function PiecePhotoThumb(props: { path: string; name: string }) {
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
      <img src={url} alt={props.name} className="h-20 w-full object-cover" />
    </a>
  )
}

function StageProgress({ stages }: { stages: Stage[] }) {
  const doneCount = stages.filter((s) => s.done).length
  const pct = stages.length ? Math.round((doneCount / stages.length) * 100) : 0
  const allDone = stages.length > 0 && doneCount === stages.length

  return (
    <div className="rounded-xl border border-slate-200/90 bg-slate-50/80 px-3 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Avance en taller</p>
        <span
          className={[
            'font-mono text-[11px] font-bold',
            allDone ? 'text-emerald-700' : 'text-slate-700',
          ].join(' ')}
        >
          {allDone ? 'Completo' : `${pct}%`}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div
        className={[
          'mt-3 grid gap-2',
          stages.length <= 2
            ? 'grid-cols-2'
            : stages.length === 5
              ? 'grid-cols-2 sm:grid-cols-5'
              : 'grid-cols-2 sm:grid-cols-4',
        ].join(' ')}
      >
        {stages.map((s) => (
          <div
            key={s.id}
            className={[
              'rounded-lg border px-2 py-1.5 text-center',
              s.done ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white',
            ].join(' ')}
          >
            <p
              className={[
                'text-[10px] font-bold uppercase tracking-wide',
                s.done ? 'text-emerald-800' : 'text-slate-500',
              ].join(' ')}
            >
              {s.label}
            </p>
            <p className={['mt-0.5 text-[11px] font-semibold', s.done ? 'text-emerald-900' : 'text-slate-600'].join(' ')}>
              {s.done ? 'Completo' : 'Pendiente'}
              {s.hint ? <span className="block font-normal text-emerald-800/90">{s.hint}</span> : null}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

export type BodegaPieceWorkflowCardProps = {
  piece: BodegaProjectPieceRow
  projectFolio: string
  designZipPaths: string[]
  canAttachPlano: boolean
  routesLocked: boolean
  canEditRoute: boolean
  canEditPath: boolean
  showRoutePicker: boolean
  busy: boolean
  dragOver: boolean
  photos: ProjectPiecePhotoRow[]
  canUploadPhotos: boolean
  photoUploadBusy: boolean
  onUploadPhotos: (pieceId: string, files: File[]) => void | Promise<void>
  pathDraft?: string
  onPathDraftChange?: (value: string) => void
  onSavePath?: () => void
  onClearPath?: () => void
  onDragOver: (e: DragEvent) => void
  onDragLeave: () => void
  onDrop: (e: DragEvent) => void
  onSetBucket: (bucket: ProgrammerBucket) => void
  onReload: () => void | Promise<void>
}

export function BodegaPieceWorkflowCard(props: BodegaPieceWorkflowCardProps) {
  const p = props.piece
  const bucket = p.programmer_bucket
  const bucketMeta = bucket ? BUCKET_META[bucket] : null
  const piecePhotos = photosForPiece(props.photos, p.id)
  const hasPhoto = piecePhotos.length > 0
  const showPhotoSection = pieceEligibleForProjectPhotos(p)
  const stages = pieceStages(p, hasPhoto)
  const pathLabel = p.source_path ? labelFromZipPath(p.source_path) : null
  const finishLabel = p.finish_spec ? PIECE_FINISH_SPEC_LABELS[p.finish_spec] : null
  const progDone = Boolean(p.programming_finished_at)
  // Solo CNC se programa; torno/perfilado/accesorios no llevan tiempo de oficina.
  const showProgBlock = props.routesLocked && bucket === 'cnc'

  return (
    <article
      className={[
        'overflow-hidden rounded-2xl border bg-white shadow-sm ring-1 transition-shadow',
        props.dragOver
          ? 'border-sky-400 ring-sky-300/60 shadow-md'
          : 'border-slate-200/90 ring-slate-900/[0.03] hover:shadow-md',
      ].join(' ')}
      onDragOver={props.onDragOver}
      onDragLeave={props.onDragLeave}
      onDrop={props.onDrop}
    >
      <header className="border-b border-slate-100 bg-gradient-to-r from-slate-50/90 to-white px-4 py-3.5 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h4 className="truncate text-[16px] font-bold tracking-tight text-slate-900" title={p.label}>
              {p.label}
            </h4>
            {pathLabel ? (
              <p className="mt-1 truncate font-mono text-[11px] text-slate-500" title={p.source_path ?? undefined}>
                {pathLabel}
              </p>
            ) : (
              <p className="mt-1 text-[12px] text-amber-800">Sin ruta en el ZIP de diseño</p>
            )}
          </div>
          <div className="flex flex-wrap justify-end gap-1.5">
            {bucketMeta ? (
              <span
                className={[
                  'inline-flex rounded-lg px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide',
                  bucketMeta.badge,
                ].join(' ')}
              >
                {bucketMeta.label}
              </span>
            ) : (
              <span className="inline-flex rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-900">
                Sin ruta
              </span>
            )}
            {finishLabel ? (
              <span className="inline-flex rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-900">
                {finishLabel}
              </span>
            ) : null}
            {p.programming_exit_kind ? (
              <span className="inline-flex max-w-[12rem] truncate rounded-lg border border-slate-200 bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-700">
                {programmingExitLabelEs(p.programming_exit_kind)}
              </span>
            ) : null}
          </div>
        </div>
      </header>

      <div className="space-y-4 px-4 py-4 sm:px-5">
        <StageProgress stages={stages} />

        {showPhotoSection ? (
          <div
            className={[
              'rounded-xl border px-3.5 py-3',
              hasPhoto
                ? 'border-emerald-200 bg-emerald-50/70'
                : 'border-amber-200 bg-amber-50/60',
            ].join(' ')}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-600">
                  Foto de esta pieza
                </p>
                <p className="mt-0.5 text-[13px] font-semibold text-slate-900">
                  {hasPhoto
                    ? `${piecePhotos.length} foto${piecePhotos.length === 1 ? '' : 's'} · ${p.label}`
                    : `Falta foto · ${p.label}`}
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
                  {pieceSkipsTallerStages(p)
                    ? 'Esta pieza no lleva taller: sube la evidencia aquí para el cierre.'
                    : 'Detallado terminado — sube la foto de cierre de esta pieza.'}
                </p>
              </div>
              <span
                className={[
                  'inline-flex rounded-lg px-2 py-1 text-[10px] font-bold uppercase tracking-wide',
                  hasPhoto ? 'bg-emerald-600 text-white' : 'bg-amber-600 text-white',
                ].join(' ')}
              >
                {hasPhoto ? 'Con foto' : 'Sin foto'}
              </span>
            </div>

            {props.canUploadPhotos ? (
              <label
                className={[
                  'mt-3 flex min-h-[72px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-3 py-4 text-center transition',
                  props.photoUploadBusy || props.busy
                    ? 'pointer-events-none border-slate-200 bg-slate-100 opacity-60'
                    : 'border-slate-300 bg-white hover:border-section-navy/40 hover:bg-sky-50/50',
                ].join(' ')}
              >
                <span className="text-[13px] font-semibold text-slate-900">
                  {props.photoUploadBusy ? 'Subiendo…' : 'Elegir imagen(es) para esta pieza'}
                </span>
                <span className="mt-0.5 text-[11px] text-slate-500">JPG, PNG, WEBP — se guardan en {p.label}</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  disabled={props.photoUploadBusy || props.busy}
                  onChange={(e) => {
                    const batch = e.target.files ? Array.from(e.target.files) : []
                    e.currentTarget.value = ''
                    if (batch.length > 0) void props.onUploadPhotos(p.id, batch)
                  }}
                />
              </label>
            ) : null}

            {piecePhotos.length > 0 ? (
              <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {piecePhotos.map((ph) => (
                  <PiecePhotoThumb key={ph.id} path={ph.storage_path} name={ph.filename} />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="rounded-xl border border-sky-100 bg-sky-50/50 px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-sky-900">Plano PDF</p>
          <div className="mt-1.5">
            <BodegaPiecePlanoAttach
              piece={p}
              projectFolio={props.projectFolio}
              designZipPaths={props.designZipPaths}
              canEdit={props.canAttachPlano}
              compact
              onUpdated={props.onReload}
            />
          </div>
        </div>

        {showProgBlock ? (
          <div
            className={[
              'rounded-xl border px-3.5 py-3',
              progDone
                ? 'border-emerald-200 bg-emerald-50/80'
                : 'border-programacion-200 bg-programacion-50/60',
            ].join(' ')}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={[
                  'inline-flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-bold',
                  progDone ? 'bg-emerald-600 text-white' : 'bg-programacion-200 text-programacion-900',
                ].join(' ')}
                aria-hidden
              >
                {progDone ? '✓' : '…'}
              </span>
              <p className="text-[13px] font-semibold text-slate-900">
                Programación {progDone ? 'terminada' : 'pendiente'}
                {progDone && p.programming_exit_kind ? (
                  <span className="font-normal text-slate-600">
                    {' '}
                    — {programmingExitLabelEs(p.programming_exit_kind)}
                  </span>
                ) : null}
              </p>
            </div>
            {p.programming_file_name ? (
              <p className="mt-1.5 truncate pl-8 font-mono text-[11px] text-slate-600" title={p.programming_file_name}>
                Archivo: {p.programming_file_name}
              </p>
            ) : null}
            {(!progDone || pieceNeedsSecondProgrammingSession(p)) && props.canEditRoute ? (
              <p className="mt-2 pl-8 text-[12px] leading-relaxed text-programacion-900/90">
                {pieceNeedsSecondProgrammingSession(p)
                  ? `Continúa en pestaña ${p.post_perfilado_programming_bucket === 'torno' ? 'Torno' : 'CNC'} (2ª programación).`
                  : 'Inicia y termina en la pestaña CNC o Torno.'}
              </p>
            ) : null}
          </div>
        ) : null}

        {props.canEditPath ? (
          <div className="rounded-xl border border-dashed border-sky-300/80 bg-sky-50/40 px-3 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-sky-900">Ruta en ZIP de diseño</p>
            <p className="mt-1 text-[11px] text-sky-900/80">Arrastra una entrada del diseño o escribe la ruta interna.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <input
                type="text"
                value={props.pathDraft ?? ''}
                onChange={(e) => props.onPathDraftChange?.(e.target.value)}
                placeholder="Ruta interna del archivo…"
                disabled={props.busy}
                className="min-w-[180px] flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 font-mono text-[11px] text-slate-900 shadow-sm"
              />
              <button
                type="button"
                disabled={props.busy}
                className="rounded-lg bg-sky-700 px-3 py-2 text-[11px] font-bold text-white shadow-sm disabled:opacity-50"
                onClick={() => props.onSavePath?.()}
              >
                Guardar
              </button>
              {p.source_path ? (
                <button
                  type="button"
                  disabled={props.busy}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-[11px] font-semibold text-slate-700"
                  onClick={() => props.onClearPath?.()}
                >
                  Quitar
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {props.showRoutePicker ? (
          <div className="rounded-xl border border-slate-200/90 bg-slate-50/60 px-3 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-600">
              {props.routesLocked ? 'Destino de máquina' : 'Asignar destino'}
            </p>
            <p className="mt-1 text-[11px] text-slate-600">
              {props.routesLocked
                ? 'Solo puedes corregir entre CNC y Torno si la pieza aún no avanzó.'
                : 'Elige CNC, Torno, Perfilado o Accesorios (sin proceso de manufactura).'}
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {(['cnc', 'torno', 'perfilado', 'accesorios'] as const)
                .filter((b) => !props.routesLocked || b === 'cnc' || b === 'torno')
                .map((b) => {
                  const meta = BUCKET_META[b]
                  const lockedBlocked = props.routesLocked && !canReassignProgrammerCncTorno(p)
                  const active = bucket === b
                  return (
                    <button
                      key={b}
                      type="button"
                      disabled={props.busy || lockedBlocked}
                      title={
                        lockedBlocked
                          ? 'No se puede cambiar: la pieza ya avanzó o hay tiempo abierto'
                          : undefined
                      }
                      className={[
                        'min-h-[36px] rounded-xl px-4 py-2 text-[12px] font-bold uppercase tracking-wide transition',
                        active ? meta.active : meta.idle,
                        lockedBlocked ? 'cursor-not-allowed opacity-50' : '',
                      ].join(' ')}
                      onClick={() => props.onSetBucket(b)}
                    >
                      {meta.label}
                    </button>
                  )
                })}
            </div>
          </div>
        ) : null}
      </div>
    </article>
  )
}
