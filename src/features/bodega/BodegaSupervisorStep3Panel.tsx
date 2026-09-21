import { useEffect, useMemo, useState } from 'react'
import type { ProjectDesignVersionRow } from '../../lib/designVersionsRepo'
import { nextDesignVersionPendingReview } from '../../lib/designVersionsRepo'
import type { BodegaProjectPieceRow } from '../../lib/bodegaPiecesRepo'
import { pieceHasPlano } from '../../lib/bodegaPieceDesignDrawing'
import { pieceForZipPath } from '../../lib/bodegaXtAssemblies'
import { buildDesignKitLabelMap, displayLabelFromDesignPath } from '../../lib/designZipScope'
import { groupDesignPathsByImportFolder } from '../../lib/designZipImportFolders'
import { computeStep3FolderConfirmStatus } from '../../lib/bodegaStep3Supervisor'
import { filterSwPartZipPaths } from '../../lib/zipDesignPackage'
import { disenoSeccion, disenoTitulo } from './bodegaDisenoUi.ts'

type Props = {
  embedded?: boolean
  projectStatus: string
  designEntregaVersions: ProjectDesignVersionRow[]
  pendingReviewPaths: string[]
  pendingReviewPathsLoading: boolean
  designZipPaths: string[]
  designZipPathsLoading: boolean
  confirmedFolderKeys: Set<string>
  confirmBusy: boolean
  pieces?: BodegaProjectPieceRow[]
  onDownloadZip: (v: ProjectDesignVersionRow) => void
  onConfirmFolders: (args: {
    version: ProjectDesignVersionRow
    folderKeys: string[]
    comment?: string | null
    reject?: boolean
  }) => void | Promise<void>
}

export function BodegaSupervisorStep3Panel(props: Props) {
  const [localErr, setLocalErr] = useState<string | null>(null)
  const [comment, setComment] = useState('')
  const [selectedFolders, setSelectedFolders] = useState<Set<string>>(new Set())

  const pendingReview = useMemo(
    () => nextDesignVersionPendingReview(props.designEntregaVersions),
    [props.designEntregaVersions],
  )

  const designApproved = ['diseno_aprobado', 'diseno_parcial', 'en_programacion', 'revision_programacion'].includes(
    props.projectStatus,
  )

  const kitLabels = useMemo(
    () => buildDesignKitLabelMap(props.designEntregaVersions),
    [props.designEntregaVersions],
  )

  const activeVersion = useMemo(() => {
    if (pendingReview) return pendingReview
    const approved = props.designEntregaVersions
      .filter((v) => v.status === 'aprobada' || v.status === 'aprobada_parcial')
      .sort((a, b) => b.version - a.version)
    return approved[0] ?? null
  }, [pendingReview, props.designEntregaVersions])

  const pathsForPanel = useMemo(() => {
    if (pendingReview) return filterSwPartZipPaths(props.pendingReviewPaths)
    return filterSwPartZipPaths(props.designZipPaths)
  }, [pendingReview, props.pendingReviewPaths, props.designZipPaths])

  const pieces = props.pieces ?? []

  const planosSummary = useMemo(() => {
    let withPlano = 0
    let sinPlano = 0
    for (const path of pathsForPanel) {
      const piece = pieceForZipPath(pieces, path)
      if (piece && pieceHasPlano(piece, pathsForPanel)) withPlano += 1
      else sinPlano += 1
    }
    return { withPlano, sinPlano, total: pathsForPanel.length }
  }, [pathsForPanel, pieces])

  const folderGroups = useMemo(
    () => groupDesignPathsByImportFolder(pathsForPanel, kitLabels),
    [pathsForPanel, kitLabels],
  )

  const folderGroupsKey = folderGroups.map((g) => g.folderKey).join('|')

  useEffect(() => {
    const pending = folderGroups.filter((g) => !props.confirmedFolderKeys.has(g.folderKey)).map((g) => g.folderKey)
    setSelectedFolders(new Set(pending))
  }, [folderGroupsKey, folderGroups, props.confirmedFolderKeys])

  const step3 = useMemo(
    () => computeStep3FolderConfirmStatus(props.designZipPaths, props.confirmedFolderKeys, kitLabels),
    [props.designZipPaths, props.confirmedFolderKeys, kitLabels],
  )

  const showReviewBlock = pendingReview != null
  const showWaitingDesigner =
    props.projectStatus === 'modificacion_diseno' || props.projectStatus === 'diseno_parcial'
  const showSpecBlock = designApproved && pendingReview == null

  if (!showReviewBlock && !showWaitingDesigner && !showSpecBlock) {
    return null
  }

  function toggleFolder(folderKey: string) {
    setSelectedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(folderKey)) next.delete(folderKey)
      else next.add(folderKey)
      return next
    })
  }

  async function handleConfirm(reject = false) {
    if (!activeVersion) return
    const keys = reject ? [] : Array.from(selectedFolders).filter((k) => !props.confirmedFolderKeys.has(k))
    if (!reject && keys.length === 0) {
      setLocalErr('Selecciona al menos una carpeta pendiente por confirmar.')
      return
    }
    if (reject && !comment.trim()) {
      setLocalErr('Indica el motivo para devolver la entrega a la diseñadora.')
      return
    }
    setLocalErr(null)
    try {
      await props.onConfirmFolders({
        version: activeVersion,
        folderKeys: keys,
        comment: comment.trim() || null,
        reject,
      })
      setComment('')
    } catch (e) {
      setLocalErr(e instanceof Error ? e.message : 'No se confirmaron las carpetas')
    }
  }

  function renderFolderBlock(version: ProjectDesignVersionRow) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <span className="rounded-lg bg-slate-900 px-2 py-1 font-mono text-[12px] font-bold text-white">
              V{version.version}
            </span>
            <p className="mt-2 text-[14px] font-semibold text-slate-900">{version.zip_filename}</p>
            <p className="mt-1 text-[12px] text-slate-600">
              Descarga el ensamble .x_t, revisa las piezas y los planos PDF, y confirma. Después la diseñadora podrá
              separar destinos (torno / perfiladora / CNC / accesorio).
            </p>
          </div>
          <button
            type="button"
            className="min-h-[40px] shrink-0 rounded-xl border border-slate-200 bg-white px-4 py-2 text-[13px] font-semibold text-slate-800 shadow-sm"
            onClick={() => props.onDownloadZip(version)}
          >
            {/\.x_t$/i.test(version.zip_filename) || /\.xt$/i.test(version.zip_filename)
              ? 'Descargar .x_t'
              : 'Descargar carpeta (ZIP)'}
          </button>
        </div>

        {planosSummary.total > 0 ? (
          <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-[13px] text-sky-950">
            <p className="font-bold">Planos PDF en esta entrega</p>
            <p className="mt-1 leading-relaxed">
              <span className="font-semibold text-emerald-800">{planosSummary.withPlano} con plano</span>
              {' · '}
              <span className="font-semibold text-slate-700">{planosSummary.sinPlano} sin plano</span>
              {' · '}
              {planosSummary.total} pieza{planosSummary.total === 1 ? '' : 's'} en total. Las que tienen plano irán a
              torno o perfiladora; las demás a CNC o accesorio.
            </p>
            {pathsForPanel.length > 0 && pathsForPanel.length <= 40 ? (
              <ul className="mt-3 max-h-48 space-y-1 overflow-auto text-[12px]">
                {pathsForPanel.map((path) => {
                  const piece = pieceForZipPath(pieces, path)
                  const has = piece != null && pieceHasPlano(piece, pathsForPanel)
                  return (
                    <li key={path} className="flex flex-wrap items-center gap-2 font-mono text-slate-800">
                      <span className="min-w-0 flex-1 truncate">{displayLabelFromDesignPath(path)}</span>
                      {has ? (
                        <span className="inline-flex items-center gap-1 rounded border border-emerald-400 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-900">
                          <span className="rounded bg-rose-600 px-1 text-[8px] text-white">PDF</span>
                          Plano
                        </span>
                      ) : (
                        <span className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-400">
                          Sin plano
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
            ) : null}
          </div>
        ) : null}

        {props.pendingReviewPathsLoading || props.designZipPathsLoading ? (
          <p className="text-[13px] text-slate-500">Leyendo piezas de la entrega…</p>
        ) : folderGroups.length === 0 ? (
          <p className="text-[13px] text-amber-800">No se detectaron piezas en esta entrega.</p>
        ) : (
          <>
            <ul className="space-y-2">
              {folderGroups.map((group) => {
                const confirmed = props.confirmedFolderKeys.has(group.folderKey)
                const checked = selectedFolders.has(group.folderKey)
                return (
                  <li
                    key={group.folderKey}
                    className={[
                      'rounded-xl border px-3 py-3',
                      confirmed
                        ? 'border-emerald-300 bg-emerald-50/80'
                        : checked
                          ? 'border-indigo-300 bg-white shadow-sm'
                          : 'border-slate-200 bg-white/80',
                    ].join(' ')}
                  >
                    <label className={confirmed ? 'flex items-start gap-3' : 'flex cursor-pointer items-start gap-3'}>
                      {!confirmed ? (
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={checked}
                          disabled={props.confirmBusy}
                          onChange={() => toggleFolder(group.folderKey)}
                        />
                      ) : (
                        <span className="mt-0.5 text-emerald-700" aria-hidden>
                          ✓
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="font-semibold text-slate-900">{group.label}</span>
                        <span className="mt-0.5 block text-[12px] text-slate-600">
                          {group.paths.length} pieza{group.paths.length === 1 ? '' : 's'} en diseño
                          {confirmed ? (
                            <span className="ml-2 font-semibold text-emerald-800">· Confirmada</span>
                          ) : null}
                        </span>
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>

            {!pendingReview && step3.complete ? (
              <p className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-950">
                Todas las carpetas confirmadas ({step3.confirmedCount}/{step3.totalFolders}). La programadora puede
                descargar y trabajar el proyecto.
              </p>
            ) : null}

            <label className="block text-[12px] font-semibold text-slate-700">
              Comentario (opcional)
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                disabled={props.confirmBusy}
                rows={2}
                className="mt-2 w-full resize-y rounded-xl border border-slate-200 px-4 py-3 text-[14px]"
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={props.confirmBusy}
                className="min-h-[44px] rounded-xl bg-emerald-700 px-5 py-2.5 text-[13px] font-bold text-white shadow-sm hover:bg-emerald-800 disabled:opacity-50"
                onClick={() => void handleConfirm(false)}
              >
                {props.confirmBusy ? 'Guardando…' : 'Confirmar diseño y planos'}
              </button>
              {pendingReview ? (
                <button
                  type="button"
                  disabled={props.confirmBusy}
                  className="min-h-[44px] rounded-xl border border-rose-300 bg-rose-50 px-5 py-2.5 text-[13px] font-bold text-rose-900 disabled:opacity-50"
                  onClick={() => void handleConfirm(true)}
                >
                  Rechazar entrega
                </button>
              ) : null}
            </div>
          </>
        )}
      </div>
    )
  }

  const inner = (
    <div className={props.embedded ? 'space-y-5' : 'space-y-5 p-5 sm:p-6'}>
      {localErr ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-900">{localErr}</div>
      ) : null}

      {showReviewBlock && pendingReview ? (
        <div className="overflow-hidden rounded-2xl border border-indigo-200/90 bg-white shadow-sm">
          <div className="border-b border-indigo-100 bg-gradient-to-r from-indigo-50/95 via-white to-white px-5 py-4 sm:px-6">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-indigo-800/90">Revisión encargado</p>
            <h4 className="mt-1 text-[16px] font-bold text-slate-900">Confirma diseño y planos</h4>
          </div>
          <div className="px-5 py-4 sm:px-6">{renderFolderBlock(pendingReview)}</div>
        </div>
      ) : null}

      {showWaitingDesigner ? (
        <div className="rounded-xl border border-amber-200/80 bg-amber-50/50 p-4 text-[13px] text-amber-950">
          <p className="font-semibold">Esperando corrección de la diseñadora</p>
          <p className="mt-2 leading-relaxed">
            La entrega fue rechazada o está incompleta. Cuando la diseñadora suba un nuevo .x_t, podrás confirmarlo
            aquí.
          </p>
        </div>
      ) : null}

      {showSpecBlock ? (
        <div className="overflow-hidden rounded-2xl border border-emerald-200/90 bg-white shadow-sm">
          <div className="border-b border-emerald-100 bg-emerald-50/70 px-5 py-4">
            <p className="text-[10px] font-bold uppercase text-emerald-900">Carpetas confirmadas</p>
            <p className="mt-1 text-[13px] text-slate-600">
              {step3.confirmedCount} de {step3.totalFolders} carpeta(s) confirmada(s). Solo las confirmadas las ve la
              programadora.
            </p>
          </div>
          <div className="px-5 py-4">
            {activeVersion ? (
              renderFolderBlock(activeVersion)
            ) : (
              <p className="text-[13px] text-slate-600">Sin entrega de diseño aprobada.</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )

  if (props.embedded) return inner

  return (
    <section className={disenoSeccion}>
      <header className="border-b border-slate-200/80 px-5 py-4 sm:px-6">
        <h3 className={disenoTitulo}>Paso 3 — Encargado</h3>
        <p className="mt-1 text-[13px] text-slate-600">
          Confirma el ensamble y los planos. Después se pueden separar las piezas por destino.
        </p>
      </header>
      {inner}
    </section>
  )
}
