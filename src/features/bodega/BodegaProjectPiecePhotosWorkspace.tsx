import { useEffect, useState } from 'react'
import { bodegaPiecePhotosSupportsPieceId, BODEGA_PIECE_PHOTOS_PIECE_ID_PATCH } from '../../lib/bodegaPiecesSchema'
import type { BodegaProjectPieceRow } from '../../lib/bodegaPiecesRepo'
import type { ProjectPiecePhotoRow } from '../../lib/piecePhotosRepo'
import { createSignedUrlForPiecePhoto } from '../../lib/piecePhotosRepo'
import { fotosUi } from './bodegaFotosUi.ts'

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
  onUploadArmado: (files: File[]) => Promise<void>
  onReplaceArmado: (photo: ProjectPiecePhotoRow, file: File) => Promise<void>
  onRemoveArmado: (photo: ProjectPiecePhotoRow) => Promise<void>
  /** El reloj de armado del proyecto ya se cerró, o el proyecto de otro proveedor ya está en foto. */
  armadoCerrado: boolean
  /** Otro proveedor: el diseño ya se entregó y el cierre es manual. */
  cierreExterno: boolean
  onFinalize: (opts?: { sinFoto?: boolean; nota?: string }) => Promise<void>
}

export function BodegaProjectPiecePhotosWorkspace(props: Props) {
  const [pieceIdColumnOk, setPieceIdColumnOk] = useState<boolean | null>(null)
  const armadoPhotos = props.photos.filter((ph) => ph.piece_id == null)

  useEffect(() => {
    let cancelled = false
    void bodegaPiecePhotosSupportsPieceId().then((ok) => {
      if (!cancelled) setPieceIdColumnOk(ok)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section className={fotosUi.section}>
      <header className={fotosUi.header}>
        <p className={fotosUi.headerKicker}>Cierre del proyecto</p>
        <h3 className={fotosUi.headerTitle}>Foto del armado</h3>
        <p className={fotosUi.headerBody}>
          {props.cierreExterno
            ? 'El diseño de Solaino ya está entregado. Este proyecto lo sigue otro proveedor y se queda aquí hasta que el encargado o el admin lo finalicen. La fecha de término queda ese día.'
            : 'Cuando termina el tiempo de armado, se sube la foto y con eso se finaliza. Si no hubo foto, el encargado o el admin pueden cerrarlo igual.'}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-lg bg-white/15 px-3 py-1.5 text-[12px] font-semibold text-white">
            {props.pieces.length} piezas en el armado
          </span>
          <span className="rounded-lg bg-white/15 px-3 py-1.5 text-[12px] font-semibold text-white">
            {armadoPhotos.length > 0 ? 'Foto lista' : 'Sin foto'}
          </span>
        </div>
      </header>

      <div className="space-y-4 px-4 py-5 sm:px-5">
        {pieceIdColumnOk === false ? (
          <div
            className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] leading-relaxed text-amber-950"
            role="alert"
          >
            <p className="font-bold">Falta migración en Supabase</p>
            <p className="mt-1">
              Ejecuta en el SQL Editor{' '}
              <code className="rounded bg-amber-100 px-1">{BODEGA_PIECE_PHOTOS_PIECE_ID_PATCH}</code> y recarga el
              esquema API.
            </p>
          </div>
        ) : null}

        {props.armadoCerrado || props.cierreExterno ? (
          <ArmadoPhotoClose
            photos={props.photos.filter((ph) => ph.piece_id == null)}
            canUpload={props.canUpload}
            canFinalize={props.canFinalize}
            projectFinalized={props.projectFinalized}
            uploadBusy={props.uploadBusy}
            finalizeBusy={props.finalizeBusy}
            cierreExterno={props.cierreExterno}
            onUpload={props.onUploadArmado}
            onReplace={props.onReplaceArmado}
            onRemove={props.onRemoveArmado}
            onFinalize={props.onFinalize}
          />
        ) : (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-6 text-[14px] leading-relaxed text-amber-950">
          El proyecto todavía no pasa a foto. En <strong>Taller → Armado</strong> tienen que estar todas las piezas,
          se toma el tiempo del armado y al pulsar <strong>Fin</strong> aquí se sube la foto del armado.
        </div>
        )}
      </div>
    </section>
  )
}

function ArmadoPhotoClose(props: {
  photos: ProjectPiecePhotoRow[]
  canUpload: boolean
  canFinalize: boolean
  projectFinalized: boolean
  uploadBusy: boolean
  finalizeBusy: boolean
  cierreExterno: boolean
  onUpload: (files: File[]) => Promise<void>
  onReplace: (photo: ProjectPiecePhotoRow, file: File) => Promise<void>
  onRemove: (photo: ProjectPiecePhotoRow) => Promise<void>
  onFinalize: (opts?: { sinFoto?: boolean; nota?: string }) => Promise<void>
}) {
  const [notaCierre, setNotaCierre] = useState('')
  const hasPhoto = props.photos.length > 0
  const nota = notaCierre.trim()
  return (
    <div className="space-y-4">
      {props.projectFinalized ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-950">
          Proyecto finalizado.
        </div>
      ) : null}
      <div className={fotosUi.panel}>
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Foto del armado</p>
        <p className="mt-1 text-[14px] leading-relaxed text-slate-700">
          {props.cierreExterno
            ? 'Si hay foto del trabajo, súbela. Si no era esa, cámbiala o quítala. Si no la hay, el encargado o el admin pueden finalizar sin foto.'
            : 'Una foto del proyecto ya armado. Si no era esa, cámbiala o quítala antes de finalizar.'}
        </p>
        {props.canUpload && !props.projectFinalized && !hasPhoto ? (
          <label className={`mt-4 ${fotosUi.uploadZone}`}>
            <span className="text-[14px] font-semibold text-slate-900">
              {props.uploadBusy ? 'Subiendo…' : 'Elegir foto del armado'}
            </span>
            <span className="mt-1 text-[12px] text-slate-500">JPG, PNG, WEBP</span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={props.uploadBusy}
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.currentTarget.value = ''
                if (file) void props.onUpload([file])
              }}
            />
          </label>
        ) : null}
        {hasPhoto ? (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {props.photos.map((ph) => (
              <div key={ph.id} className="space-y-2">
                <PhotoThumb path={ph.storage_path} name={ph.filename} />
                <p className="truncate text-[11px] text-slate-500" title={ph.filename}>
                  {ph.filename}
                </p>
                {props.canUpload && !props.projectFinalized ? (
                  <div className="flex gap-1">
                    <label className="inline-flex min-h-[32px] flex-1 cursor-pointer items-center justify-center rounded-lg border border-slate-300 bg-white px-2 text-[11px] font-bold text-slate-800 hover:bg-slate-50">
                      {props.uploadBusy ? '…' : 'Cambiar'}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={props.uploadBusy}
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          e.currentTarget.value = ''
                          if (file) void props.onReplace(ph, file)
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      disabled={props.uploadBusy}
                      className="min-h-[32px] flex-1 rounded-lg border border-rose-200 bg-rose-50 px-2 text-[11px] font-bold text-rose-900 hover:bg-rose-100 disabled:opacity-50"
                      onClick={() => {
                        if (!window.confirm('¿Quitar esta foto del armado?')) return
                        void props.onRemove(ph)
                      }}
                    >
                      Quitar
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-[13px] text-slate-500">Todavía no hay foto del armado.</p>
        )}
      </div>
      {props.canFinalize && !props.projectFinalized ? (
        <div className={fotosUi.finalizeBox}>
          <p className="text-[15px] font-bold text-section-navy">Finalizar proyecto</p>
          <p className="mt-2 text-[13px] leading-relaxed text-slate-600">
            {hasPhoto
              ? 'La foto del armado ya está. Puedes dejar una nota y finalizar el proyecto.'
              : 'Con foto se usa el botón de abajo. Sin foto, solo el encargado o el admin pueden cerrarlo.'}
          </p>
          <label className="mt-4 block text-[12px] font-semibold text-slate-700">
            Nota para el reporte
            <span className="ml-1 font-normal text-slate-500">opcional · fechas o contratiempos</span>
            <textarea
              value={notaCierre}
              onChange={(e) => setNotaCierre(e.target.value)}
              rows={3}
              disabled={props.finalizeBusy}
              placeholder="Ej. El proveedor lo entregó el 18/10. Se retrasó dos días por material."
              className="mt-1 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] font-normal leading-relaxed text-slate-900 outline-none focus:border-slate-400"
            />
          </label>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              disabled={props.finalizeBusy || !hasPhoto}
              className={[
                'min-h-[52px] w-full rounded-xl px-5 py-3 text-[15px] font-bold disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto',
                fotosUi.btnFinalize,
              ].join(' ')}
              onClick={() => void props.onFinalize({ nota })}
            >
              {props.finalizeBusy ? 'Finalizando…' : 'Finalizar proyecto'}
            </button>
            {!hasPhoto ? (
              <button
                type="button"
                disabled={props.finalizeBusy}
                className="min-h-[52px] w-full rounded-xl border border-slate-300 bg-white px-5 py-3 text-[15px] font-bold text-slate-800 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                onClick={() => void props.onFinalize({ sinFoto: true, nota })}
              >
                {props.finalizeBusy ? 'Finalizando…' : 'Finalizar sin foto'}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

