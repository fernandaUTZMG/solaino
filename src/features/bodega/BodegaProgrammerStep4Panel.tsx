import { useCallback, useMemo, useState } from 'react'
import type { AppRole } from '../../lib/roles'
import { canManageBodegaLikeAdmin, canUploadBodegaMachine } from '../../lib/roles'
import type { ProgrammerBucket } from '../../lib/bodegaPiecesRepo'
import {
  assignDesignPathToAccesorios,
  updatePieceProgrammerBucket,
  updateProgrammingRoutesConfirmed,
  upsertPieceFromDesignPath,
} from '../../lib/bodegaPiecesRepo'
import { pieceDesignApproved } from '../../lib/bodegaDesignPieceReview'
import { findMatchingPdfPathForPart } from '../../lib/designZipPiecePairs'
import { pieceHasPlano } from '../../lib/bodegaPieceDesignDrawing'
import {
  canReassignProgrammerCncTorno,
  isSwPartsAssignmentComplete,
  piecesForAccesoriosBucket,
  piecesForCncModule,
  piecesForPerfiladoBucket,
  reassignProgrammerCncTornoBlockedReason,
} from '../../lib/bodegaProgrammerFlow'
import { pieceForZipPath } from '../../lib/bodegaXtAssemblies'
import type { BodegaProjectPieceRow } from '../../lib/bodegaPiecesRepo'
import {
  BODEGA_ZIP_ENTRY_DRAG_MIME,
  filterSwPartZipPaths,
  isAccesorioDesignZipPath,
  isZipPathAllowedForProgrammerBucket,
  labelFromZipPath,
} from '../../lib/zipDesignPackage'
import { pieceDisplayLabel } from '../../lib/bodegaStep3Supervisor'
import { displayLabelFromDesignPath } from '../../lib/designZipScope'
import { DesignPathIdentity } from './DesignPathIdentity.tsx'
import { progSeccionCnc, progTituloCnc } from './bodegaProgramacionUi.ts'

type ApprovedDesignZipInfo = {
  version: number
  zipFilename: string
  paths: string[]
  pathsLoading: boolean
  pathsError: string | null
}

const BODEGA_PIECE_DRAG_MIME = 'application/x-bodega-piece-id'

function readDroppedZipPath(dt: DataTransfer): string | null {
  const a = dt.getData(BODEGA_ZIP_ENTRY_DRAG_MIME).trim()
  if (a) return a
  return dt.getData('text/plain').trim() || null
}

function readDroppedPieceId(dt: DataTransfer): string | null {
  return dt.getData(BODEGA_PIECE_DRAG_MIME).trim() || null
}

function assignmentFilterQuery(raw: string): string {
  return raw.trim().toLowerCase()
}

function pathMatchesAssignmentFilter(path: string, q: string): boolean {
  if (!q) return true
  const display = displayLabelFromDesignPath(path).toLowerCase()
  return (
    path.toLowerCase().includes(q) ||
    labelFromZipPath(path).toLowerCase().includes(q) ||
    display.includes(q)
  )
}

function pieceMatchesAssignmentFilter(p: BodegaProjectPieceRow, q: string): boolean {
  if (!q) return true
  const label = p.label.toLowerCase()
  const path = (p.source_path ?? '').toLowerCase()
  const pathLabel = p.source_path ? displayLabelFromDesignPath(p.source_path).toLowerCase() : ''
  const finish = (p.finish_spec ?? '').toLowerCase()
  return label.includes(q) || path.includes(q) || pathLabel.includes(q) || finish.includes(q)
}

function assignmentCountLabel(filtered: number, total: number, q: string): string {
  if (q && filtered !== total) return `${filtered} de ${total}`
  return String(filtered)
}

type Props = {
  role: AppRole
  projectId: string
  projectFolio: string
  projectStatus: string
  pieces: BodegaProjectPieceRow[]
  routesLocked: boolean
  approvedDesign: ApprovedDesignZipInfo | null
  foldersConfirmed: boolean
  programmingDeliveryReady: boolean
  onReload: () => Promise<void>
  onRoutesConfirmed?: () => void
  /** Sin envoltorio de sección (dentro de BodegaProgramacionWorkspace). */
  embedded?: boolean
}

export function BodegaProgrammerStep4Panel(props: Props) {
  const prog = canUploadBodegaMachine(props.role)
  const adminLike = canManageBodegaLikeAdmin(props.role)
  const canEdit = prog || adminLike

  const designApproved = ['diseno_aprobado', 'diseno_parcial', 'en_programacion', 'revision_programacion'].includes(
    props.projectStatus,
  )

  const [pathFilter, setPathFilter] = useState('')
  const [dragOverBucket, setDragOverBucket] = useState<ProgrammerBucket | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [selectedPending, setSelectedPending] = useState<string[]>([])

  const zipPaths = props.approvedDesign?.paths ?? []
  const productionPartPaths = useMemo(
    () =>
      props.pieces
        .filter((p) => pieceDesignApproved(p) && p.source_path && filterSwPartZipPaths([p.source_path]).length > 0)
        .map((p) => p.source_path!),
    [props.pieces],
  )
  const partPaths = productionPartPaths
  const cncPieces = useMemo(() => piecesForCncModule(props.pieces, 'programacion'), [props.pieces])
  const tornoPieces = useMemo(() => piecesForCncModule(props.pieces, 'torno'), [props.pieces])
  const perfiladoPieces = useMemo(() => piecesForPerfiladoBucket(props.pieces), [props.pieces])
  const accesoriosPieces = useMemo(() => piecesForAccesoriosBucket(props.pieces), [props.pieces])

  const pendingPaths = useMemo(() => {
    return partPaths.filter((path) => {
      const piece = pieceForZipPath(props.pieces, path)
      return (
        piece?.programmer_bucket !== 'cnc' &&
        piece?.programmer_bucket !== 'torno' &&
        piece?.programmer_bucket !== 'perfilado' &&
        piece?.programmer_bucket !== 'accesorios'
      )
    })
  }, [partPaths, props.pieces])

  const pendingPathSet = useMemo(() => new Set(pendingPaths), [pendingPaths])
  /** Rutas ya confirmadas: solo se pueden asignar piezas que aún están pendientes (p. ej. nueva entrega de diseño). */
  const canAssign = canEdit && (!props.routesLocked || pendingPaths.length > 0)

  function mayAssignPath(zipPath: string): boolean {
    if (!canEdit) return false
    if (!props.routesLocked) return true
    return pendingPathSet.has(zipPath)
  }

  function assignmentBlockedReason(zipPath?: string): string | null {
    if (!canEdit) return 'No tienes permiso para asignar piezas en programación.'
    if (!props.routesLocked) return null
    if (pendingPaths.length === 0) return 'La asignación ya está confirmada.'
    if (zipPath && !pendingPathSet.has(zipPath)) return 'Esta pieza ya tiene destino asignado.'
    return null
  }

  const assignmentQuery = assignmentFilterQuery(pathFilter)

  const filterPaths = useCallback(
    (paths: string[]) => {
      if (!assignmentQuery) return paths
      return paths.filter((p) => pathMatchesAssignmentFilter(p, assignmentQuery))
    },
    [assignmentQuery],
  )

  const filterPieces = useCallback(
    (pieces: BodegaProjectPieceRow[]) => {
      if (!assignmentQuery) return pieces
      return pieces.filter((p) => pieceMatchesAssignmentFilter(p, assignmentQuery))
    },
    [assignmentQuery],
  )

  const filteredCncPieces = useMemo(() => filterPieces(cncPieces), [cncPieces, filterPieces])
  const filteredTornoPieces = useMemo(() => filterPieces(tornoPieces), [tornoPieces, filterPieces])
  const filteredPerfiladoPieces = useMemo(
    () => filterPieces(perfiladoPieces),
    [perfiladoPieces, filterPieces],
  )
  const filteredAccesoriosPieces = useMemo(
    () => filterPieces(accesoriosPieces),
    [accesoriosPieces, filterPieces],
  )

  const assignmentComplete = useMemo(
    () => isSwPartsAssignmentComplete(props.pieces),
    [props.pieces],
  )

  const showPanel =
    designApproved &&
    props.foldersConfirmed &&
    props.programmingDeliveryReady &&
    (prog || adminLike)

  if (!showPanel) return null

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

  function toggleSelectPending(path: string) {
    setSelectedPending((prev) => {
      if (prev.includes(path)) return prev.filter((p) => p !== path)
      return [...prev, path]
    })
  }

  function selectAllVisiblePending(paths: string[]) {
    setSelectedPending((prev) => {
      const s = new Set(prev)
      for (const p of paths) s.add(p)
      return Array.from(s)
    })
  }

  function clearSelection() {
    setSelectedPending([])
  }

  async function assignPathsToBucket(paths: string[], bucket: ProgrammerBucket) {
    const list = Array.from(new Set(paths)).filter(Boolean)
    if (list.length === 0) return
    if (!canAssign || list.some((p) => !mayAssignPath(p))) {
      setErr(assignmentBlockedReason(list.find((p) => !mayAssignPath(p)) ?? list[0]) ?? 'No se puede asignar.')
      return
    }
    if (list.some((p) => !isZipPathAllowedForProgrammerBucket(p, bucket))) {
      setErr('Solo piezas .PRT / .SLCPRT / .SLDPRT del diseño.')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      await withScrollRestore(async () => {
        for (const zipPath of list) {
          if (bucket === 'accesorios') {
            await assignDesignPathToAccesorios({
              projectId: props.projectId,
              projectFolio: props.projectFolio,
              sourcePath: zipPath,
            })
          } else {
            await upsertPieceFromDesignPath({
              projectId: props.projectId,
              sourcePath: zipPath,
              programmerBucket: bucket,
            })
          }
        }
        await props.onReload()
      })
      clearSelection()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se asignaron las piezas')
    } finally {
      setBusy(false)
    }
  }

  async function confirmAssignment() {
    if (props.routesLocked) return
    if (!(prog || adminLike)) return
    if (!assignmentComplete) {
      setErr('Asigna cada pieza a CNC, Torno, Perfilado o Accesorios (con su plano PDF, salvo accesorios).')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      await withScrollRestore(async () => {
        await updateProgrammingRoutesConfirmed(props.projectId)
        await props.onReload()
        props.onRoutesConfirmed?.()
      })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se confirmó la asignación')
    } finally {
      setBusy(false)
    }
  }

  function mayEditPieceInKanban(p: BodegaProjectPieceRow): boolean {
    if (!canEdit) return false
    if (!props.routesLocked) return true
    return canReassignProgrammerCncTorno(p)
  }

  async function reassignPieceBucket(pieceId: string, bucket: 'cnc' | 'torno') {
    const piece = props.pieces.find((p) => p.id === pieceId)
    if (!piece || !mayEditPieceInKanban(piece)) {
      if (piece && props.routesLocked) {
        setErr(reassignProgrammerCncTornoBlockedReason(piece) ?? 'No se puede cambiar esta pieza.')
      }
      return
    }
    setBusy(true)
    setErr(null)
    try {
      await withScrollRestore(async () => {
        await updatePieceProgrammerBucket({ pieceId, programmerBucket: bucket })
        await props.onReload()
      })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se cambió el destino')
    } finally {
      setBusy(false)
    }
  }

  async function movePieceToPending(pieceId: string) {
    if (props.routesLocked || !canEdit) return
    setBusy(true)
    setErr(null)
    try {
      await withScrollRestore(async () => {
        await updatePieceProgrammerBucket({ pieceId, programmerBucket: null })
        await props.onReload()
      })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se devolvió a pendientes')
    } finally {
      setBusy(false)
    }
  }

  async function assignPathToBucket(zipPath: string, bucket: ProgrammerBucket) {
    if (!mayAssignPath(zipPath)) {
      setErr(assignmentBlockedReason(zipPath) ?? 'No se puede asignar esta pieza.')
      return
    }
    if (!isZipPathAllowedForProgrammerBucket(zipPath, bucket)) {
      setErr('Solo piezas .PRT / .SLCPRT / .SLDPRT del diseño.')
      return
    }
    await assignPathsToBucket([zipPath], bucket)
  }

  async function movePerfiladoPieceToPending(pieceId: string) {
    if (props.routesLocked || !canEdit) return
    setBusy(true)
    setErr(null)
    try {
      await withScrollRestore(async () => {
        await updatePieceProgrammerBucket({ pieceId, programmerBucket: null })
        await props.onReload()
      })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se devolvió a pendientes')
    } finally {
      setBusy(false)
    }
  }

  async function moveAccesoriosPieceToPending(pieceId: string) {
    if (!canAssign) return
    setBusy(true)
    setErr(null)
    try {
      await withScrollRestore(async () => {
        await updatePieceProgrammerBucket({ pieceId, programmerBucket: null })
        await props.onReload()
      })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se devolvió a pendientes')
    } finally {
      setBusy(false)
    }
  }

  function renderAccesoriosColumn() {
    const isOver = dragOverBucket === 'accesorios'
    const allowDrop = canAssign && !busy
    return (
      <div
        className={[
          'flex min-h-[320px] flex-col rounded-2xl border-2 border-dashed p-3 sm:min-h-[420px] sm:p-4',
          isOver ? 'border-slate-500 bg-slate-100' : 'border-slate-300/90 bg-slate-50/50',
        ].join(' ')}
        onDragOver={(e) => {
          if (!allowDrop) return
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
          setDragOverBucket('accesorios')
        }}
        onDragLeave={() => setDragOverBucket((b) => (b === 'accesorios' ? null : b))}
        onDrop={(e) => {
          e.preventDefault()
          setDragOverBucket(null)
          if (!allowDrop) return
          const path = readDroppedZipPath(e.dataTransfer)
          if (path) void assignPathToBucket(path, 'accesorios')
        }}
      >
        <p className="mb-1 shrink-0 border-b border-slate-200/80 pb-2 text-[13px] font-bold text-slate-900">
          Accesorios ({assignmentCountLabel(filteredAccesoriosPieces.length, accesoriosPieces.length, assignmentQuery)})
        </p>
        <p className="mb-3 text-[11px] leading-snug text-slate-700">
          Piezas de la carpeta <strong>ACCESORIOS</strong> u otras que <strong>no llevan proceso</strong> (tornillos,
          tuercas, etc.).
        </p>
        <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {accesoriosPieces.length === 0 ? (
            <li className="rounded-lg border border-dashed border-slate-300/70 bg-white/60 px-3 py-6 text-center text-[12px] text-slate-500">
              Vacío
            </li>
          ) : filteredAccesoriosPieces.length === 0 ? (
            <li className="rounded-lg border border-dashed border-slate-300/70 bg-white/60 px-3 py-6 text-center text-[12px] text-slate-600">
              Ninguna coincide con «{pathFilter.trim()}».
            </li>
          ) : (
            filteredAccesoriosPieces.map((p) => (
              <li key={p.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
                {p.source_path ? (
                  <DesignPathIdentity path={p.source_path} compact />
                ) : (
                  <p className="font-semibold text-slate-900">{pieceDisplayLabel(p)}</p>
                )}
                <p className="mt-1 text-[11px] font-medium text-slate-600">Sin proceso de manufactura</p>
                {canAssign ? (
                  <button
                    type="button"
                    disabled={busy}
                    className="mt-2 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700"
                    onClick={() => void moveAccesoriosPieceToPending(p.id)}
                  >
                    ← Pendientes
                  </button>
                ) : null}
              </li>
            ))
          )}
        </ul>
      </div>
    )
  }

  function renderPerfiladoColumn() {
    const isOver = dragOverBucket === 'perfilado'
    const allowDrop = canAssign && !busy
    return (
      <div
        className={[
          'flex min-h-[320px] flex-col rounded-2xl border-2 border-dashed p-3 sm:min-h-[420px] sm:p-4',
          isOver ? 'border-programacion-600 bg-programacion-100' : 'border-programacion-300/90 bg-programacion-50/40',
        ].join(' ')}
        onDragOver={(e) => {
          if (!allowDrop) return
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
          setDragOverBucket('perfilado')
        }}
        onDragLeave={() => setDragOverBucket((b) => (b === 'perfilado' ? null : b))}
        onDrop={(e) => {
          e.preventDefault()
          setDragOverBucket(null)
          if (!allowDrop) return
          const path = readDroppedZipPath(e.dataTransfer)
          if (path) void assignPathToBucket(path, 'perfilado')
        }}
      >
        <p className="mb-1 shrink-0 border-b border-programacion-200/60 pb-2 text-[13px] font-bold text-programacion-950">
          Perfilado ({assignmentCountLabel(filteredPerfiladoPieces.length, perfiladoPieces.length, assignmentQuery)})
        </p>
        <p className="mb-3 text-[11px] leading-snug text-programacion-900/85">
          Sin programación CNC/Torno: al confirmar pasan a <strong>Taller → Perfilado</strong>.
        </p>
        <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {perfiladoPieces.length === 0 ? (
            <li className="rounded-lg border border-dashed border-programacion-300/70 bg-white/60 px-3 py-6 text-center text-[12px] text-slate-500">
              Vacío
            </li>
          ) : filteredPerfiladoPieces.length === 0 ? (
            <li className="rounded-lg border border-dashed border-programacion-300/70 bg-white/60 px-3 py-6 text-center text-[12px] text-slate-600">
              Ninguna coincide con «{pathFilter.trim()}».
            </li>
          ) : (
            filteredPerfiladoPieces.map((p) => (
              <li key={p.id} className="rounded-lg border border-programacion-200 bg-white px-3 py-2.5 shadow-sm">
                  {p.source_path ? (
                    <DesignPathIdentity path={p.source_path} compact />
                  ) : (
                    <p className="font-semibold text-slate-900">{pieceDisplayLabel(p)}</p>
                  )}
                  <p className="mt-1 text-[11px] text-programacion-900">
                    Plano:{' '}
                  {pieceHasPlano(p, zipPaths) ? (
                    <span className="font-semibold text-emerald-800">sí</span>
                  ) : (
                    <span className="font-semibold text-amber-800">falta — súbelo en Diseño</span>
                  )}
                </p>
                {!props.routesLocked && canEdit ? (
                  <button
                    type="button"
                    disabled={busy}
                    className="mt-2 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700"
                    onClick={() => void movePerfiladoPieceToPending(p.id)}
                  >
                    ← Pendientes
                  </button>
                ) : null}
              </li>
            ))
          )}
        </ul>
      </div>
    )
  }

  function renderBucketColumn(
    bucket: 'cnc' | 'torno',
    title: string,
    assigned: BodegaProjectPieceRow[],
    filteredAssigned: BodegaProjectPieceRow[],
    accent: string,
  ) {
    const isOver = dragOverBucket === bucket
    const otherBucket: 'cnc' | 'torno' = bucket === 'cnc' ? 'torno' : 'cnc'
    const allowDrop = canEdit && !busy
    return (
      <div
        className={[
          'flex min-h-[320px] flex-col rounded-2xl border-2 border-dashed p-3 sm:min-h-[420px] sm:p-4',
          isOver ? 'border-programacion-500 bg-programacion-50' : accent,
        ].join(' ')}
        onDragOver={(e) => {
          if (!allowDrop || busy) return
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
          setDragOverBucket(bucket)
        }}
        onDragLeave={() => setDragOverBucket((b) => (b === bucket ? null : b))}
        onDrop={(e) => {
          e.preventDefault()
          setDragOverBucket(null)
          if (!allowDrop || busy) return
          const pieceId = readDroppedPieceId(e.dataTransfer)
          if (pieceId) {
            void reassignPieceBucket(pieceId, bucket)
            return
          }
          if (!canAssign) return
          const path = readDroppedZipPath(e.dataTransfer)
          if (path) void assignPathToBucket(path, bucket)
        }}
      >
        <p className="mb-3 shrink-0 border-b border-programacion-200/60 pb-2 text-[13px] font-bold text-programacion-950">
          {title} ({assignmentCountLabel(filteredAssigned.length, assigned.length, assignmentQuery)})
        </p>
        <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {assigned.length === 0 ? (
            <li className="rounded-lg border border-dashed border-programacion-300/70 bg-white/60 px-3 py-6 text-center text-[12px] text-slate-500">
              Vacío
            </li>
          ) : filteredAssigned.length === 0 ? (
            <li className="rounded-lg border border-dashed border-programacion-300/70 bg-white/60 px-3 py-6 text-center text-[12px] text-slate-600">
              Ninguna coincide con «{pathFilter.trim()}».
            </li>
          ) : (
            filteredAssigned.map((p) => {
              const editable = mayEditPieceInKanban(p)
              const blocked = props.routesLocked ? reassignProgrammerCncTornoBlockedReason(p) : null
              return (
                <li
                  key={p.id}
                  draggable={editable && !busy}
                  onDragStart={(e) => {
                    e.dataTransfer.setData(BODEGA_PIECE_DRAG_MIME, p.id)
                    e.dataTransfer.effectAllowed = 'move'
                  }}
                  className="rounded-lg border border-programacion-200 bg-white px-3 py-2.5 shadow-sm"
                >
                  {p.source_path ? (
                    <DesignPathIdentity path={p.source_path} compact />
                  ) : (
                    <p className="font-semibold text-slate-900">{pieceDisplayLabel(p)}</p>
                  )}
                  <p className="mt-1 text-[11px] text-slate-600">
                    Acabado: <span className="font-medium">{p.finish_spec ?? '—'}</span>
                  </p>
                  {editable ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        disabled={busy || p.programmer_bucket === otherBucket}
                        className={[
                          'rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-white disabled:opacity-50',
                          otherBucket === 'cnc' ? 'bg-programacion-600' : 'bg-programacion-700',
                        ].join(' ')}
                        onClick={() => void reassignPieceBucket(p.id, otherBucket)}
                      >
                        → {otherBucket === 'cnc' ? 'CNC' : 'Torno'}
                      </button>
                      {!props.routesLocked ? (
                        <button
                          type="button"
                          disabled={busy}
                          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          onClick={() => void movePieceToPending(p.id)}
                        >
                          ← Pendientes
                        </button>
                      ) : null}
                    </div>
                  ) : blocked ? (
                    <p className="mt-2 text-[10px] leading-snug text-amber-900">{blocked}</p>
                  ) : null}
                </li>
              )
            })
          )}
        </ul>
      </div>
    )
  }

  const filteredPending = filterPaths(pendingPaths)
  const selectedVisibleCount = filteredPending.filter((p) => selectedPending.includes(p)).length

  const inner = (
      <div className={props.embedded ? 'space-y-5' : 'space-y-5 p-4 sm:p-6'}>
        {err ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-900">{err}</div>
        ) : null}

        {props.routesLocked && pendingPaths.length > 0 ? (
          <p className="rounded-xl border border-amber-300/90 bg-amber-50 px-4 py-3 text-[13px] leading-relaxed text-amber-950">
            <strong>Hay {pendingPaths.length} pieza(s) nueva(s) sin destino.</strong> La asignación general ya está
            confirmada, pero puedes enviar estas piezas pendientes a CNC, Torno, Perfilado o Accesorios.
          </p>
        ) : null}
        {props.routesLocked ? (
          <p className="rounded-xl border border-programacion-200/90 bg-programacion-50/70 px-4 py-3 text-[13px] leading-relaxed text-programacion-950">
            <strong>CNC / Torno:</strong> programación con plano PDF, luego «Terminar → Perfilado» (taller) o «sin
            perfilado» (maquinado). <strong>Perfilado:</strong> van a <strong>Taller → Perfilado</strong>.{' '}
            <strong>Accesorios:</strong> sin proceso (carpeta ACCESORIOS del diseño).
          </p>
        ) : (
          <p className="rounded-xl border border-programacion-200/80 bg-programacion-50/60 px-4 py-3 text-[13px] text-programacion-950">
            Cada pieza debe tener su <strong>plano PDF</strong> (carpeta de diseño o adjunto en Diseño), excepto
            accesorios. Asigna destino por pieza antes de confirmar.
          </p>
        )}

        <input
          type="search"
          value={pathFilter}
          onChange={(e) => setPathFilter(e.target.value)}
          placeholder="Buscar en todas las columnas (ej. base, jaladera)…"
          className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-[14px] shadow-sm focus:border-programacion-400 focus:outline-none focus:ring-2 focus:ring-programacion-200/60"
          disabled={props.approvedDesign?.pathsLoading}
          autoComplete="off"
        />
        {assignmentQuery ? (
          <p className="text-[12px] font-medium text-programacion-900">
            Filtro activo — Pendientes: {filteredPending.length}, CNC: {filteredCncPieces.length}, Torno:{' '}
            {filteredTornoPieces.length}, Perfilado: {filteredPerfiladoPieces.length}, Accesorios:{' '}
            {filteredAccesoriosPieces.length}
          </p>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
          <div className="flex min-h-[320px] flex-col rounded-2xl border-2 border-dashed border-programacion-200 bg-programacion-50/40 p-3 sm:min-h-[420px] sm:p-4">
            <div className="shrink-0 border-b border-programacion-200/80 pb-3">
              <p className="text-[13px] font-bold uppercase text-programacion-950">
                Pendientes (
                {assignmentCountLabel(filteredPending.length, pendingPaths.length, assignmentQuery)})
              </p>
              {canAssign ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-semibold text-programacion-900">
                    Seleccionadas: {selectedPending.length}
                    {selectedVisibleCount > 0 ? (
                      <span className="text-programacion-800/80"> (visibles: {selectedVisibleCount})</span>
                    ) : null}
                  </span>
                  <button
                    type="button"
                    disabled={busy || filteredPending.length === 0}
                    className="rounded-lg border border-programacion-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-programacion-950 disabled:opacity-50"
                    onClick={() => selectAllVisiblePending(filteredPending)}
                  >
                    Seleccionar visibles
                  </button>
                  <button
                    type="button"
                    disabled={busy || selectedPending.length === 0}
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 disabled:opacity-50"
                    onClick={() => clearSelection()}
                  >
                    Limpiar
                  </button>
                </div>
              ) : null}
              {canAssign && selectedPending.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    className="rounded-lg bg-programacion-600 px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
                    onClick={() => void assignPathsToBucket(selectedPending, 'cnc')}
                  >
                    Enviar seleccionadas → CNC
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className="rounded-lg bg-programacion-700 px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
                    onClick={() => void assignPathsToBucket(selectedPending, 'torno')}
                  >
                    Enviar seleccionadas → Torno
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className="rounded-lg bg-programacion-800 px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
                    onClick={() => void assignPathsToBucket(selectedPending, 'perfilado')}
                  >
                    Enviar seleccionadas → Perfilado
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className="rounded-lg bg-slate-600 px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
                    onClick={() => void assignPathsToBucket(selectedPending, 'accesorios')}
                  >
                    Enviar seleccionadas → Accesorios
                  </button>
                </div>
              ) : null}
            </div>
            <ul className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {filteredPending.length === 0 ? (
                <li className="rounded-lg bg-white/80 px-3 py-6 text-center text-[12px] text-slate-600">
                  {partPaths.length === 0
                    ? 'No hay .PRT ni .SLCPRT en el ZIP.'
                    : assignmentQuery && pendingPaths.length > 0
                      ? `Ninguna pendiente coincide con «${pathFilter.trim()}».`
                      : 'Todas las piezas ya tienen destino.'}
                </li>
              ) : (
                filteredPending.map((path) => (
                  <li
                    key={path}
                    draggable={canAssign && !busy}
                    onDragStart={(e) => {
                      e.dataTransfer.setData(BODEGA_ZIP_ENTRY_DRAG_MIME, path)
                      e.dataTransfer.setData('text/plain', path)
                      e.dataTransfer.effectAllowed = 'copy'
                    }}
                    className="rounded-lg border border-programacion-200/90 bg-white p-2.5 shadow-sm"
                  >
                    {canAssign ? (
                      <label className="mb-2 flex select-none items-center gap-2 text-[11px] font-semibold text-slate-700">
                        <input
                          type="checkbox"
                          checked={selectedPending.includes(path)}
                          disabled={busy}
                          onChange={() => toggleSelectPending(path)}
                        />
                        Seleccionar
                      </label>
                    ) : null}
                    <DesignPathIdentity path={path} compact />
                    {isAccesorioDesignZipPath(path) ? (
                      <p className="mt-1 text-[10px] font-semibold text-slate-600">
                        Carpeta accesorios — suele ir a <strong>Accesorios</strong>
                      </p>
                    ) : null}
                    {(() => {
                      const piece = pieceForZipPath(props.pieces, path)
                      const pdfPath = findMatchingPdfPathForPart(path, zipPaths)
                      const hasPdf =
                        Boolean(pdfPath) ||
                        Boolean(piece?.design_drawing_storage_path && piece.design_drawing_name)
                      return (
                        <p className="mt-1 text-[11px]">
                          Plano:{' '}
                          {hasPdf ? (
                            <span className="font-semibold text-emerald-800">sí</span>
                          ) : (
                            <span className="font-semibold text-amber-800">falta</span>
                          )}
                        </p>
                      )
                    })()}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        disabled={busy || !mayAssignPath(path)}
                        className="rounded-lg bg-programacion-600 px-2.5 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
                        onClick={() => void assignPathToBucket(path, 'cnc')}
                      >
                        → CNC
                      </button>
                      <button
                        type="button"
                        disabled={busy || !mayAssignPath(path)}
                        className="rounded-lg bg-programacion-700 px-2.5 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
                        onClick={() => void assignPathToBucket(path, 'torno')}
                      >
                        → Torno
                      </button>
                      <button
                        type="button"
                        disabled={busy || !mayAssignPath(path)}
                        className="rounded-lg bg-programacion-800 px-2.5 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
                        onClick={() => void assignPathToBucket(path, 'perfilado')}
                      >
                        → Perfilado
                      </button>
                      <button
                        type="button"
                        disabled={busy || !mayAssignPath(path)}
                        className="rounded-lg bg-slate-600 px-2.5 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
                        onClick={() => void assignPathToBucket(path, 'accesorios')}
                      >
                        → Accesorios
                      </button>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </div>

          {renderBucketColumn(
            'cnc',
            'CNC',
            cncPieces,
            filteredCncPieces,
            'border-programacion-300/90 bg-programacion-50/40',
          )}
          {renderBucketColumn(
            'torno',
            'Torno',
            tornoPieces,
            filteredTornoPieces,
            'border-programacion-400/90 bg-programacion-100/35',
          )}
          {renderPerfiladoColumn()}
          {renderAccesoriosColumn()}
        </div>

        <div className="rounded-xl border border-programacion-300/80 bg-programacion-50/80 p-4 sm:p-5">
          <p className="text-[14px] font-semibold text-programacion-950">
            Progreso: {partPaths.length - pendingPaths.length} / {partPaths.length} piezas asignadas
          </p>
          <p className="mt-1 text-[12px] text-programacion-900">
            CNC {cncPieces.length} · Torno {tornoPieces.length} · Perfilado {perfiladoPieces.length} · Accesorios{' '}
            {accesoriosPieces.length} · Pendientes {pendingPaths.length}
          </p>
          {props.routesLocked ? (
            <p className="mt-3 text-[13px] font-medium text-emerald-900">
              {pendingPaths.length > 0
                ? `Asignación confirmada. Faltan ${pendingPaths.length} pieza(s) por definir destino.`
                : 'Asignación confirmada. Usa los botones en cada columna si necesitas corregir.'}
            </p>
          ) : (
            <button
              type="button"
              disabled={busy || !assignmentComplete}
              title={!assignmentComplete ? 'Asigna cada pieza a CNC, Torno, Perfilado o Accesorios' : undefined}
              className="mt-4 min-h-[48px] w-full rounded-xl bg-programacion-600 px-5 py-3 text-[14px] font-bold text-white shadow-sm disabled:opacity-50 sm:w-auto"
              onClick={() => void confirmAssignment()}
            >
              {busy ? 'Confirmando…' : 'Confirmar asignación'}
            </button>
          )}
        </div>
      </div>
  )

  if (props.embedded) return inner

  return (
    <section className={progSeccionCnc}>
      <h3 className={progTituloCnc}>
        {props.routesLocked
          ? 'Asignación CNC / Torno / Perfilado / Accesorios (confirmada)'
          : 'Asignar piezas — CNC, Torno, Perfilado o Accesorios'}
      </h3>
      {inner}
    </section>
  )
}
