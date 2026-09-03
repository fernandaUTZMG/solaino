import { useCallback, useEffect, useMemo, useState } from 'react'
import { canAccessBodega, type AppRole } from '../../lib/roles'
import {
  type BodegaCloudFileRow,
  buildNubeCloudExplorerTree,
  fetchBodegaCloudFileRows,
  filterCloudFilesForRole,
  NUBE_KIND_FOLDER_ORDER,
  renameBodegaCloudFile,
} from '../../lib/bodegaCloudFilesRepo'
import { createSignedUrlForDesignZip } from '../../lib/designVersionsRepo'
import { IconBoxes, IconNavArchivos } from '../../ui/shellIcons.tsx'

function fmtDate(s: string | null): string {
  if (!s) return '—'
  try {
    return new Date(s).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return s
  }
}

function kindLabel(k: BodegaCloudFileRow['kind']): string {
  switch (k) {
    case 'diseno':
      return 'Diseño (ZIP)'
    case 'info_cliente':
      return 'Info cliente'
    case 'programacion':
      return 'CNC / programación'
    case 'maquinado':
      return 'Maquinado (capturas / tiempos)'
    case 'accesorios':
      return 'Accesorios'
    case 'foto':
      return 'Fotos / evidencias'
    default:
      return k
  }
}

function countBadge(n: number, variant: 'default' | 'onTint' = 'default') {
  const tint =
    variant === 'onTint'
      ? 'bg-white/90 text-amber-950 shadow-sm ring-1 ring-amber-900/12'
      : 'bg-slate-200/90 text-slate-700'
  return (
    <span
      className={`inline-flex min-w-[1.5rem] items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${tint}`}
    >
      {n}
    </span>
  )
}

/** Fondo suave uniforme para todas las filas «Empresa» (amarillo pastel, no chillón). */
function empresaSummaryTone(): {
  summary: string
  label: string
  title: string
  iconWrap: string
  badgeVariant: 'default' | 'onTint'
} {
  return {
    summary: 'bg-amber-50/70 hover:bg-amber-100/50',
    label: 'text-amber-900/55',
    title: 'text-amber-950',
    iconWrap: 'bg-amber-200/60 text-amber-950',
    badgeVariant: 'onTint' as const,
  }
}

export function BodegaNubeFilesPage(props: { role: AppRole }) {
  const [rows, setRows] = useState<BodegaCloudFileRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [renameRow, setRenameRow] = useState<BodegaCloudFileRow | null>(null)
  const [renameInput, setRenameInput] = useState('')
  const [renameBusy, setRenameBusy] = useState(false)

  const visible = useMemo(() => filterCloudFilesForRole(props.role, rows), [props.role, rows])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return visible
    return visible.filter((r) => {
      const hay = `${r.empresaDisplay} ${r.ordenCompraNumero ?? ''} ${r.folio} ${r.proyectoNombre} ${r.displayName} ${r.storagePath} ${kindLabel(r.kind)}`.toLowerCase()
      return hay.includes(s)
    })
  }, [visible, q])

  const tree = useMemo(() => buildNubeCloudExplorerTree(filtered), [filtered])

  const load = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      setRows(await fetchBodegaCloudFileRows())
    } catch (e) {
      setRows([])
      setError(e instanceof Error ? e.message : 'No se pudo cargar el listado.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function onOpen(r: BodegaCloudFileRow) {
    const url = await createSignedUrlForDesignZip(r.storagePath)
    if (url) window.open(url, '_blank', 'noopener,noreferrer')
    else setError('No se pudo generar el enlace de descarga.')
  }

  function openRename(r: BodegaCloudFileRow) {
    setRenameRow(r)
    setRenameInput(r.displayName)
    setError(null)
  }

  async function submitRename() {
    if (!renameRow) return
    setRenameBusy(true)
    setError(null)
    try {
      await renameBodegaCloudFile(renameRow, renameInput)
      setRenameRow(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo renombrar.')
    } finally {
      setRenameBusy(false)
    }
  }

  if (!canAccessBodega(props.role)) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 shadow-sm">
        No tienes acceso a esta sección.
      </div>
    )
  }

  return (
    <section className="space-y-5">
      <div className="rounded-2xl border border-blue-950/35 bg-section-navy px-5 py-4 text-white shadow-md sm:px-6 sm:py-5">
        <h1 className="text-lg font-bold tracking-tight sm:text-xl">Archivos en la nube</h1>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 shadow-sm">{error}</div>
      ) : null}

      <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <label className="block min-w-0 flex-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Buscar</span>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Empresa, OC, folio, proyecto o nombre de archivo…"
              className="mt-1 w-full max-w-xl rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-900 shadow-sm outline-none focus:border-blue-950/45 focus:ring-2 focus:ring-section-navy/20"
            />
          </label>
          <button
            type="button"
            disabled={loading}
            className="shrink-0 rounded-xl bg-blue-700 px-4 py-2 text-[13px] font-semibold text-white shadow-md shadow-blue-900/20 transition hover:bg-blue-800 disabled:opacity-50"
            onClick={() => void load()}
          >
            {loading ? 'Cargando…' : 'Actualizar'}
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-slate-50/40 shadow-sm">
        {loading ? (
          <div className="px-6 py-14 text-center text-[14px] text-slate-600">Cargando archivos…</div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-14 text-center text-[14px] text-slate-600">
            {visible.length === 0
              ? 'No hay archivos visibles para tu rol o aún no hay entregas registradas.'
              : 'Ningún resultado coincide con la búsqueda.'}
          </div>
        ) : (
          <div className="space-y-3 p-3 sm:p-4">
            {tree.map((emp, ei) => {
              const tone = empresaSummaryTone()
              return (
              <details key={`${emp.key}-${ei}`} className="group overflow-hidden rounded-2xl border border-amber-100/90 bg-amber-50/30 shadow-sm" open={ei === 0}>
                <summary
                  className={`flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 pr-10 marker:content-none [&::-webkit-details-marker]:hidden ${tone.summary}`}
                >
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone.iconWrap}`}>
                    <IconBoxes className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-[10px] font-bold uppercase tracking-[0.14em] ${tone.label}`}>Empresa</p>
                    <p className={`truncate text-[15px] font-bold ${tone.title}`}>{emp.title}</p>
                  </div>
                  {countBadge(emp.totalFiles, tone.badgeVariant)}
                  <span className={`text-[11px] font-medium group-open:hidden ${tone.label}`}>Abrir</span>
                  <span className={`hidden text-[11px] font-medium group-open:inline ${tone.label}`}>Cerrar</span>
                </summary>
                <div className="space-y-2 border-t border-amber-100/80 bg-white/60 px-2 py-3 sm:px-3">
                  {emp.ordenes.map((oc) => (
                    <details key={oc.key} className="rounded-xl border border-slate-100 bg-slate-50/60" open>
                      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-3 py-2.5 marker:content-none [&::-webkit-details-marker]:hidden">
                        <IconNavArchivos className="h-4 w-4 shrink-0 text-amber-700/90" />
                        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-slate-800">{oc.title}</span>
                        {countBadge(oc.totalFiles)}
                      </summary>
                      <div className="space-y-3 border-t border-slate-100/80 px-2 pb-3 pt-2 sm:px-3">
                        {oc.projects.map((proj) => (
                          <div
                            key={proj.projectId}
                            className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm ring-1 ring-slate-900/[0.02] sm:p-4"
                          >
                            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-slate-100 pb-2.5">
                              <span className="font-mono text-[12px] font-bold text-blue-950">{proj.folio || '—'}</span>
                              <span className="text-[13px] font-semibold text-slate-800">{proj.proyectoNombre || '—'}</span>
                            </div>
                            <div className="mt-3 space-y-3">
                              {NUBE_KIND_FOLDER_ORDER.map((kind) => {
                                const files = proj.byKind[kind]
                                if (!files?.length) return null
                                return (
                                  <details key={kind} className="rounded-lg bg-slate-50/90 ring-1 ring-slate-200/60" open>
                                    <summary className="flex cursor-pointer list-none items-center gap-2 px-2.5 py-2 marker:content-none [&::-webkit-details-marker]:hidden">
                                      <IconNavArchivos className="h-3.5 w-3.5 text-slate-500" />
                                      <span className="text-[11px] font-bold uppercase tracking-wide text-slate-600">{kindLabel(kind)}</span>
                                      {countBadge(files.length)}
                                    </summary>
                                    <ul className="space-y-1 border-t border-slate-200/50 px-2 py-2">
                                      {files.map((r) => (
                                        <li
                                          key={`${r.source}-${r.kind}-${r.id}-${r.storagePath}`}
                                          className="flex flex-col gap-2 rounded-lg border border-transparent bg-white px-2.5 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                                        >
                                          <div className="min-w-0 flex-1">
                                            <p className="truncate text-[13px] font-medium text-slate-900" title={r.displayName}>
                                              {r.displayName}
                                            </p>
                                            <p className="truncate font-mono text-[10px] text-slate-400" title={r.storagePath}>
                                              {r.storagePath}
                                            </p>
                                            <p className="mt-0.5 text-[11px] text-slate-500">{fmtDate(r.createdAt)}</p>
                                          </div>
                                          <div className="flex shrink-0 flex-wrap gap-2">
                                            <button
                                              type="button"
                                              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
                                              onClick={() => void onOpen(r)}
                                            >
                                              Abrir
                                            </button>
                                            <button
                                              type="button"
                                              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
                                              onClick={() => openRename(r)}
                                            >
                                              Renombrar
                                            </button>
                                          </div>
                                        </li>
                                      ))}
                                    </ul>
                                  </details>
                                )
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </details>
                  ))}
                </div>
              </details>
              )
            })}
          </div>
        )}
      </div>

      {renameRow ? (
        <div className="fixed inset-0 z-[60] grid place-items-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/55 backdrop-blur-[1px]"
            aria-label="Cerrar"
            onClick={() => {
              if (!renameBusy) setRenameRow(null)
            }}
          />
          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <h2 className="text-[15px] font-bold text-slate-900">Renombrar archivo</h2>
            <p className="mt-1 truncate text-[12px] text-slate-500" title={renameRow.displayName}>
              Actual: {renameRow.displayName}
            </p>
            <label className="mt-4 block">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Nuevo nombre</span>
              <input
                value={renameInput}
                onChange={(e) => setRenameInput(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-[14px] text-slate-900 shadow-sm outline-none focus:border-blue-950/45 focus:ring-2 focus:ring-section-navy/20"
                autoFocus
              />
            </label>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
              Se mantiene el prefijo UUID del archivo. Si no indicas extensión, se conserva la del archivo actual.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={renameBusy}
                className="rounded-xl border border-slate-200 px-4 py-2 text-[13px] font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                onClick={() => setRenameRow(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={renameBusy}
                className="rounded-xl bg-section-navy px-4 py-2 text-[13px] font-semibold text-white shadow-sm hover:brightness-110 disabled:opacity-50"
                onClick={() => void submitRename()}
              >
                {renameBusy ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
