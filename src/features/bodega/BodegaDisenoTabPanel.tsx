import type { ProjectDesignVersionRow } from '../../lib/designVersionsRepo'
import {
  disenoAccentBtn,
  disenoAccentIconBox,
  disenoBarraAcciones,
  disenoStepBody,
  disenoStepCard,
  disenoStepHeader,
  disenoStepNumber,
} from './bodegaDisenoUi.ts'

type Props = {
  canUploadDesign: boolean
  designUploadBusy: boolean
  designUploadPhase: string
  designEntregaVersions: ProjectDesignVersionRow[]
  clienteInfoVersions: ProjectDesignVersionRow[]
  onUploadDesign: (file: File) => void
  onDownload: (v: ProjectDesignVersionRow) => void
  formatDateTime: (d: Date) => string
}

function statusShort(status: ProjectDesignVersionRow['status'], comentarios?: string | null): string {
  if (status === 'aprobada') return 'Aprobada'
  if (status === 'requiere_cambios') return 'Cambios solicitados'
  if (status === 'en_revision') return 'En revisión'
  if (/reemplazada|cerrada al resolver/i.test(comentarios ?? '')) return 'Reemplazada'
  return 'Subida'
}

function statusBadgeClass(status: ProjectDesignVersionRow['status']): string {
  if (status === 'aprobada') return 'bg-emerald-100 text-emerald-900 border-emerald-200'
  if (status === 'requiere_cambios') return 'bg-rose-100 text-rose-900 border-rose-200'
  if (status === 'en_revision') return 'bg-amber-100 text-amber-950 border-amber-200'
  return 'bg-slate-100 text-slate-700 border-slate-200'
}

function IconZip(props: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      className={props.className}
      aria-hidden
    >
      <path d="M12 22v-9" />
      <path d="M12 13V7" />
      <path d="M8 11V7" />
      <path d="M16 11V7" />
      <path d="M6 7V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2" />
      <rect x="6" y="11" width="12" height="11" rx="1" />
    </svg>
  )
}

function IconFolderRef(props: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      className={props.className}
      aria-hidden
    >
      <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
    </svg>
  )
}

function StepHeader(props: { n: number; title: string; subtitle: string }) {
  return (
    <div className={disenoStepHeader}>
      <span className={disenoStepNumber}>{props.n}</span>
      <div className="min-w-0 flex-1">
        <h3 className="text-[15px] font-bold text-pink-950">{props.title}</h3>
        <p className="mt-0.5 text-[12px] leading-snug text-pink-900/85">{props.subtitle}</p>
      </div>
    </div>
  )
}

function VersionRow(props: {
  v: ProjectDesignVersionRow
  badge?: string
  onDownload: (v: ProjectDesignVersionRow) => void
  formatDateTime: (d: Date) => string
}) {
  const { v } = props
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3.5 last:border-0 sm:px-5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {props.badge ? (
            <span className="rounded-lg bg-pink-600 px-2 py-0.5 font-mono text-[11px] font-bold text-white shadow-sm">
              {props.badge}
            </span>
          ) : null}
          <span
            className={[
              'rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
              statusBadgeClass(v.status),
            ].join(' ')}
          >
            {statusShort(v.status, v.comentarios)}
          </span>
        </div>
        <p className="mt-1 truncate text-[14px] font-semibold text-slate-900" title={v.zip_filename}>
          {v.zip_filename}
        </p>
        <p className="mt-0.5 text-[12px] text-slate-500">
          {props.formatDateTime(new Date(v.created_at))}
          {v.comentarios?.trim() ? ` · ${v.comentarios.trim()}` : ''}
        </p>
      </div>
      <button
        type="button"
        className="shrink-0 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-[13px] font-semibold text-slate-800 shadow-sm transition hover:border-sky-300 hover:bg-sky-50"
        onClick={() => props.onDownload(v)}
      >
        Descargar ZIP
      </button>
    </li>
  )
}

export function BodegaDisenoTabPanel(props: Props) {
  const latestEntrega = props.designEntregaVersions[0]

  return (
    <div className="space-y-5">
      <section className={disenoStepCard}>
        <StepHeader
          n={1}
          title="Información del cliente"
          subtitle="Archivos de referencia que el supervisor cargó en Bodega → Archivos (no son la entrega formal de diseño)."
        />
        <div className={disenoStepBody}>
          {props.clienteInfoVersions.length === 0 ? (
            <div className="flex gap-3 rounded-xl border-2 border-dashed border-pink-300 bg-pink-50/80 px-4 py-5">
              <IconFolderRef className="h-10 w-10 shrink-0 text-slate-400" />
              <div>
                <p className="text-[13px] font-semibold text-slate-800">Sin referencias aún</p>
                <p className="mt-1 text-[12px] leading-relaxed text-slate-600">
                  Pide al encargado que suba planos o notas del cliente en la sección <strong>Archivos</strong> del
                  menú Bodega. Aparecerán aquí automáticamente.
                </p>
              </div>
            </div>
          ) : (
            <ul className="overflow-hidden rounded-xl border-2 border-pink-200/90 bg-white ring-1 ring-pink-100/80">
              {props.clienteInfoVersions.map((v) => (
                <VersionRow
                  key={v.id}
                  v={v}
                  badge="Ref."
                  onDownload={props.onDownload}
                  formatDateTime={props.formatDateTime}
                />
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className={disenoStepCard}>
        <StepHeader
          n={2}
          title="Entrega de diseño (ZIP)"
          subtitle="Comprime la carpeta del proyecto: modelos (.SLDPRT, .PRT…) y un PDF por pieza con el mismo nombre."
        />
        <div className={disenoStepBody}>
          {props.canUploadDesign ? (
            <div className={disenoBarraAcciones}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <span className={disenoAccentIconBox}>
                  <IconZip className="h-7 w-7" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-bold text-slate-900">Subir nueva versión</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-slate-600">
                    Cada subida crea una versión (V1, V2…). El supervisor revisará la más reciente en{' '}
                    <strong>en revisión</strong>.
                  </p>
                  <label className={`mt-3 inline-flex min-h-[44px] cursor-pointer items-center justify-center ${disenoAccentBtn}`}>
                    {props.designUploadBusy ? props.designUploadPhase || 'Subiendo…' : 'Seleccionar archivo .zip'}
                    <input
                      type="file"
                      accept=".zip,application/zip"
                      className="hidden"
                      disabled={props.designUploadBusy}
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) props.onUploadDesign(f)
                        e.currentTarget.value = ''
                      }}
                    />
                  </label>
                </div>
              </div>
            </div>
          ) : (
            <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[13px] text-slate-600">
              Solo la <strong>diseñadora</strong> (o roles con permiso de subida) pueden cargar el ZIP de entrega aquí.
            </p>
          )}

          {latestEntrega && props.designEntregaVersions.length > 0 ? (
            <p className="text-[12px] font-medium text-slate-600">
              Última entrega:{' '}
              <span className="font-mono font-bold text-slate-900">V{latestEntrega.version}</span> —{' '}
              {statusShort(latestEntrega.status, latestEntrega.comentarios)}
            </p>
          ) : null}

          {props.designEntregaVersions.length === 0 ? (
            <div className="rounded-xl border border-amber-200/80 bg-amber-50/60 px-4 py-4 text-[13px] text-amber-950">
              <strong>Aún no hay entregas.</strong> Cuando subas el primer ZIP, el proyecto pasará a revisión del
              supervisor.
            </div>
          ) : (
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">Historial de entregas</p>
              <ul className="overflow-hidden rounded-xl border-2 border-pink-200/90 bg-white ring-1 ring-pink-100/80">
                {props.designEntregaVersions.map((v) => (
                  <VersionRow
                    key={v.id}
                    v={v}
                    badge={`V${v.version}`}
                    onDownload={props.onDownload}
                    formatDateTime={props.formatDateTime}
                  />
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
