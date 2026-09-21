import { useMemo, useState } from 'react'
import type { AppRole } from '../../lib/roles'
import { canManageBodegaLikeAdmin, canUploadBodegaDesign } from '../../lib/roles'
import type { ProgrammerBucket } from '../../lib/bodegaPiecesRepo'
import {
  assignDesignPathToAccesorios,
  insertProjectPiece,
  updatePieceProgrammerBucket,
  updateProgrammingRoutesConfirmed,
  upsertPieceFromDesignPath,
} from '../../lib/bodegaPiecesRepo'
import { isSwPartsAssignmentComplete } from '../../lib/bodegaProgrammerFlow'
import { pieceForZipPath } from '../../lib/bodegaXtAssemblies'
import type { BodegaProjectPieceRow } from '../../lib/bodegaPiecesRepo'
import { filterSwPartZipPaths, isZipPathAllowedForProgrammerBucket } from '../../lib/zipDesignPackage'
import { pieceDisplayLabel } from '../../lib/bodegaStep3Supervisor'
import { displayLabelFromDesignPath } from '../../lib/designZipScope'
import { expectedPlanoFileName, fileRenamedToExpectedPlano } from '../../lib/designPlanoNaming'
import { applyDesignPlanosAutoAssign } from '../../lib/bodegaDesignPlanosAutoAssign'
import { pieceHasPlano } from '../../lib/bodegaPieceDesignDrawing'
import { withDeliveryScrollRestore } from './useBodegaPieceQueueBulk.ts'
import { DesignPathIdentity } from './DesignPathIdentity.tsx'
import { BodegaPiecePlanoAttach } from './BodegaPiecePlanoAttach.tsx'

const DESTINO_INFO: { id: ProgrammerBucket; label: string; hint: string }[] = [
  { id: 'cnc', label: 'CNC', hint: 'Sin plano · programa y maquina' },
  { id: 'torno', label: 'Torno', hint: 'Con plano · sin tiempo' },
  { id: 'perfilado', label: 'Perfiladora', hint: 'Con plano · sin tiempo' },
  { id: 'accesorios', label: 'Accesorio', hint: 'Sin plano · sin tiempo' },
]

function countBucket(pieces: BodegaProjectPieceRow[], bucket: ProgrammerBucket): number {
  return pieces.filter((p) => p.programmer_bucket === bucket).length
}

function pathMatchesSearch(path: string, query: string): boolean {
  const needle = query
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  if (!needle) return true
  const label = displayLabelFromDesignPath(path)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  const raw = path.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return label.includes(needle) || raw.includes(needle)
}

function hasBucket(p: BodegaProjectPieceRow | undefined): boolean {
  return (
    p?.programmer_bucket === 'cnc' ||
    p?.programmer_bucket === 'torno' ||
    p?.programmer_bucket === 'perfilado' ||
    p?.programmer_bucket === 'accesorios'
  )
}

type Props = {
  role: AppRole
  projectId: string
  projectFolio: string
  pieces: BodegaProjectPieceRow[]
  designPaths: string[]
  routesLocked: boolean
  /** El encargado ya confirmó diseño (+ planos). Sin esto no se pueden separar piezas. */
  designConfirmed?: boolean
  onReload: () => Promise<void>
  onConfirmed?: () => void | Promise<void>
}

export function BodegaDisenoDestinosPanel(props: Props) {
  const canEditRole = canUploadBodegaDesign(props.role) || canManageBodegaLikeAdmin(props.role)
  const designConfirmed = props.designConfirmed !== false
  const canEdit = canEditRole && designConfirmed
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)
  const [sinPlanoSearch, setSinPlanoSearch] = useState('')

  async function reloadKeepingScroll() {
    await withDeliveryScrollRestore(() => props.onReload())
  }

  const partPaths = useMemo(() => {
    const fromDesign = filterSwPartZipPaths(props.designPaths)
    if (fromDesign.length > 0) return fromDesign
    return props.pieces
      .map((p) => p.source_path)
      .filter((p): p is string => Boolean(p && filterSwPartZipPaths([p]).length > 0))
  }, [props.designPaths, props.pieces])

  const pendingWithPlano = useMemo(() => {
    return partPaths.filter((path) => {
      const piece = pieceForZipPath(props.pieces, path)
      return !hasBucket(piece) && piece != null && pieceHasPlano(piece, props.designPaths)
    })
  }, [partPaths, props.pieces, props.designPaths])

  const pendingSinPlano = useMemo(() => {
    return partPaths.filter((path) => {
      const piece = pieceForZipPath(props.pieces, path)
      if (hasBucket(piece)) return false
      if (!piece) return true
      return !pieceHasPlano(piece, props.designPaths)
    })
  }, [partPaths, props.pieces, props.designPaths])

  const cncSinPlanoPaths = useMemo(() => {
    return partPaths.filter((path) => {
      const piece = pieceForZipPath(props.pieces, path)
      return piece?.programmer_bucket === 'cnc' && !pieceHasPlano(piece, props.designPaths)
    })
  }, [partPaths, props.pieces, props.designPaths])

  const filteredPendingSinPlano = useMemo(
    () => pendingSinPlano.filter((p) => pathMatchesSearch(p, sinPlanoSearch)),
    [pendingSinPlano, sinPlanoSearch],
  )

  const filteredCncForAccesorio = useMemo(
    () => cncSinPlanoPaths.filter((p) => pathMatchesSearch(p, sinPlanoSearch)),
    [cncSinPlanoPaths, sinPlanoSearch],
  )

  const assignmentComplete = useMemo(
    () => isSwPartsAssignmentComplete(props.pieces, partPaths),
    [props.pieces, partPaths],
  )

  if (!canEdit && partPaths.length === 0) return null

  async function ensurePiece(path: string): Promise<BodegaProjectPieceRow | null> {
    const existing = pieceForZipPath(props.pieces, path)
    if (existing) return existing
    await insertProjectPiece({
      projectId: props.projectId,
      label: displayLabelFromDesignPath(path),
      sourcePath: path,
    })
    await reloadKeepingScroll()
    return null
  }

  async function onBulkPlanos(files: FileList | File[]) {
    if (!canEdit || props.routesLocked) return
    const list = Array.from(files).filter((f) => f.name.toLowerCase().endsWith('.pdf'))
    if (list.length === 0) {
      setErr('Elige archivos PDF.')
      return
    }
    setBusy(true)
    setErr(null)
    setOkMsg(null)
    try {
      const result = await withDeliveryScrollRestore(async () => {
        const linked = await applyDesignPlanosAutoAssign({
          projectId: props.projectId,
          projectFolio: props.projectFolio,
          pieceNames: partPaths,
          planos: list,
        })
        await props.onReload()
        return linked
      })
      const parts: string[] = []
      if (result.linked.length > 0) {
        parts.push(`${result.linked.length} plano(s) vinculados`)
      }
      if (result.unmatched.length > 0) {
        parts.push(`sin coincidencia de nombre: ${result.unmatched.join(', ')}`)
      }
      setOkMsg(parts.join('. ') || 'Listo.')
      if (result.linked.length === 0 && result.unmatched.length > 0) {
        setErr(`No se vinculó ningún plano. Detalle: ${result.unmatched.join(' · ')}`)
      } else if (result.unmatched.length > 0) {
        setErr(`Algunos no se vincularon: ${result.unmatched.join(' · ')}`)
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudieron vincular los planos')
    } finally {
      setBusy(false)
    }
  }

  async function assignPath(path: string, bucket: ProgrammerBucket) {
    if (!canEdit || props.routesLocked) return
    if (!isZipPathAllowedForProgrammerBucket(path, bucket)) {
      setErr('Solo piezas del ensamble .x_t.')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      await withDeliveryScrollRestore(async () => {
        if (bucket === 'accesorios') {
          await assignDesignPathToAccesorios({
            projectId: props.projectId,
            projectFolio: props.projectFolio,
            sourcePath: path,
          })
        } else {
          await upsertPieceFromDesignPath({
            projectId: props.projectId,
            sourcePath: path,
            programmerBucket: bucket,
          })
        }
        await props.onReload()
      })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se asignó la pieza')
    } finally {
      setBusy(false)
    }
  }

  async function assignAllPendingSinPlanoToCnc() {
    if (!canEdit || props.routesLocked) return
    const paths = [...pendingSinPlano]
    if (paths.length === 0) {
      setOkMsg('No hay piezas pendientes sin plano.')
      return
    }
    setBusy(true)
    setErr(null)
    setOkMsg(null)
    try {
      await withDeliveryScrollRestore(async () => {
        for (const path of paths) {
          await upsertPieceFromDesignPath({
            projectId: props.projectId,
            sourcePath: path,
            programmerBucket: 'cnc',
          })
        }
        await props.onReload()
      })
      setOkMsg(
        `${paths.length} pieza(s) a CNC. Busca por nombre las que son accesorio y cámbialas con el botón Accesorio.`,
      )
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudieron predeterminar a CNC')
    } finally {
      setBusy(false)
    }
  }

  async function moveToPending(pieceId: string) {
    if (!canEdit || props.routesLocked) return
    setBusy(true)
    setErr(null)
    try {
      await withDeliveryScrollRestore(async () => {
        await updatePieceProgrammerBucket({ pieceId, programmerBucket: null })
        await props.onReload()
      })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se quitó el destino')
    } finally {
      setBusy(false)
    }
  }

  async function confirmAssignment() {
    if (!canEdit || props.routesLocked) return
    if (!assignmentComplete) {
      setErr('Con plano → torno o perfiladora. Sin plano → CNC o accesorio.')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      await withDeliveryScrollRestore(async () => {
        await updateProgrammingRoutesConfirmed(props.projectId)
        await props.onReload()
      })
      await props.onConfirmed?.()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se confirmó el destino')
    } finally {
      setBusy(false)
    }
  }

  const assigned = props.pieces.filter(hasBucket)

  return (
    <div className="space-y-4">
      {!designConfirmed ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] text-amber-950">
          <p className="font-bold">Primero confirma el encargado</p>
          <p className="mt-1 leading-relaxed">
            Cuando el encargado revise y confirme el ensamble .x_t y los planos PDF, aquí podrás separar las piezas
            (torno / perfiladora / CNC / accesorio).
          </p>
        </div>
      ) : null}
      {err ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-900">{err}</div>
      ) : null}
      {okMsg ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-950">
          {okMsg}
        </div>
      ) : null}

      {designConfirmed ? (
      <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {DESTINO_INFO.map((d) => (
          <div key={d.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
            <p className="text-[12px] font-bold text-section-navy">{d.label}</p>
            <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{d.hint}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-section-navy/25 bg-sky-50 px-4 py-3">
        <p className="text-[14px] font-bold text-section-navy">Adjuntar planos PDF aquí</p>
        <p className="mt-1 text-[13px] leading-relaxed text-slate-700">
          El PDF debe llamarse <strong>igual que la pieza</strong> (ej. pieza «Buje» →{' '}
          <span className="font-mono">Buje.pdf</span>). Al vincularse pasa a «Con plano» para elegir torno o
          perfiladora.
        </p>
        {canEdit && !props.routesLocked ? (
          <label
            className={[
              'mt-3 inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-xl bg-section-navy px-4 py-2.5 text-[13px] font-bold text-white shadow-sm hover:brightness-110',
              busy ? 'pointer-events-none opacity-50' : '',
            ].join(' ')}
          >
            {busy ? 'Vinculando…' : 'Seleccionar planos PDF'}
            <input
              type="file"
              accept=".pdf,application/pdf"
              multiple
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                const list = e.target.files
                e.currentTarget.value = ''
                if (list?.length) void onBulkPlanos(list)
              }}
            />
          </label>
        ) : null}
      </div>

      <p className="text-[13px] text-slate-600">
        CNC {countBucket(props.pieces, 'cnc')} · Torno {countBucket(props.pieces, 'torno')} · Perfiladora{' '}
        {countBucket(props.pieces, 'perfilado')} · Accesorio {countBucket(props.pieces, 'accesorios')} · Pendientes{' '}
        {pendingWithPlano.length + pendingSinPlano.length}
      </p>

      <PendingSection
        title="Con plano — Torno o Perfiladora"
        subtitle="Elige el destino. No llevan tiempo de programación."
        empty={
          partPaths.length === 0
            ? 'Aún no hay piezas del ensamble.'
            : 'Todavía no hay planos vinculados. Usa «Seleccionar planos PDF» arriba.'
        }
        paths={pendingWithPlano}
        pieces={props.pieces}
        designPaths={props.designPaths}
        projectFolio={props.projectFolio}
        options={[
          { id: 'torno', label: 'Torno', hint: 'Sin tiempo' },
          { id: 'perfilado', label: 'Perfiladora', hint: 'Sin tiempo' },
        ]}
        busy={busy}
        locked={props.routesLocked}
        canEdit={canEdit}
        showPlanoAttach
        onPick={assignPath}
        onReload={reloadKeepingScroll}
        onEnsurePiece={ensurePiece}
      />

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-[14px] font-bold text-section-navy">Sin plano — CNC o Accesorio</p>
          <p className="mt-0.5 text-[12px] text-slate-500">
            Predetermina todas a CNC y busca por nombre las pocas que son accesorio para cambiarlas.
          </p>
        </div>

        <div className="space-y-3 border-b border-slate-100 bg-white px-4 py-3">
          {canEdit && !props.routesLocked && pendingSinPlano.length > 0 ? (
            <button
              type="button"
              disabled={busy}
              className="min-h-[44px] w-full rounded-xl bg-section-navy px-4 py-2.5 text-[13px] font-bold text-white shadow-sm hover:brightness-110 disabled:opacity-50 sm:w-auto"
              onClick={() => void assignAllPendingSinPlanoToCnc()}
            >
              {busy
                ? 'Asignando…'
                : `Predeterminar ${pendingSinPlano.length} a CNC`}
            </button>
          ) : null}

          <label className="block text-[12px] font-semibold text-slate-700">
            Buscar pieza (accesorio)
            <input
              type="search"
              value={sinPlanoSearch}
              onChange={(e) => setSinPlanoSearch(e.target.value)}
              placeholder="Escribe el nombre… ej. tornillo, arandela"
              className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-[14px] text-slate-900 shadow-sm outline-none ring-section-navy/30 focus:ring-2"
            />
          </label>
        </div>

        {pendingSinPlano.length > 0 ? (
          <div>
            <p className="border-b border-slate-100 bg-amber-50/80 px-4 py-2 text-[12px] font-semibold text-amber-950">
              Pendientes ({filteredPendingSinPlano.length}
              {sinPlanoSearch.trim() ? ` de ${pendingSinPlano.length}` : ''})
            </p>
            {filteredPendingSinPlano.length === 0 ? (
              <p className="px-4 py-4 text-[13px] text-slate-500">Ninguna pendiente coincide con la búsqueda.</p>
            ) : (
              <ol className="max-h-72 overflow-auto">
                {filteredPendingSinPlano.map((path, i) => (
                  <li
                    key={path}
                    className={[
                      'flex flex-col gap-2 border-b border-slate-100 px-4 py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between',
                      i % 2 === 0 ? 'bg-white' : 'bg-slate-50/70',
                    ].join(' ')}
                  >
                    <div className="min-w-0">
                      <DesignPathIdentity path={path} compact />
                      <span className="mt-1 inline-block rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        Sin plano
                      </span>
                    </div>
                    <DestinoBtns
                      path={path}
                      options={[
                        { id: 'cnc', label: 'CNC', hint: 'Programa y maquina' },
                        { id: 'accesorios', label: 'Accesorio', hint: 'Sin proceso' },
                      ]}
                      busy={busy}
                      locked={props.routesLocked}
                      canEdit={canEdit}
                      onPick={assignPath}
                    />
                  </li>
                ))}
              </ol>
            )}
          </div>
        ) : (
          <p className="px-4 py-3 text-[13px] text-slate-500">No hay piezas sin plano pendientes.</p>
        )}

        {cncSinPlanoPaths.length > 0 ? (
          <div className="border-t border-slate-200">
            <p className="border-b border-slate-100 bg-sky-50/90 px-4 py-2 text-[12px] font-semibold text-sky-950">
              Ya en CNC ({cncSinPlanoPaths.length}) — busca por nombre y pásalas a Accesorio
            </p>
            {!sinPlanoSearch.trim() ? (
              <p className="px-4 py-4 text-[13px] text-slate-500">
                Escribe arriba el nombre del accesorio (ej. tornillo) para encontrarlo rápido y marcar{' '}
                <strong>→ Accesorio</strong>.
              </p>
            ) : filteredCncForAccesorio.length === 0 ? (
              <p className="px-4 py-4 text-[13px] text-slate-500">Ninguna pieza CNC coincide con «{sinPlanoSearch.trim()}».</p>
            ) : (
              <ol className="max-h-80 overflow-auto">
                {filteredCncForAccesorio.map((path, i) => (
                  <li
                    key={path}
                    className={[
                      'flex flex-col gap-2 border-b border-slate-100 px-4 py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between',
                      i % 2 === 0 ? 'bg-white' : 'bg-slate-50/70',
                    ].join(' ')}
                  >
                    <div className="min-w-0">
                      <DesignPathIdentity path={path} compact />
                      <span className="mt-1 inline-block rounded-lg bg-section-navy/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-section-navy">
                        CNC
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={busy || props.routesLocked || !canEdit}
                      className="min-h-[36px] shrink-0 rounded-lg border border-amber-400 bg-amber-50 px-3 py-1.5 text-[12px] font-bold text-amber-950 hover:bg-amber-100 disabled:opacity-50"
                      onClick={() => void assignPath(path, 'accesorios')}
                    >
                      → Accesorio
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </div>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-[14px] font-bold text-section-navy">Ya dirigidas</p>
          <p className="text-[12px] text-slate-500">Solo CNC llega a la programadora.</p>
        </div>
        {assigned.length === 0 ? (
          <p className="px-4 py-6 text-center text-[13px] text-slate-500">Todavía no hay destinos.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {assigned.map((p) => {
              const path = p.source_path ?? p.label
              const bucket = p.programmer_bucket
              const withPlano = pieceHasPlano(p, props.designPaths)
              const options =
                bucket === 'torno' || bucket === 'perfilado'
                  ? ([
                      { id: 'torno' as const, label: 'Torno', hint: 'Sin tiempo' },
                      { id: 'perfilado' as const, label: 'Perfiladora', hint: 'Sin tiempo' },
                    ] as const)
                  : ([
                      { id: 'cnc' as const, label: 'CNC', hint: 'Programa' },
                      { id: 'accesorios' as const, label: 'Accesorio', hint: 'Sin proceso' },
                    ] as const)
              return (
                <li key={p.id} className="px-4 py-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      {p.source_path ? (
                        <DesignPathIdentity path={p.source_path} compact />
                      ) : (
                        <p className="font-semibold text-slate-900">{pieceDisplayLabel(p)}</p>
                      )}
                      {withPlano ? (
                        <span className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-emerald-400 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-900">
                          <span className="flex h-4 w-4 items-center justify-center rounded bg-rose-600 text-[8px] font-black text-white">
                            PDF
                          </span>
                          Plano listo
                        </span>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {p.source_path ? (
                        <DestinoBtns
                          path={p.source_path}
                          current={bucket}
                          options={[...options]}
                          busy={busy}
                          locked={props.routesLocked}
                          canEdit={canEdit}
                          onPick={assignPath}
                        />
                      ) : null}
                      {!props.routesLocked && canEdit ? (
                        <button
                          type="button"
                          disabled={busy}
                          className="rounded-lg border border-rose-300 bg-rose-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-rose-700 disabled:opacity-50"
                          onClick={() => void moveToPending(p.id)}
                        >
                          Quitar
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {(bucket === 'torno' || bucket === 'perfilado' || withPlano) && p.source_path ? (
                    <div className="mt-2">
                      <BodegaPiecePlanoAttach
                        compact
                        piece={p}
                        projectFolio={props.projectFolio}
                        designZipPaths={props.designPaths}
                        canEdit={canEdit}
                        expectedFileName={expectedPlanoFileName(path)}
                        renameFile={(file) => fileRenamedToExpectedPlano(file, path)}
                        onUpdated={reloadKeepingScroll}
                      />
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <div className="rounded-xl border border-slate-300 bg-white p-4 sm:flex sm:items-center sm:justify-between">
        <p className="text-[13px] text-slate-600">
          {props.routesLocked
            ? 'Destinos confirmados. Programación solo ve CNC; torno, perfiladora y accesorio no llevan tiempo.'
            : 'Cuando todas tengan destino, confirma. La programadora solo recibirá CNC.'}
        </p>
        {props.routesLocked ? null : (
          <button
            type="button"
            disabled={busy || !assignmentComplete || !canEdit}
            className="mt-3 min-h-[48px] w-full rounded-xl bg-section-navy px-5 py-3 text-[14px] font-bold text-white disabled:opacity-50 sm:mt-0 sm:w-auto"
            onClick={() => void confirmAssignment()}
          >
            {busy ? 'Confirmando…' : 'Confirmar destinos'}
          </button>
        )}
      </div>
      </>
      ) : null}
    </div>
  )
}

function PendingSection(props: {
  title: string
  subtitle: string
  empty: string
  paths: string[]
  pieces: BodegaProjectPieceRow[]
  designPaths: string[]
  projectFolio: string
  options: { id: ProgrammerBucket; label: string; hint: string }[]
  busy: boolean
  locked: boolean
  canEdit: boolean
  showPlanoAttach?: boolean
  onPick: (path: string, bucket: ProgrammerBucket) => void
  onReload: () => Promise<void>
  onEnsurePiece: (path: string) => Promise<BodegaProjectPieceRow | null>
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
        <p className="text-[14px] font-bold text-section-navy">{props.title}</p>
        <p className="text-[12px] text-slate-500">{props.subtitle}</p>
      </div>
      {props.paths.length === 0 ? (
        <p className="px-4 py-6 text-center text-[13px] text-slate-500">{props.empty}</p>
      ) : (
        <ol>
          {props.paths.map((path, i) => {
            const piece = pieceForZipPath(props.pieces, path)
            return (
              <li
                key={path}
                className={[
                  'space-y-2 border-b border-slate-100 px-4 py-3 last:border-0',
                  i % 2 === 0 ? 'bg-white' : 'bg-slate-50/70',
                ].join(' ')}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-section-navy/10 text-[11px] font-bold text-section-navy">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <DesignPathIdentity path={path} compact />
                      {piece && pieceHasPlano(piece, props.designPaths) ? (
                        <span className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-emerald-400 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-900">
                          <span className="flex h-4 w-4 items-center justify-center rounded bg-rose-600 text-[8px] font-black text-white">
                            PDF
                          </span>
                          Plano listo
                        </span>
                      ) : (
                        <span className="mt-1 inline-block rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                          Sin plano
                        </span>
                      )}
                    </div>
                  </div>
                  <DestinoBtns
                    path={path}
                    options={props.options}
                    busy={props.busy}
                    locked={props.locked}
                    canEdit={props.canEdit}
                    onPick={props.onPick}
                  />
                </div>
                {props.showPlanoAttach && props.canEdit && !props.locked ? (
                  piece ? (
                    <BodegaPiecePlanoAttach
                      compact
                      piece={piece}
                      projectFolio={props.projectFolio}
                      designZipPaths={props.designPaths}
                      canEdit={props.canEdit}
                      expectedFileName={expectedPlanoFileName(path)}
                      renameFile={(file) => fileRenamedToExpectedPlano(file, path)}
                      onUpdated={props.onReload}
                    />
                  ) : (
                    <button
                      type="button"
                      disabled={props.busy}
                      className="rounded-lg border border-dashed border-section-navy/40 bg-sky-50 px-3 py-2 text-[12px] font-semibold text-section-navy"
                      onClick={() => void props.onEnsurePiece(path).then(() => props.onReload())}
                    >
                      Preparar pieza para subir plano
                    </button>
                  )
                ) : null}
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

function DestinoBtns(props: {
  path: string
  current?: ProgrammerBucket | null
  options: { id: ProgrammerBucket; label: string; hint: string }[]
  busy: boolean
  locked: boolean
  canEdit: boolean
  onPick: (path: string, bucket: ProgrammerBucket) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {props.options.map((d) => {
        const active = props.current === d.id
        return (
          <button
            key={d.id}
            type="button"
            disabled={props.busy || props.locked || !props.canEdit}
            title={d.hint}
            className={[
              'min-h-[36px] rounded-lg px-3 py-1.5 text-[12px] font-bold transition disabled:opacity-40',
              active
                ? 'bg-section-navy text-white shadow-sm'
                : 'border border-slate-300 bg-white text-slate-800 hover:border-section-navy hover:bg-sky-50',
            ].join(' ')}
            onClick={() => void props.onPick(props.path, d.id)}
          >
            {d.label}
          </button>
        )
      })}
    </div>
  )
}
