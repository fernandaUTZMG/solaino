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

const DESTINOS: { id: ProgrammerBucket; label: string; hint: string }[] = [
  { id: 'cnc', label: 'CNC', hint: 'Se programa en oficina' },
  { id: 'torno', label: 'Torno', hint: 'Se programa para torno' },
  { id: 'perfilado', label: 'Perfiladora', hint: 'Va a taller, sin programa' },
  { id: 'accesorios', label: 'Accesorio', hint: 'Sin proceso' },
]

function destinoLabel(id: ProgrammerBucket | null | undefined): string {
  return DESTINOS.find((d) => d.id === id)?.label ?? 'Sin destino'
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

function DestinoButtons(props: {
  current?: ProgrammerBucket | null
  disabled?: boolean
  allowed?: ProgrammerBucket[]
  onPick: (bucket: ProgrammerBucket) => void
}) {
  const allowed = props.allowed ?? DESTINOS.map((d) => d.id)
  return (
    <div className="flex flex-wrap gap-1.5">
      {DESTINOS.map((d) => {
        const active = props.current === d.id
        const ok = allowed.includes(d.id)
        return (
          <button
            key={d.id}
            type="button"
            disabled={props.disabled || !ok}
            title={d.hint}
            className={[
              'min-h-[36px] rounded-lg px-3 py-1.5 text-[12px] font-bold transition disabled:cursor-not-allowed disabled:opacity-40',
              active
                ? 'bg-section-navy text-white shadow-sm'
                : 'border border-slate-300 bg-white text-slate-800 hover:border-section-navy hover:bg-sky-50',
            ].join(' ')}
            onClick={() => props.onPick(d.id)}
          >
            {d.label}
          </button>
        )
      })}
    </div>
  )
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
  const partPaths = useMemo(() => {
    const fromZip = filterSwPartZipPaths(zipPaths)
    if (fromZip.length === 0) return productionPartPaths
    const seen = new Set(fromZip.map((p) => p.toLowerCase()))
    const extra = productionPartPaths.filter((p) => !seen.has(p.toLowerCase()))
    return extra.length === 0 ? fromZip : [...fromZip, ...extra]
  }, [zipPaths, productionPartPaths])
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

  const filteredPending = filterPaths(pendingPaths)
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

  const assignedGroups: { id: ProgrammerBucket; pieces: BodegaProjectPieceRow[]; filtered: BodegaProjectPieceRow[] }[] = [
    { id: 'cnc', pieces: cncPieces, filtered: filteredCncPieces },
    { id: 'torno', pieces: tornoPieces, filtered: filteredTornoPieces },
    { id: 'perfilado', pieces: perfiladoPieces, filtered: filteredPerfiladoPieces },
    { id: 'accesorios', pieces: accesoriosPieces, filtered: filteredAccesoriosPieces },
  ]

  const assignmentComplete = useMemo(
    () => isSwPartsAssignmentComplete(props.pieces, zipPaths),
    [props.pieces, zipPaths],
  )

  const assignedCount = partPaths.length - pendingPaths.length
  const progressPct = partPaths.length === 0 ? 0 : Math.round((assignedCount / partPaths.length) * 100)

  const showPanel = designApproved && props.foldersConfirmed && (prog || adminLike)
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
      setErr('Solo piezas del ensamble de diseño (.x_t o .PRT).')
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
      setErr('Asigna cada pieza a CNC, Torno, Perfiladora o Accesorio.')
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

  function mayEditAssignedPiece(p: BodegaProjectPieceRow): boolean {
    if (!canEdit) return false
    if (!props.routesLocked) return true
    return canReassignProgrammerCncTorno(p)
  }

  function allowedDestinosForPiece(p: BodegaProjectPieceRow): ProgrammerBucket[] {
    if (!props.routesLocked) return DESTINOS.map((d) => d.id)
    if (canReassignProgrammerCncTorno(p)) return ['cnc', 'torno']
    return p.programmer_bucket ? [p.programmer_bucket] : []
  }

  async function changeAssignedPiece(p: BodegaProjectPieceRow, bucket: ProgrammerBucket) {
    if (p.programmer_bucket === bucket) return
    if (!mayEditAssignedPiece(p) && props.routesLocked) {
      setErr(reassignProgrammerCncTornoBlockedReason(p) ?? 'No se puede cambiar esta pieza.')
      return
    }
    if (!props.routesLocked && p.source_path && mayAssignPath(p.source_path)) {
      await assignPathsToBucket([p.source_path], bucket)
      return
    }
    if (bucket !== 'cnc' && bucket !== 'torno') {
      if (p.source_path) await assignPathsToBucket([p.source_path], bucket)
      return
    }
    setBusy(true)
    setErr(null)
    try {
      await withScrollRestore(async () => {
        await updatePieceProgrammerBucket({ pieceId: p.id, programmerBucket: bucket })
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

  const inner = (
    <div className={props.embedded ? 'space-y-5' : 'space-y-5 p-4 sm:p-6'}>
      {err ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-900">{err}</div>
      ) : null}

      {props.routesLocked && pendingPaths.length > 0 ? (
        <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] text-amber-950">
          Hay <strong>{pendingPaths.length} pieza(s)</strong> nueva(s) sin destino. Asígnale CNC, torno, perfiladora o
          accesorio.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {DESTINOS.map((d) => (
          <div key={d.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
            <p className="text-[12px] font-bold text-section-navy">{d.label}</p>
            <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{d.hint}</p>
          </div>
        ))}
      </div>

      <div>
        <div className="mb-2 flex items-end justify-between gap-3">
          <p className="text-[13px] font-semibold text-section-navy">
            {assignedCount} de {partPaths.length} piezas con destino
          </p>
          <p className="font-mono text-[12px] tabular-nums text-slate-500">{progressPct}%</p>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-section-navy transition-all" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      <input
        type="search"
        value={pathFilter}
        onChange={(e) => setPathFilter(e.target.value)}
        placeholder="Buscar pieza…"
        className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-[14px] shadow-sm focus:border-section-navy/40 focus:outline-none focus:ring-2 focus:ring-section-navy/20"
        disabled={props.approvedDesign?.pathsLoading}
        autoComplete="off"
      />

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div>
            <p className="text-[14px] font-bold text-section-navy">1. Piezas sin destino</p>
            <p className="text-[12px] text-slate-500">Elige a dónde va cada una.</p>
          </div>
          <span className="rounded-lg bg-section-navy px-2.5 py-1 text-[12px] font-bold text-white">
            {filteredPending.length}
            {assignmentQuery && filteredPending.length !== pendingPaths.length ? ` de ${pendingPaths.length}` : ''}
          </span>
        </div>

        {canAssign && selectedPending.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-sky-200 bg-sky-50 px-4 py-3">
            <p className="text-[12px] font-semibold text-slate-800">
              {selectedPending.length} seleccionada{selectedPending.length === 1 ? '' : 's'} →
            </p>
            <DestinoButtons disabled={busy} onPick={(b) => void assignPathsToBucket(selectedPending, b)} />
            <button
              type="button"
              className="text-[12px] font-semibold text-slate-600 underline"
              onClick={() => clearSelection()}
            >
              Quitar selección
            </button>
          </div>
        ) : canAssign && filteredPending.length > 1 ? (
          <div className="border-b border-slate-100 px-4 py-2">
            <button
              type="button"
              disabled={busy}
              className="text-[12px] font-semibold text-section-navy hover:underline disabled:opacity-50"
              onClick={() => selectAllVisiblePending(filteredPending)}
            >
              Seleccionar todas para enviar juntas
            </button>
          </div>
        ) : null}

        {filteredPending.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-slate-500">
            {partPaths.length === 0
              ? 'No hay piezas en el ensamble .x_t.'
              : assignmentQuery && pendingPaths.length > 0
                ? `Ninguna pendiente coincide con «${pathFilter.trim()}».`
                : 'Todas las piezas ya tienen destino.'}
          </p>
        ) : (
          <ol>
            {filteredPending.map((path, i) => {
              const selected = selectedPending.includes(path)
              return (
                <li
                  key={path}
                  className={[
                    'flex flex-col gap-3 border-b border-slate-100 px-4 py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between',
                    i % 2 === 0 ? 'bg-white' : 'bg-slate-50/70',
                    selected ? 'ring-2 ring-inset ring-section-navy/25' : '',
                  ].join(' ')}
                >
                  <div className="flex min-w-0 items-start gap-3">
                    {canAssign && filteredPending.length > 1 ? (
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 accent-section-navy"
                        checked={selected}
                        disabled={busy}
                        onChange={() => toggleSelectPending(path)}
                        aria-label={`Seleccionar ${displayLabelFromDesignPath(path)}`}
                      />
                    ) : null}
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-section-navy/10 text-[11px] font-bold text-section-navy">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <DesignPathIdentity path={path} compact />
                      {isAccesorioDesignZipPath(path) ? (
                        <p className="mt-1 text-[11px] text-slate-500">Suele ir a Accesorio</p>
                      ) : null}
                    </div>
                  </div>
                  {canAssign ? (
                    <DestinoButtons
                      disabled={busy || !mayAssignPath(path)}
                      onPick={(b) => void assignPathsToBucket([path], b)}
                    />
                  ) : null}
                </li>
              )
            })}
          </ol>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-[14px] font-bold text-section-navy">2. Ya asignadas</p>
          <p className="text-[12px] text-slate-500">Revisa o cambia el destino si te equivocaste.</p>
        </div>
        {assignedCount === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-slate-500">Todavía no hay piezas asignadas.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {assignedGroups.map((g) =>
              g.pieces.length === 0 ? null : (
                <div key={g.id} className="px-4 py-3">
                  <p className="mb-2 text-[12px] font-bold uppercase tracking-wide text-section-navy">
                    {destinoLabel(g.id)} · {g.filtered.length}
                    {assignmentQuery && g.filtered.length !== g.pieces.length ? ` de ${g.pieces.length}` : ''}
                  </p>
                  {g.filtered.length === 0 ? (
                    <p className="text-[12px] text-slate-500">Ninguna coincide con el buscador.</p>
                  ) : (
                    <ul className="space-y-2">
                      {g.filtered.map((p) => {
                        const editable = mayEditAssignedPiece(p)
                        const blocked = props.routesLocked ? reassignProgrammerCncTornoBlockedReason(p) : null
                        return (
                          <li
                            key={p.id}
                            className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="min-w-0">
                              {p.source_path ? (
                                <DesignPathIdentity path={p.source_path} compact />
                              ) : (
                                <p className="font-semibold text-slate-900">{pieceDisplayLabel(p)}</p>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              {editable ? (
                                <DestinoButtons
                                  current={p.programmer_bucket}
                                  disabled={busy}
                                  allowed={allowedDestinosForPiece(p)}
                                  onPick={(b) => void changeAssignedPiece(p, b)}
                                />
                              ) : (
                                <span className="rounded-lg bg-section-navy px-2.5 py-1 text-[11px] font-bold text-white">
                                  {destinoLabel(p.programmer_bucket)}
                                </span>
                              )}
                              {!props.routesLocked && canEdit ? (
                                <button
                                  type="button"
                                  disabled={busy}
                                  className="rounded-lg border border-rose-300 bg-rose-600 px-2.5 py-1.5 text-[11px] font-bold text-white shadow-sm hover:bg-rose-700 disabled:opacity-50"
                                  onClick={() => void movePieceToPending(p.id)}
                                >
                                  Quitar
                                </button>
                              ) : blocked && !editable ? (
                                <p className="text-[10px] text-amber-900">{blocked}</p>
                              ) : null}
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              ),
            )}
          </div>
        )}
      </section>

      <div className="rounded-xl border border-slate-300 bg-white p-4 sm:flex sm:items-center sm:justify-between sm:gap-4">
        <p className="text-[13px] text-slate-600">
          {props.routesLocked
            ? pendingPaths.length > 0
              ? `Asignación confirmada. Faltan ${pendingPaths.length} pieza(s).`
              : 'Asignación confirmada.'
            : 'Cuando todas tengan destino, confirma para seguir a programar.'}
        </p>
        {props.routesLocked ? null : (
          <button
            type="button"
            disabled={busy || !assignmentComplete}
            title={!assignmentComplete ? 'Asigna cada pieza a un destino' : undefined}
            className="mt-3 min-h-[48px] w-full rounded-xl bg-section-navy px-5 py-3 text-[14px] font-bold text-white shadow-sm disabled:opacity-50 sm:mt-0 sm:w-auto"
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
        {props.routesLocked ? 'Asignación confirmada' : 'Asignar piezas'}
      </h3>
      {inner}
    </section>
  )
}
