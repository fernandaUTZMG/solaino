import { useCallback, useMemo, useState } from 'react'
import type { AppRole } from '../../lib/roles'
import {
  canAttachPieceDesignDrawing,
  canManageBodegaLikeAdmin,
  canReviewBodegaDesign,
  canSupervisorFinalizeBodegaProject,
  canUploadBodegaMachine,
} from '../../lib/roles'
import type { BodegaProjectPieceRow, ProgrammerBucket } from '../../lib/bodegaPiecesRepo'
import {
  insertProjectPiece,
  syncProjectPiecesFromDesignPathsDetailed,
  updatePieceProgrammerBucket,
  updatePieceSourcePath,
  updateProgrammingRoutesConfirmed,
} from '../../lib/bodegaPiecesRepo'
import type { ProjectPiecePhotoRow } from '../../lib/piecePhotosRepo'
import { visibleDesignPieces } from '../../lib/designZipPiecePairs'
import { canReassignProgrammerCncTorno, isSwPartsAssignmentComplete } from '../../lib/bodegaProgrammerFlow'
import { BodegaPieceWorkflowCard } from './BodegaPieceWorkflowCard.tsx'
import {
  BODEGA_ZIP_ENTRY_DRAG_MIME,
  isSwPartZipPath,
  isZipPathAllowedForProgrammerBucket,
} from '../../lib/zipDesignPackage'

type ProjectStatus =
  | 'pendiente'
  | 'en_diseno'
  | 'revision_diseno'
  | 'modificacion_diseno'
  | 'diseno_parcial'
  | 'diseno_aprobado'
  | 'en_programacion'
  | 'revision_programacion'
  | 'terminado'

type FlowMeta = {
  design_contratiempo_notes: string | null
  programming_routes_confirmed_at: string | null
  project_finalized_at: string | null
}

function readDroppedZipPath(dt: DataTransfer): string | null {
  const a = dt.getData(BODEGA_ZIP_ENTRY_DRAG_MIME).trim()
  if (a) return a
  const b = dt.getData('text/plain').trim()
  return b || null
}

type PieceTab = 'all' | ProgrammerBucket

export type ApprovedDesignZipInfo = {
  version: number
  zipFilename: string
  paths: string[]
  pathsLoading: boolean
  pathsError: string | null
}

export function BodegaPiecesWorkflowPanel(props: {
  role: AppRole
  projectId: string
  projectFolio: string
  projectStatus: ProjectStatus
  pieces: BodegaProjectPieceRow[]
  flowMeta: FlowMeta | null
  piecePhotosCount: number
  photos: ProjectPiecePhotoRow[]
  canUploadPhotos: boolean
  photoUploadBusy: boolean
  onUploadPhotos: (pieceId: string, files: File[]) => void | Promise<void>
  approvedDesign: ApprovedDesignZipInfo | null
  onReload: () => Promise<void>
}) {
  const [newPieceLabel, setNewPieceLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [pieceTab, setPieceTab] = useState<PieceTab>('all')
  const [dragOverPieceId, setDragOverPieceId] = useState<string | null>(null)
  const [pathDraftByPiece, setPathDraftByPiece] = useState<Record<string, string>>({})

  const routesLocked = Boolean(props.flowMeta?.programming_routes_confirmed_at)
  const sup = canReviewBodegaDesign(props.role)
  const prog = canUploadBodegaMachine(props.role)
  const adminLike = canManageBodegaLikeAdmin(props.role)

  const designApproved = ['diseno_aprobado', 'diseno_parcial', 'en_programacion', 'revision_programacion'].includes(
    props.projectStatus,
  )

  const designZipPaths = props.approvedDesign?.paths ?? []
  const canAttachPlano = canAttachPieceDesignDrawing(props.role)

  const productionPiecesReady = props.pieces.some(
    (p) => p.source_path && isSwPartZipPath(p.source_path),
  )

  const visiblePieces = useMemo(
    () => visibleDesignPieces(props.pieces, designZipPaths),
    [props.pieces, designZipPaths],
  )

  const piecesForTab = useMemo(() => {
    if (pieceTab === 'all') return visiblePieces
    return visiblePieces.filter((p) => p.programmer_bucket === pieceTab)
  }, [visiblePieces, pieceTab])

  const pieceCounts = useMemo(() => {
    const c = { all: visiblePieces.length, cnc: 0, torno: 0, perfilado: 0, accesorios: 0 }
    for (const p of visiblePieces) {
      if (p.programmer_bucket === 'cnc') c.cnc++
      else if (p.programmer_bucket === 'torno') c.torno++
      else if (p.programmer_bucket === 'perfilado') c.perfilado++
      else if (p.programmer_bucket === 'accesorios') c.accesorios++
    }
    return c
  }, [visiblePieces])

  const assignSourcePath = useCallback(
    async (pieceId: string, path: string) => {
      const v = path.trim()
      if (!v) return
      const piece = props.pieces.find((p) => p.id === pieceId)
      if (piece?.programmer_bucket && !isZipPathAllowedForProgrammerBucket(v, piece.programmer_bucket)) {
        setErr(
          piece.programmer_bucket === 'perfilado'
            ? 'Ruta Perfilado: la pieza va a Taller → Perfilado (sin programación CNC/Torno).'
            : 'CNC y Torno solo admiten archivos .PRT / .SLCPRT / .SLDPRT.',
        )
        return
      }
      setBusy(true)
      setErr(null)
      try {
        await updatePieceSourcePath({ pieceId, sourcePath: v })
        setPathDraftByPiece((m) => {
          const n = { ...m }
          delete n[pieceId]
          return n
        })
        await props.onReload()
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'No se guardó la ruta')
      } finally {
        setBusy(false)
      }
    },
    [props.onReload, props.pieces],
  )

  async function onSyncPiecesFromDesign() {
    if (!sup && !adminLike) return
    if (designZipPaths.length === 0) {
      setErr('No hay carpeta de diseño cargada. Aprueba una entrega de diseño primero.')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      const sync = await syncProjectPiecesFromDesignPathsDetailed(props.projectId, designZipPaths, {
        swPartOnly: true,
      })
      await props.onReload()
      if (sync.added === 0 && sync.removedRedundantPdf === 0) {
        setErr('Todas las piezas del diseño ya estaban registradas.')
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se importaron piezas')
    } finally {
      setBusy(false)
    }
  }

  async function addPieceManual() {
    const label = newPieceLabel.trim()
    if (!label || !adminLike) return
    setBusy(true)
    setErr(null)
    try {
      await insertProjectPiece({ projectId: props.projectId, label })
      setNewPieceLabel('')
      await props.onReload()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se agregó la pieza')
    } finally {
      setBusy(false)
    }
  }

  const piecesAssignable =
    productionPiecesReady && isSwPartsAssignmentComplete(props.pieces)

  async function setBucket(pieceId: string, b: ProgrammerBucket | null) {
    const piece = props.pieces.find((p) => p.id === pieceId)
    if (routesLocked) {
      if (b !== 'cnc' && b !== 'torno') return
      if (!piece || !canReassignProgrammerCncTorno(piece)) return
    }
    if (
      piece?.source_path &&
      b &&
      !isZipPathAllowedForProgrammerBucket(piece.source_path, b)
    ) {
      setErr('CNC y Torno solo admiten archivos .PRT / .SLCPRT.')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      await updatePieceProgrammerBucket({ pieceId, programmerBucket: b })
      await props.onReload()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se guardó la asignación')
    } finally {
      setBusy(false)
    }
  }

  async function confirmRoutes() {
    if (!prog && !adminLike) return
    setBusy(true)
    setErr(null)
    try {
      await updateProgrammingRoutesConfirmed(props.projectId)
      await props.onReload()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se confirmaron rutas')
    } finally {
      setBusy(false)
    }
  }

  async function clearSourcePath(pieceId: string) {
    setBusy(true)
    setErr(null)
    try {
      await updatePieceSourcePath({ pieceId, sourcePath: null })
      setPathDraftByPiece((m) => {
        const n = { ...m }
        delete n[pieceId]
        return n
      })
      await props.onReload()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se quitó la ruta')
    } finally {
      setBusy(false)
    }
  }

  async function saveManualPath(pieceId: string) {
    const raw = (pathDraftByPiece[pieceId] ?? '').trim()
    if (!raw) {
      const piece = props.pieces.find((x) => x.id === pieceId)
      if (piece?.source_path) await clearSourcePath(pieceId)
      return
    }
    await assignSourcePath(pieceId, raw)
  }

  const operadorSolo = props.role === 'operador_bodega' && !sup && !prog && !adminLike

  return (
    <div className="space-y-6">
      {operadorSolo ? (
        <div className="rounded-2xl border border-teal-200 bg-teal-50/80 p-5 text-[13px] leading-relaxed text-teal-950">
          Usa el menú <strong className="text-teal-900">Taller</strong> (Perfilado, Detallado, Armado) o abre un proyecto y
          la pestaña <strong className="text-teal-900">Taller</strong>. El maquinado CNC/Torno está en{' '}
          <strong className="text-teal-900">Maquinado</strong>.
        </div>
      ) : null}
      {err ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-900">{err}</div> : null}

      {(sup || prog || adminLike) && (
        <section className="overflow-hidden rounded-2xl border border-violet-200/80 bg-white shadow-sm ring-1 ring-violet-900/[0.04]">
          <div className="border-b border-violet-100 bg-gradient-to-r from-violet-50/95 via-white to-white px-5 py-4 sm:px-6">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-violet-700/90">Rutas y avance</p>
            <h3 className="mt-0.5 text-[17px] font-bold text-slate-900">Piezas del proyecto</h3>
            <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-slate-600">
              Consulta el estado de cada pieza: destino (CNC, Torno o Perfilado), plano PDF y avance en taller. El acabado
              se define en <strong className="text-slate-800">Diseño → paso 3</strong>; la programación activa está en{' '}
              <strong className="text-slate-800">CNC</strong>.
            </p>
            {visiblePieces.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-800 shadow-sm">
                  {pieceCounts.all} pieza{pieceCounts.all === 1 ? '' : 's'}
                </span>
                <span className="rounded-lg border border-programacion-200 bg-programacion-50 px-3 py-1.5 text-[12px] font-semibold text-programacion-950">
                  {pieceCounts.cnc} CNC
                </span>
                <span className="rounded-lg border border-programacion-300 bg-programacion-100/80 px-3 py-1.5 text-[12px] font-semibold text-programacion-950">
                  {pieceCounts.torno} Torno
                </span>
                <span className="rounded-lg border border-fuchsia-200 bg-fuchsia-50 px-3 py-1.5 text-[12px] font-semibold text-fuchsia-950">
                  {pieceCounts.perfilado} Perfilado
                </span>
                <span className="rounded-lg border border-slate-300 bg-slate-100 px-3 py-1.5 text-[12px] font-semibold text-slate-800">
                  {pieceCounts.accesorios} Accesorios
                </span>
              </div>
            ) : null}
          </div>
          <div className="space-y-5 p-5 sm:p-6">
          {adminLike ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <input
                value={newPieceLabel}
                onChange={(e) => setNewPieceLabel(e.target.value)}
                placeholder="Pieza manual (solo emergencia)"
                disabled={busy}
                className="min-w-[200px] flex-1 rounded-xl border border-slate-200 px-3 py-2 text-[14px]"
              />
              <button
                type="button"
                disabled={busy}
                className="rounded-xl bg-slate-700 px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
                onClick={() => void addPieceManual()}
              >
                Agregar manual
              </button>
            </div>
          ) : null}

          {(prog || adminLike) && designApproved && !productionPiecesReady ? (
            <p className="mt-4 rounded-xl border border-violet-200/80 bg-violet-50/60 px-4 py-3 text-[13px] text-violet-950">
              El supervisor debe definir el acabado en <strong>Paso 3</strong> antes de usar <strong>Paso 4 — Programación</strong>.
            </p>
          ) : null}

          {(prog || adminLike) && designApproved && productionPiecesReady && !routesLocked ? (
            <p className="mt-4 rounded-xl border border-violet-200/80 bg-violet-50/60 px-4 py-3 text-[13px] text-violet-950">
              Asigna piezas en la pestaña <strong>CNC</strong> (tablero Pendientes / CNC / Torno) y confirma la
              asignación allí.
            </p>
          ) : null}

          {(prog || adminLike) && routesLocked ? (
            <p className="mt-4 rounded-xl border border-programacion-200/80 bg-programacion-50/60 px-4 py-3 text-[13px] text-programacion-950">
              Para <strong>Inicio</strong>, subir archivo y <strong>Terminar → Perfilado</strong> o{' '}
              <strong>sin perfilado</strong>, usa la pestaña <strong>CNC</strong>.
            </p>
          ) : null}

          {(sup || adminLike) && designApproved && designZipPaths.some((p) => isSwPartZipPath(p)) ? (
            <div className="mt-4">
              <button
                type="button"
                disabled={busy}
                className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-[12px] font-semibold text-emerald-950"
                onClick={() => void onSyncPiecesFromDesign()}
              >
                Importar piezas .PRT / .SLCPRT del diseño
              </button>
            </div>
          ) : null}

          {prog || adminLike ? (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={busy || routesLocked || props.pieces.length === 0 || !piecesAssignable}
                title={!piecesAssignable ? 'Asigna cada pieza .PRT/.SLCPRT a CNC o Torno en Paso 4' : undefined}
                className="rounded-xl bg-violet-600 px-4 py-2 text-[13px] font-bold text-white shadow-sm disabled:opacity-50"
                onClick={() => void confirmRoutes()}
              >
                {routesLocked ? 'Rutas confirmadas' : 'Confirmar rutas (CNC / Torno)'}
              </button>
              {routesLocked ? (
                <span className="text-[12px] text-emerald-700">
                  Confirmado {props.flowMeta?.programming_routes_confirmed_at?.slice(0, 16) ?? ''}
                </span>
              ) : null}
            </div>
          ) : null}

          {(prog || adminLike || sup) && props.pieces.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Filtrar</span>
              {(
                [
                  ['all', 'Todas', pieceCounts.all],
                  ['cnc', 'CNC', pieceCounts.cnc],
                  ['torno', 'Torno', pieceCounts.torno],
                  ['perfilado', 'Perfilado', pieceCounts.perfilado],
                  ['accesorios', 'Accesorios', pieceCounts.accesorios],
                ] as const
              ).map(([id, label, count]) => (
                <button
                  key={id}
                  type="button"
                  disabled={busy}
                  onClick={() => setPieceTab(id)}
                  className={[
                    'inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[12px] font-bold transition',
                    pieceTab === id
                      ? 'bg-violet-700 text-white shadow-sm'
                      : 'border border-slate-200 bg-white text-slate-700 hover:border-violet-200 hover:bg-violet-50/50',
                  ].join(' ')}
                >
                  {label}
                  <span
                    className={[
                      'rounded-md px-1.5 py-0.5 font-mono text-[10px]',
                      pieceTab === id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600',
                    ].join(' ')}
                  >
                    {count}
                  </span>
                </button>
              ))}
            </div>
          ) : null}

          {props.pieces.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-10 text-center">
              <p className="text-[14px] font-medium text-slate-600">
                Sin piezas registradas. Importa desde el diseño aprobado o asígnalas en programación.
              </p>
            </div>
          ) : piecesForTab.length === 0 ? (
            <div className="rounded-xl border border-violet-200 bg-violet-50/60 px-4 py-8 text-center">
              <p className="text-[14px] text-violet-950">
                Ninguna pieza con destino <strong className="uppercase">{pieceTab}</strong>. Prueba otro filtro o asigna
                rutas en CNC.
              </p>
            </div>
          ) : (
            <ul className="grid gap-4">
              {piecesForTab.map((p) => (
                <li key={p.id}>
                  <BodegaPieceWorkflowCard
                    piece={p}
                    projectFolio={props.projectFolio}
                    designZipPaths={designZipPaths}
                    canAttachPlano={canAttachPlano && Boolean(p.source_path && isSwPartZipPath(p.source_path))}
                    routesLocked={routesLocked}
                    canEditRoute={prog || adminLike}
                    canEditPath={(prog || adminLike) && !routesLocked}
                    showRoutePicker={
                      (prog || adminLike) &&
                      (!routesLocked || p.programmer_bucket === 'cnc' || p.programmer_bucket === 'torno')
                    }
                    busy={busy}
                    dragOver={dragOverPieceId === p.id}
                    photos={props.photos}
                    canUploadPhotos={props.canUploadPhotos}
                    photoUploadBusy={props.photoUploadBusy}
                    onUploadPhotos={props.onUploadPhotos}
                    pathDraft={
                      pathDraftByPiece[p.id] !== undefined ? pathDraftByPiece[p.id]! : (p.source_path ?? '')
                    }
                    onPathDraftChange={(v) => setPathDraftByPiece((m) => ({ ...m, [p.id]: v }))}
                    onSavePath={() => void saveManualPath(p.id)}
                    onClearPath={() => void clearSourcePath(p.id)}
                    onDragOver={(e) => {
                      if (busy || routesLocked) return
                      e.preventDefault()
                      e.dataTransfer.dropEffect = 'copy'
                      setDragOverPieceId(p.id)
                    }}
                    onDragLeave={() => setDragOverPieceId((id) => (id === p.id ? null : id))}
                    onDrop={(e) => {
                      e.preventDefault()
                      setDragOverPieceId(null)
                      if (busy || routesLocked) return
                      const path = readDroppedZipPath(e.dataTransfer)
                      if (path) void assignSourcePath(p.id, path)
                    }}
                    onSetBucket={(b) => void setBucket(p.id, b)}
                    onReload={props.onReload}
                  />
                </li>
              ))}
            </ul>
          )}
          </div>
        </section>
      )}

      {canSupervisorFinalizeBodegaProject(props.role) ? (
        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <h3 className="text-[14px] font-bold text-section-navy">Cierre del proyecto</h3>
          <p className="mt-2 text-[13px] text-slate-700">
            Cuando una pieza termina detallado (CNC) o se dirige a torno/perfilado/accesorios, sube su foto en
            la tarjeta de <strong>Piezas</strong> o en la pestaña <strong>Fotos</strong>. El supervisor finaliza
            el proyecto cuando todas tengan foto.
            {props.flowMeta?.project_finalized_at ? (
              <span className="mt-2 block text-slate-600">
                Ya finalizado {props.flowMeta.project_finalized_at.slice(0, 16)}.
              </span>
            ) : null}
          </p>
        </section>
      ) : null}
    </div>
  )
}
