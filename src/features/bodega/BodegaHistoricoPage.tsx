import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  canAccessHistoricoNav,
  canDeleteHistoricoFiles,
  defaultHistoricoAreaForRole,
  historicoAreasForRole,
  type AppRole,
} from '../../lib/roles'
import { fetchHistoricFiles, type BodegaHistoricFileRow } from '../../lib/bodegaHistoricRepo'
import {
  deleteHistoricFile,
  downloadHistoricFile,
  uploadHistoricFile,
  uploadHistoricFolderFromBrowser,
} from '../../lib/bodegaHistoricStorage'
import { buildHistoricFolderTree, filterHistoricFileRows, historicTreeTotalFiles, splitProgramadoraHistoricoFiles } from '../../lib/bodegaHistoricTree'
import { BodegaHistoricoFolderTree } from './BodegaHistoricoFolderTree.tsx'
import { BodegaHistoricoPinnedFolder } from './BodegaHistoricoPinnedFolder.tsx'
import {
  historicoAreaLabel,
  historicoAreaShortHint,
  historicoFlujoKindsForArea,
  type BodegaHistoricoArea,
} from '../../lib/bodegaHistoricTypes'
import {
  buildNubeCloudExplorerTree,
  fetchBodegaCloudFileRows,
  filterCloudFilesForRole,
  type BodegaCloudFileRow,
} from '../../lib/bodegaCloudFilesRepo'
import { createSignedUrlForBodegaStorage, BODEGA_PROYECTOS_BUCKET } from '../../lib/bodegaObjectStorage'
import { IconNavHistorial } from '../../ui/shellIcons.tsx'

type TabId = 'archivo' | 'flujo'

function fmtDate(s: string | null): string {
  if (!s) return '—'
  try {
    return new Date(s).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return s
  }
}

function kindLabelFlujo(k: BodegaCloudFileRow['kind']): string {
  switch (k) {
    case 'diseno':
      return 'Diseño'
    case 'info_cliente':
      return 'Info cliente'
    case 'programacion':
      return 'Programación'
    case 'maquinado':
      return 'Maquinado'
    case 'accesorios':
      return 'Accesorios'
    case 'foto':
      return 'Fotos'
    default:
      return k
  }
}

export function BodegaHistoricoPage(props: { role: AppRole }) {
  const areas = historicoAreasForRole(props.role)
  const [area, setArea] = useState<BodegaHistoricoArea>(
    () => defaultHistoricoAreaForRole(props.role) ?? areas[0] ?? 'disenadora',
  )
  const [tab, setTab] = useState<TabId>('archivo')
  const [q, setQ] = useState('')
  const [qMaquinado, setQMaquinado] = useState('')
  const [qAxf, setQAxf] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [historicRows, setHistoricRows] = useState<BodegaHistoricFileRow[]>([])
  const [flujoRows, setFlujoRows] = useState<BodegaCloudFileRow[]>([])
  const [uploadBusy, setUploadBusy] = useState(false)
  const [uploadPhase, setUploadPhase] = useState('')
  const [folio, setFolio] = useState('')
  const [subfolder, setSubfolder] = useState('')
  const [notes, setNotes] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const folderRef = useRef<HTMLInputElement>(null)
  const uploadAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    return () => {
      uploadAbortRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    if (!areas.includes(area) && areas[0]) setArea(areas[0])
  }, [areas, area])

  const loadArchivo = useCallback(async () => {
    setHistoricRows(await fetchHistoricFiles(area))
  }, [area])

  const loadFlujo = useCallback(async () => {
    const all = await fetchBodegaCloudFileRows()
    const visible = filterCloudFilesForRole(props.role, all)
    const kinds = historicoFlujoKindsForArea(area)
    setFlujoRows(visible.filter((r) => (kinds as readonly string[]).includes(r.kind)))
  }, [area, props.role])

  const load = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      if (tab === 'archivo') await loadArchivo()
      else await loadFlujo()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar.')
      if (tab === 'archivo') setHistoricRows([])
      else setFlujoRows([])
    } finally {
      setLoading(false)
    }
  }, [tab, loadArchivo, loadFlujo])

  useEffect(() => {
    void load()
  }, [load])

  const isProgramadoraArchivo = tab === 'archivo' && area === 'disenadora'

  const filteredHistoric = useMemo(() => {
    if (isProgramadoraArchivo) return historicRows
    const s = q.trim().toLowerCase()
    if (!s) return historicRows
    return historicRows.filter((r) => {
      const hay = `${r.displayName} ${r.folio ?? ''} ${r.notes ?? ''} ${r.storagePath}`.toLowerCase()
      return hay.includes(s)
    })
  }, [historicRows, q, isProgramadoraArchivo])

  const programadoraSplit = useMemo(() => {
    if (!isProgramadoraArchivo) return null
    return splitProgramadoraHistoricoFiles(historicRows)
  }, [historicRows, isProgramadoraArchivo])

  const maquinadoFiles = useMemo(() => {
    if (!programadoraSplit) return []
    return filterHistoricFileRows(programadoraSplit.maquinado, qMaquinado)
  }, [programadoraSplit, qMaquinado])

  const axfFiles = useMemo(() => {
    if (!programadoraSplit) return []
    return filterHistoricFileRows(programadoraSplit.axf, qAxf)
  }, [programadoraSplit, qAxf])

  const restHistoricRows = useMemo(() => {
    if (!programadoraSplit) return filteredHistoric
    return filterHistoricFileRows(programadoraSplit.rest, q)
  }, [programadoraSplit, filteredHistoric, q])

  const flujoFiltered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return flujoRows
    return flujoRows.filter((r) => {
      const hay = `${r.empresaDisplay} ${r.folio} ${r.displayName} ${r.storagePath}`.toLowerCase()
      return hay.includes(s)
    })
  }, [flujoRows, q])

  const flujoTree = useMemo(() => buildNubeCloudExplorerTree(flujoFiltered), [flujoFiltered])

  const historicTree = useMemo(
    () => buildHistoricFolderTree(area, isProgramadoraArchivo ? restHistoricRows : filteredHistoric),
    [area, filteredHistoric, restHistoricRows, isProgramadoraArchivo],
  )

  const historicFileCount = useMemo(() => {
    if (isProgramadoraArchivo && programadoraSplit) {
      return programadoraSplit.maquinado.length + programadoraSplit.axf.length + historicTreeTotalFiles(historicTree)
    }
    return historicTreeTotalFiles(historicTree)
  }, [isProgramadoraArchivo, programadoraSplit, historicTree])

  async function onUploadFolder(files: FileList | null) {
    if (!files?.length) return
    uploadAbortRef.current?.abort()
    const abort = new AbortController()
    uploadAbortRef.current = abort
    setUploadBusy(true)
    setError(null)
    setUploadPhase('Preparando carpeta…')
    try {
      const result = await uploadHistoricFolderFromBrowser({
        area,
        files,
        onPhase: setUploadPhase,
        signal: abort.signal,
      })
      if (folderRef.current) folderRef.current.value = ''
      await loadArchivo()
      setTab('archivo')
      if (result.stoppedReason) {
        setError(result.stoppedReason)
      } else if (result.failed > 0) {
        setError(
          `Listo: ${result.uploaded} archivo(s) guardados. Fallaron: ${result.failed}. Omitidos (Thumbs.db, etc.): ${result.skipped}. Pulsa Actualizar abajo.`,
        )
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir la carpeta.')
    } finally {
      setUploadBusy(false)
      setUploadPhase('')
    }
  }

  async function onUpload(e: React.FormEvent) {
    e.preventDefault()
    const file = fileRef.current?.files?.[0]
    if (!file) {
      setError('Elige un archivo.')
      return
    }
    setUploadBusy(true)
    setError(null)
    setUploadPhase('Iniciando…')
    try {
      await uploadHistoricFile({
        area,
        file,
        folio: folio || null,
        notes: notes || null,
        subfolder: subfolder || null,
        onPhase: setUploadPhase,
      })
      setFolio('')
      setSubfolder('')
      setNotes('')
      if (fileRef.current) fileRef.current.value = ''
      await loadArchivo()
      setTab('archivo')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir.')
    } finally {
      setUploadBusy(false)
      setUploadPhase('')
    }
  }

  async function onDeleteHistoricRow(r: BodegaHistoricFileRow) {
    if (!window.confirm(`¿Eliminar «${r.displayName}»?`)) return
    try {
      await deleteHistoricFile(r.storagePath, r.id)
      await loadArchivo()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar.')
    }
  }

  async function onOpenFlujo(r: BodegaCloudFileRow) {
    const url = await createSignedUrlForBodegaStorage(BODEGA_PROYECTOS_BUCKET, r.storagePath)
    if (url) window.open(url, '_blank', 'noopener,noreferrer')
    else setError('No se pudo generar el enlace.')
  }

  if (!canAccessHistoricoNav(props.role)) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
        No tienes acceso al módulo Histórico.
      </div>
    )
  }

  return (
    <section className="space-y-5">
      <div className="rounded-2xl border border-violet-900/30 bg-gradient-to-br from-violet-950 to-section-navy px-5 py-4 text-white shadow-md sm:px-6 sm:py-5">
        <div className="flex flex-wrap items-start gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20">
            <IconNavHistorial className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-violet-200/90">Bodega</p>
            <h1 className="text-lg font-bold tracking-tight sm:text-xl">Histórico</h1>
            <p className="mt-1 max-w-2xl text-[13px] leading-snug text-violet-100/95">
              Respaldo de carpetas de la USB (misma estructura) y consulta del flujo de bodega.{' '}
              <strong>Programadora</strong>: Maquinado (.SLCPRT), AXF (.DXF), NC y demás carpetas.{' '}
              <strong>Diseño</strong>: planos y SolidWorks.
            </p>
          </div>
        </div>
      </div>

      {areas.length > 1 ? (
        <div className="flex flex-wrap gap-3">
          {areas.map((a) => (
            <button
              key={a}
              type="button"
              title={historicoAreaShortHint(a)}
              className={[
                'rounded-xl px-4 py-2.5 text-left transition',
                area === a
                  ? 'bg-section-navy text-white shadow-md ring-2 ring-section-navy/30'
                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
              ].join(' ')}
              onClick={() => setArea(a)}
            >
              <span className="block text-[14px] font-bold">{historicoAreaLabel(a)}</span>
              <span
                className={[
                  'mt-0.5 block max-w-[14rem] text-[10px] font-medium leading-snug',
                  area === a ? 'text-violet-100/95' : 'text-slate-500',
                ].join(' ')}
              >
                {historicoAreaShortHint(a)}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="text-[12px] font-semibold text-slate-600">
          Área: <span className="text-section-navy">{historicoAreaLabel(area)}</span>
          <span className="mt-0.5 block text-[11px] font-normal text-slate-500">{historicoAreaShortHint(area)}</span>
        </p>
      )}

      <div className="flex flex-wrap gap-2 border-b border-slate-200/80 pb-1">
        {(
          [
            ['archivo', 'Archivo histórico'],
            ['flujo', 'Del flujo (Nube)'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={[
              'rounded-t-lg px-4 py-2 text-[13px] font-semibold transition',
              tab === id
                ? 'border border-b-0 border-slate-200 bg-white text-section-navy shadow-sm'
                : 'text-slate-600 hover:bg-slate-100/80',
            ].join(' ')}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{error}</div>
      ) : null}

      {tab === 'archivo' ? (
        <div className="space-y-4">
          <div className="rounded-2xl border-2 border-violet-200 bg-violet-50/80 p-4 shadow-sm sm:p-5">
            <h2 className="text-[14px] font-bold text-violet-950">
              Subir carpeta completa (USB) — {historicoAreaLabel(area)}
            </h2>
            <p className="mt-1 text-[12px] leading-snug text-slate-700">
              Selecciona la carpeta raíz (ej. <strong>PROGRAMAS JCP</strong>). Se conservan subcarpetas y archivos
              igual que en el explorador de Windows. Puede tardar varios minutos si hay muchos archivos.
            </p>
            <input
              ref={folderRef}
              type="file"
              multiple
              className="hidden"
              disabled={uploadBusy}
              onChange={(e) => void onUploadFolder(e.target.files)}
              {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
            />
            <button
              type="button"
              disabled={uploadBusy}
              className="mt-4 rounded-xl bg-violet-700 px-5 py-2.5 text-[13px] font-semibold text-white shadow-md hover:bg-violet-800 disabled:opacity-50"
              onClick={() => folderRef.current?.click()}
            >
              {uploadBusy ? uploadPhase || 'Subiendo carpeta…' : 'Elegir carpeta de la USB…'}
            </button>
          </div>

          <details className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
            <summary className="cursor-pointer text-[13px] font-semibold text-slate-800">
              Subir un solo archivo (opcional)
            </summary>
            <form onSubmit={(e) => void onUpload(e)} className="mt-4 border-t border-slate-100 pt-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Archivo</span>
                  <input ref={fileRef} type="file" className="mt-1 w-full text-[13px]" disabled={uploadBusy} />
                </label>
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Folio</span>
                  <input
                    value={folio}
                    onChange={(e) => setFolio(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-[13px]"
                    disabled={uploadBusy}
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Subcarpeta</span>
                  <input
                    value={subfolder}
                    onChange={(e) => setSubfolder(e.target.value)}
                    placeholder="opcional"
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-[13px]"
                    disabled={uploadBusy}
                  />
                </label>
              </div>
              <button
                type="submit"
                disabled={uploadBusy}
                className="mt-3 rounded-xl border border-slate-200 bg-white px-4 py-2 text-[13px] font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
              >
                Subir archivo
              </button>
            </form>
          </details>
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          {!isProgramadoraArchivo ? (
            <label className="block min-w-0 flex-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Buscar</span>
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={tab === 'archivo' ? 'Nombre, folio, notas…' : 'Empresa, folio, archivo…'}
                className="mt-1 w-full max-w-xl rounded-xl border border-slate-200 px-3 py-2 text-[13px] shadow-sm outline-none focus:ring-2 focus:ring-section-navy/20"
              />
            </label>
          ) : (
            <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-slate-600">
              Las carpetas <strong className="text-slate-800">Maquinado</strong> y{' '}
              <strong className="text-slate-800">AXF</strong> tienen buscador propio arriba. Usa la búsqueda de abajo
              para el resto de carpetas de la USB.
            </p>
          )}
          <button
            type="button"
            disabled={loading}
            onClick={() => void load()}
            className="shrink-0 rounded-xl border border-slate-200 bg-white px-4 py-2 text-[13px] font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            {loading ? 'Cargando…' : 'Actualizar'}
          </button>
        </div>
      </div>

      {tab === 'archivo' ? (
        <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-[12px] text-slate-600">
            {loading
              ? 'Cargando…'
              : historicFileCount > 0
                ? isProgramadoraArchivo
                  ? `${historicFileCount} archivo(s) · Maquinado ${programadoraSplit?.maquinado.length ?? 0} · AXF ${programadoraSplit?.axf.length ?? 0} · otras carpetas ${historicTreeTotalFiles(historicTree)}`
                  : `${historicFileCount} archivo(s) en ${historicTree.length} carpeta(s) raíz`
                : 'Sin archivos aún'}
          </div>
          {loading ? (
            <p className="px-6 py-12 text-center text-[14px] text-slate-600">Cargando archivo histórico…</p>
          ) : historicFileCount === 0 ? (
            <p className="px-6 py-12 text-center text-[14px] text-slate-600">
              No hay archivos en el histórico de {historicoAreaLabel(area).toLowerCase()}. Usa{' '}
              <strong>Elegir carpeta de la USB</strong> arriba.
            </p>
          ) : isProgramadoraArchivo ? (
            <div className="space-y-5 p-3 sm:p-5">
              <BodegaHistoricoPinnedFolder
                title="Maquinado"
                subtitle="Archivos de programación CNC (.SLCPRT / .SCPRT)"
                accent="programacion"
                area={area}
                files={maquinadoFiles}
                searchQuery={qMaquinado}
                onSearchChange={setQMaquinado}
                searchPlaceholder="Buscar en Maquinado: nombre, carpeta…"
                canDelete={canDeleteHistoricoFiles(props.role)}
                onDownload={(r) => void downloadHistoricFile(r.storagePath)}
                onDelete={(r) => void onDeleteHistoricRow(r)}
              />
              <BodegaHistoricoPinnedFolder
                title="AXF"
                subtitle="Archivos de corte / láser (.DXF)"
                accent="sky"
                area={area}
                files={axfFiles}
                searchQuery={qAxf}
                onSearchChange={setQAxf}
                searchPlaceholder="Buscar en AXF: nombre, carpeta…"
                canDelete={canDeleteHistoricoFiles(props.role)}
                onDownload={(r) => void downloadHistoricFile(r.storagePath)}
                onDelete={(r) => void onDeleteHistoricRow(r)}
              />

              <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-slate-50/40">
                <div className="border-b border-slate-200/80 bg-white px-4 py-3 sm:px-5">
                  <h3 className="text-[14px] font-bold text-slate-900">Resto del archivo histórico</h3>
                  <p className="mt-0.5 text-[12px] text-slate-600">
                    NC, carpetas de la USB y demás archivos que no son .SLCPRT ni .DXF.
                  </p>
                  <label className="mt-3 block">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Buscar en otras carpetas
                    </span>
                    <input
                      type="search"
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="Nombre, folio, ruta de carpeta…"
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] shadow-sm outline-none focus:ring-2 focus:ring-section-navy/20"
                    />
                  </label>
                </div>
                <div className="p-3 sm:p-4">
                  {historicTree.length === 0 ? (
                    <p className="py-8 text-center text-[13px] text-slate-500">
                      {q.trim()
                        ? 'Ningún archivo coincide en las demás carpetas.'
                        : 'No hay otros archivos aparte de Maquinado y AXF.'}
                    </p>
                  ) : (
                    <BodegaHistoricoFolderTree
                      nodes={historicTree}
                      canDelete={canDeleteHistoricoFiles(props.role)}
                      onDownload={(r) => void downloadHistoricFile(r.storagePath)}
                      onDelete={(r) => void onDeleteHistoricRow(r)}
                    />
                  )}
                </div>
              </section>
            </div>
          ) : (
            <div className="p-3 sm:p-4">
              <BodegaHistoricoFolderTree
                nodes={historicTree}
                canDelete={canDeleteHistoricoFiles(props.role)}
                onDownload={(r) => void downloadHistoricFile(r.storagePath)}
                onDelete={(r) => void onDeleteHistoricRow(r)}
              />
            </div>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-slate-50/50 shadow-sm">
          {loading ? (
            <p className="px-6 py-12 text-center text-[14px] text-slate-600">Cargando archivos del flujo…</p>
          ) : flujoTree.length === 0 ? (
            <p className="px-6 py-12 text-center text-[14px] text-slate-600">
              No hay archivos del flujo visibles para {historicoAreaLabel(area).toLowerCase()}.
            </p>
          ) : (
            <div className="space-y-2 p-3 sm:p-4">
              {flujoTree.map((emp) => (
                <details key={emp.key} className="rounded-xl border border-slate-200 bg-white" open>
                  <summary className="cursor-pointer px-3 py-2.5 text-[13px] font-bold text-slate-900">
                    {emp.title} ({emp.totalFiles})
                  </summary>
                  <div className="space-y-2 border-t border-slate-100 px-2 py-2">
                    {emp.ordenes.map((oc) => (
                      <details key={oc.key} className="rounded-lg bg-slate-50/80" open>
                        <summary className="cursor-pointer px-2 py-2 text-[12px] font-semibold text-slate-800">
                          {oc.title}
                        </summary>
                        <ul className="space-y-2 px-2 pb-2">
                          {oc.projects.map((proj) =>
                            Object.entries(proj.byKind).flatMap(([, files]) =>
                              (files ?? []).map((r) => (
                                <li
                                  key={`${r.id}-${r.storagePath}`}
                                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 bg-white px-2.5 py-2"
                                >
                                  <div className="min-w-0">
                                    <p className="font-mono text-[11px] font-bold text-blue-950">{proj.folio}</p>
                                    <p className="truncate text-[12px] font-medium text-slate-900">{r.displayName}</p>
                                    <p className="text-[10px] text-slate-500">
                                      {kindLabelFlujo(r.kind)} · {fmtDate(r.createdAt)}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    className="shrink-0 rounded-lg bg-sky-700 px-2.5 py-1 text-[11px] font-semibold text-white"
                                    onClick={() => void onOpenFlujo(r)}
                                  >
                                    Abrir
                                  </button>
                                </li>
                              )),
                            ),
                          )}
                        </ul>
                      </details>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
