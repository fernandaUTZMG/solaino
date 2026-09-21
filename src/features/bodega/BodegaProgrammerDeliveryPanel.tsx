import { useMemo, useRef, useState } from 'react'
import type { AppRole } from '../../lib/roles'
import { canManageBodegaLikeAdmin, canUploadBodegaMachine } from '../../lib/roles'
import type { ProjectDesignVersionRow } from '../../lib/designVersionsRepo'
import { createSignedUrlForDesignZip } from '../../lib/designVersionsRepo'
import type { ProjectMachineVersionRow } from '../../lib/machineVersionsRepo'
import { sanitizeStorageFileName } from '../../lib/bodegaOrdenes'
import { downloadBlobAsFile } from '../../lib/downloadBlobAsFile'
import { isXtDesignVersion, xtParseResultFromManifest } from '../../lib/xtDesignManifest'
import { BodegaXtPieceList } from './BodegaXtPieceList.tsx'
import { progAccentBtn } from './bodegaProgramacionUi.ts'

type Props = {
  role: AppRole
  projectFolio: string
  foldersConfirmed: boolean
  hasDelivery: boolean
  designVersion: ProjectDesignVersionRow | null
  latestDelivery: ProjectMachineVersionRow | null
  uploadBusy: boolean
  uploadPhase: string | null
  onDownloadDesign: () => void
  onUploadProgrammingZip: (file: File, comment: string | null) => Promise<void>
}

export function BodegaProgrammerDeliveryPanel(props: Props) {
  const canWork = canUploadBodegaMachine(props.role) || canManageBodegaLikeAdmin(props.role)
  const fileRef = useRef<HTMLInputElement>(null)
  const [comment, setComment] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [xtBusy, setXtBusy] = useState(false)
  const isXt = isXtDesignVersion(props.designVersion)
  const xtResult = useMemo(
    () => (props.designVersion ? xtParseResultFromManifest(props.designVersion.manifest) : null),
    [props.designVersion],
  )

  if (!canWork) return null

  async function downloadXt(pieceName?: string) {
    const v = props.designVersion
    if (!v) return
    setXtBusy(true)
    setErr(null)
    try {
      const url = await createSignedUrlForDesignZip(v.zip_storage_path)
      if (!url) throw new Error('No se pudo generar el enlace del .x_t.')
      const res = await fetch(url)
      if (!res.ok) throw new Error('No se pudo descargar el ensamble .x_t.')
      const blob = await res.blob()
      const base = pieceName?.trim()
        ? sanitizeStorageFileName(pieceName.trim())
        : sanitizeStorageFileName(v.zip_filename.replace(/\.(x_t|xt)$/i, '') || 'ensamble')
      downloadBlobAsFile(blob, `${base}.x_t`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se descargó el .x_t.')
    } finally {
      setXtBusy(false)
    }
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!/\.zip$/i.test(file.name)) {
      setErr('Sube un archivo ZIP con las piezas ya programadas.')
      return
    }
    setErr(null)
    try {
      await props.onUploadProgrammingZip(file, comment.trim() || null)
      setComment('')
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'No se subió la entrega de programación')
    }
  }

  return (
    <div className="space-y-4">
      {err ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-900">{err}</div>
      ) : null}

      {isXt && props.designVersion ? (
        <div className="space-y-3">
          {!props.foldersConfirmed ? (
            <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] text-amber-950">
              El encargado aún no confirma el diseño. Ya puedes <strong>descargar</strong> el ensamble y las piezas; la
              asignación a CNC, torno o perfilado se habilita al confirmar.
            </p>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-section-navy/25 bg-section-navy px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-[13px] font-bold text-white" title={props.designVersion.zip_filename}>
                {props.designVersion.zip_filename}
              </p>
              <p className="mt-0.5 text-[11px] text-sky-100/90">
                Ensamble de diseño · ábrelo en tu programa y trabaja la pieza que descargues
              </p>
            </div>
            <button
              type="button"
              disabled={xtBusy}
              className="shrink-0 rounded-lg border border-white/45 bg-white px-3.5 py-2 text-[13px] font-bold text-section-navy shadow-sm hover:bg-sky-50 disabled:opacity-60"
              onClick={() => void downloadXt()}
            >
              {xtBusy ? 'Descargando…' : 'Descargar ensamble .x_t'}
            </button>
          </div>
          {xtResult ? (
            <>
              <BodegaXtPieceList
                result={xtResult}
                compact
                hideDiscarded
                downloadBusy={xtBusy}
                onDownloadPiece={(name) => void downloadXt(name)}
              />
              <p className="text-[12px] leading-relaxed text-slate-600">
                Cada descarga lleva el ensamble .x_t con el nombre de esa pieza, para abrirlo en tu programa.
              </p>
            </>
          ) : (
            <p className="text-[13px] text-slate-600">No hay lista de piezas en este ensamble. Descarga el archivo completo.</p>
          )}
        </div>
      ) : !props.foldersConfirmed ? (
        <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] text-amber-950">
          El encargado aún no confirma el diseño. Revisa la pestaña <strong>Diseño</strong>.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!props.designVersion} className={progAccentBtn} onClick={props.onDownloadDesign}>
            Descargar diseño confirmado
          </button>
        </div>
      )}

      {props.hasDelivery && props.latestDelivery ? (
        <p className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-950">
          Entrega de programación: <strong>{props.latestDelivery.zip_filename}</strong> (v{props.latestDelivery.version}).
        </p>
      ) : isXt ? (
        <p className="text-[13px] text-slate-600">
          Asigna abajo cada pieza a <strong>CNC</strong>, <strong>torno</strong> o <strong>perfilado</strong>. El ZIP de
          programas se sube después, pieza por pieza.
        </p>
      ) : (
        <>
          <label className="block text-[12px] font-semibold text-slate-700">
            Comentario (opcional)
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              disabled={props.uploadBusy}
              rows={2}
              className="mt-2 w-full resize-y rounded-xl border border-slate-200 px-4 py-3 text-[14px]"
            />
          </label>
          <input ref={fileRef} type="file" accept=".zip,application/zip" className="hidden" onChange={(e) => void onFileChange(e)} />
          <button
            type="button"
            disabled={props.uploadBusy}
            className={progAccentBtn}
            onClick={() => fileRef.current?.click()}
          >
            {props.uploadBusy ? props.uploadPhase ?? 'Subiendo…' : `Subir carpeta programada (${props.projectFolio})`}
          </button>
        </>
      )}
    </div>
  )
}
