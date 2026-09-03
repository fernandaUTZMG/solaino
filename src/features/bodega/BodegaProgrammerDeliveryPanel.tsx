import { useRef, useState } from 'react'
import type { AppRole } from '../../lib/roles'
import { canManageBodegaLikeAdmin, canUploadBodegaMachine } from '../../lib/roles'
import type { ProjectDesignVersionRow } from '../../lib/designVersionsRepo'
import type { ProjectMachineVersionRow } from '../../lib/machineVersionsRepo'
import { progSeccionCnc, progTituloCnc } from './bodegaProgramacionUi.ts'

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

  if (!canWork) return null

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
    <div className={progSeccionCnc}>
      <div className="border-b border-programacion-200/80 px-4 py-3 sm:px-5">
        <h4 className={progTituloCnc}>Entrega de programación</h4>
        <p className="mt-1 text-[12px] leading-relaxed text-programacion-950/85">
          Descarga las carpetas confirmadas por el encargado, programa en tu PC y sube aquí solo las piezas que sí se
          maquinarán. El reloj de programación corre mientras trabajas y se cierra al subir el ZIP.
        </p>
      </div>
      <div className="space-y-4 px-4 py-4 sm:px-5">
        {err ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-900">{err}</div>
        ) : null}

        {!props.foldersConfirmed ? (
          <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] text-amber-950">
            El encargado aún no confirma todas las carpetas de diseño. Revisa la pestaña <strong>Diseño</strong>.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!props.designVersion}
                className="rounded-xl border border-programacion-300 bg-white px-4 py-2 text-[13px] font-semibold text-programacion-950 disabled:opacity-50"
                onClick={props.onDownloadDesign}
              >
                Descargar diseño confirmado
              </button>
            </div>

            {props.hasDelivery && props.latestDelivery ? (
              <p className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-950">
                Entrega registrada: <strong>{props.latestDelivery.zip_filename}</strong> (v{props.latestDelivery.version}
                ). Ya puedes asignar destinos CNC / Torno / Perfilado abajo.
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
                  className="min-h-[44px] rounded-xl bg-programacion-700 px-5 py-2.5 text-[13px] font-bold text-white disabled:opacity-50"
                  onClick={() => fileRef.current?.click()}
                >
                  {props.uploadBusy
                    ? props.uploadPhase ?? 'Subiendo…'
                    : `Subir carpeta programada (${props.projectFolio})`}
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
