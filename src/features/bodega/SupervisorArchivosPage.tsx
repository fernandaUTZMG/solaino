import { useCallback, useEffect, useMemo, useState } from 'react'
import type { PostgrestSingleResponse } from '@supabase/supabase-js'
import { getSupabase } from '../../lib/supabaseClient'
import { canAccessBodegaArchivosDisenoNav, canSetBodegaProjectPrioridad, type AppRole } from '../../lib/roles'
import { fetchOrdenesCompra, type OrdenCompraRow } from '../../lib/bodegaOrdenes'
import { fetchDesignVersions } from '../../lib/designVersionsRepo'
import { runDesignZipUpload, runDesignZipUploadForOcProjects } from '../../lib/bodegaDesignUploadFlow'
import {
  compareProjectPrioridadNivel,
  hasProjectPrioridad,
  maxPrioridadNivel,
  parsePrioridadFromRow,
  prioridadMeta,
  type ProjectPrioridadNivel,
} from '../../lib/bodegaProjectPrioridad'
import { updateBodegaProjectPrioridadNivel } from '../../lib/bodegaProjectPrioridadUpdate'
import { IconNavArchivos } from '../../ui/shellIcons.tsx'
import { BodegaProjectPrioridadBadge } from './BodegaProjectPrioridadBadge.tsx'
import { BodegaProjectPrioridadControl } from './BodegaProjectPrioridadControl.tsx'
import { archivosUi } from './supervisorArchivosUi.ts'

type ProjectRow = {
  id: string
  folio: string
  nombre: string
  status: string
  cliente: string
  empresa: string | null
  orden_compra_id: string | null
  avance_pct: number
  prioridadNivel: ProjectPrioridadNivel
  created_at: string
}

function safeText(v: unknown): string {
  if (v == null) return ''
  return String(v).trim()
}

function clampPct(v: unknown): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return 0
  return Math.min(100, Math.max(0, Math.round(n)))
}

function statusLabelEs(s: string): string {
  const m: Record<string, string> = {
    pendiente: 'Pendiente',
    en_diseno: 'En diseño',
    revision_diseno: 'Revisión diseño',
    modificacion_diseno: 'Modificación diseño',
    diseno_parcial: 'Diseño parcial',
    diseno_aprobado: 'Diseño aprobado',
    en_programacion: 'En programación',
    revision_programacion: 'Revisión programación',
    terminado: 'Terminado',
  }
  return m[s] ?? s
}

function statusPillClass(status: string): string {
  switch (status) {
    case 'terminado':
      return 'bg-emerald-100 text-emerald-900 ring-emerald-200/70'
    case 'diseno_aprobado':
      return 'bg-violet-100 text-violet-900 ring-violet-200/70'
    case 'en_diseno':
    case 'revision_diseno':
    case 'modificacion_diseno':
      return 'bg-sky-100 text-sky-900 ring-sky-200/70'
    case 'en_programacion':
    case 'revision_programacion':
      return 'bg-amber-100 text-amber-950 ring-amber-200/70'
    case 'pendiente':
      return 'bg-slate-100 text-slate-800 ring-slate-200/80'
    default:
      return 'bg-slate-100 text-slate-700 ring-slate-200/60'
  }
}

type OcProjectGroup = {
  key: string
  ordenCompraId: string | null
  headerTitle: string
  headerSubtitle: string | null
  projects: ProjectRow[]
}

export function SupervisorArchivosPage(props: { role: AppRole; onUploaded?: () => void }) {
  const [rows, setRows] = useState<ProjectRow[]>([])
  const [ordenes, setOrdenes] = useState<OrdenCompraRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [comment, setComment] = useState('')
  const [uploadBusy, setUploadBusy] = useState(false)
  const [uploadPhase, setUploadPhase] = useState('')
  const [prioridadBusyId, setPrioridadBusyId] = useState<string | null>(null)
  const [expandedOcKeys, setExpandedOcKeys] = useState<Set<string>>(() => new Set())
  /** proyecto = un folio; oc = mismo ZIP en todos los proyectos de la OC */
  const [uploadTarget, setUploadTarget] = useState<'proyecto' | 'oc'>('proyecto')
  const [selectedOcId, setSelectedOcId] = useState<string | null>(null)

  const ordenById = useMemo(() => new Map(ordenes.map((o) => [o.id, o])), [ordenes])

  const load = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const sb = getSupabase()
      const baseWithOc = 'id, folio, nombre, status, cliente, empresa, orden_compra_id, avance_pct, created_at'
      const baseNoOc = 'id, folio, nombre, status, cliente, empresa, avance_pct, created_at'
      const priNivel = ', prioridad_nivel'
      const priLegacy = ', prioridad'

      let res = (await sb
        .from('bodega_projects')
        .select(`${baseWithOc}${priNivel}${priLegacy}`)
        .order('created_at', { ascending: false })) as PostgrestSingleResponse<Record<string, unknown>[]>

      let msg = [res.error?.message, res.error?.details].filter(Boolean).join(' ')
      if (res.error && /prioridad_nivel/i.test(msg)) {
        res = (await sb
          .from('bodega_projects')
          .select(`${baseWithOc}${priLegacy}`)
          .order('created_at', { ascending: false })) as PostgrestSingleResponse<Record<string, unknown>[]>
        msg = [res.error?.message, res.error?.details].filter(Boolean).join(' ')
      }
      if (res.error && /prioridad/i.test(msg)) {
        res = (await sb
          .from('bodega_projects')
          .select(baseWithOc)
          .order('created_at', { ascending: false })) as PostgrestSingleResponse<Record<string, unknown>[]>
        msg = [res.error?.message, res.error?.details].filter(Boolean).join(' ')
      }

      if (res.error && (msg.includes('orden_compra_id') || (/\bcolumn\b/i.test(msg) && /\bdoes not exist\b/i.test(msg)))) {
        res = (await sb
          .from('bodega_projects')
          .select(`${baseNoOc}${priNivel}${priLegacy}`)
          .order('created_at', { ascending: false })) as PostgrestSingleResponse<Record<string, unknown>[]>
        msg = [res.error?.message, res.error?.details].filter(Boolean).join(' ')
        if (res.error && /prioridad_nivel/i.test(msg)) {
          res = (await sb
            .from('bodega_projects')
            .select(`${baseNoOc}${priLegacy}`)
            .order('created_at', { ascending: false })) as PostgrestSingleResponse<Record<string, unknown>[]>
          msg = [res.error?.message, res.error?.details].filter(Boolean).join(' ')
        }
        if (res.error && /prioridad/i.test(msg)) {
          res = (await sb
            .from('bodega_projects')
            .select(baseNoOc)
            .order('created_at', { ascending: false })) as PostgrestSingleResponse<Record<string, unknown>[]>
        }
        if (res.error) throw res.error
      } else if (res.error) {
        throw res.error
      }

      const list = (res.data as Record<string, unknown>[]) ?? []
      const mapped: ProjectRow[] = list.map((r) => ({
        id: safeText(r.id),
        folio: safeText(r.folio),
        nombre: safeText(r.nombre),
        status: safeText(r.status) || 'pendiente',
        cliente: safeText(r.cliente),
        empresa: r.empresa != null ? safeText(r.empresa) : null,
        orden_compra_id: r.orden_compra_id != null && String(r.orden_compra_id).trim() !== '' ? String(r.orden_compra_id) : null,
        avance_pct: clampPct(r.avance_pct),
        prioridadNivel: parsePrioridadFromRow(r),
        created_at: safeText(r.created_at),
      }))
      setRows(mapped)
      try {
        setOrdenes(await fetchOrdenesCompra())
      } catch {
        setOrdenes([])
      }
    } catch (e) {
      setRows([])
      setError(e instanceof Error ? e.message : 'No se pudo cargar proyectos')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return rows
    return rows.filter((r) => {
      const oc = r.orden_compra_id ? ordenById.get(r.orden_compra_id) : undefined
      const hay = `${r.folio} ${r.nombre} ${r.cliente} ${r.empresa ?? ''} ${r.status} ${oc?.numero ?? ''}`.toLowerCase()
      return hay.includes(s)
    })
  }, [rows, q, ordenById])

  const groupedByOrdenCompra = useMemo((): OcProjectGroup[] => {
    const bucket = new Map<string, ProjectRow[]>()
    for (const r of filtered) {
      const k =
        r.orden_compra_id && String(r.orden_compra_id).trim() !== ''
          ? `oc:${r.orden_compra_id}`
          : 'sin-oc'
      if (!bucket.has(k)) bucket.set(k, [])
      bucket.get(k)!.push(r)
    }
    const out: OcProjectGroup[] = []
    for (const [k, list] of bucket) {
      const projects = [...list].sort((a, b) => {
        const pc = compareProjectPrioridadNivel(a.prioridadNivel, b.prioridadNivel)
        if (pc !== 0) return pc
        return b.created_at.localeCompare(a.created_at)
      })
      if (k === 'sin-oc') {
        out.push({
          key: k,
          ordenCompraId: null,
          headerTitle: 'Sin orden de compra vinculada',
          headerSubtitle: 'Proyectos sin OC registrada en la app',
          projects,
        })
      } else {
        const id = k.slice(3)
        const oc = ordenById.get(id)
        const num = oc?.numero?.trim() || id.slice(0, 8)
        const emp = oc?.empresa?.nombre?.trim()
        out.push({
          key: k,
          ordenCompraId: id,
          headerTitle: `Orden de compra · ${num}`,
          headerSubtitle: emp || null,
          projects,
        })
      }
    }
    out.sort((a, b) => {
      if (a.key === 'sin-oc') return 1
      if (b.key === 'sin-oc') return -1
      const pa = maxPrioridadNivel(a.projects.map((p) => p.prioridadNivel))
      const pb = maxPrioridadNivel(b.projects.map((p) => p.prioridadNivel))
      if (pa !== pb) return pb - pa
      const ta = Math.max(...a.projects.map((p) => Date.parse(p.created_at) || 0))
      const tb = Math.max(...b.projects.map((p) => Date.parse(p.created_at) || 0))
      return tb - ta
    })
    return out
  }, [filtered, ordenById])

  const groupKeyForProject = useCallback((r: ProjectRow) => {
    return r.orden_compra_id && String(r.orden_compra_id).trim() !== ''
      ? `oc:${r.orden_compra_id}`
      : 'sin-oc'
  }, [])

  const ocGroupKeysSig = useMemo(
    () => groupedByOrdenCompra.map((g) => g.key).join('|'),
    [groupedByOrdenCompra],
  )

  useEffect(() => {
    const keys = groupedByOrdenCompra.map((g) => g.key)
    if (keys.length === 0) {
      setExpandedOcKeys(new Set())
      return
    }
    if (keys.length <= 5) {
      setExpandedOcKeys(new Set(keys))
      return
    }
    const next = new Set(keys.slice(0, 3))
    for (const g of groupedByOrdenCompra) {
      if (g.projects.some((p) => hasProjectPrioridad(p.prioridadNivel))) next.add(g.key)
    }
    setExpandedOcKeys(next)
  }, [ocGroupKeysSig, groupedByOrdenCompra])

  useEffect(() => {
    setNotice(null)
  }, [selectedId, selectedOcId, uploadTarget])

  const ocGroupsWithId = useMemo(
    () => groupedByOrdenCompra.filter((g) => g.ordenCompraId != null && g.projects.length > 0),
    [groupedByOrdenCompra],
  )

  const selectedOcGroup = useMemo(
    () => (selectedOcId ? ocGroupsWithId.find((g) => g.ordenCompraId === selectedOcId) : undefined),
    [selectedOcId, ocGroupsWithId],
  )

  useEffect(() => {
    if (!selectedId) return
    const sel = rows.find((r) => r.id === selectedId)
    if (!sel) return
    const k = groupKeyForProject(sel)
    setExpandedOcKeys((prev) => {
      if (prev.has(k)) return prev
      const next = new Set(prev)
      next.add(k)
      return next
    })
  }, [selectedId, rows, groupKeyForProject])

  function toggleOcExpanded(key: string) {
    setExpandedOcKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const selected = selectedId ? rows.find((r) => r.id === selectedId) : undefined
  const selectedGroup = selected ? groupedByOrdenCompra.find((g) => g.key === groupKeyForProject(selected)) : undefined

  function selectOcForUpload(ordenCompraId: string) {
    setUploadTarget('oc')
    setSelectedOcId(ordenCompraId)
    setSelectedId(null)
    setExpandedOcKeys((prev) => {
      const next = new Set(prev)
      next.add(`oc:${ordenCompraId}`)
      return next
    })
  }

  const canSubmitUpload =
    uploadTarget === 'proyecto' ? Boolean(selected) : Boolean(selectedOcGroup && selectedOcGroup.projects.length > 0)

  async function onPickZip(file: File | null) {
    if (!file || !canSubmitUpload) return
    setUploadBusy(true)
    setUploadPhase('Analizando ZIP…')
    setError(null)
    setNotice(null)
    try {
      if (uploadTarget === 'oc' && selectedOcGroup) {
        const ocNumero = ordenById.get(selectedOcGroup.ordenCompraId!)?.numero?.trim() || selectedOcGroup.ordenCompraId!
        const result = await runDesignZipUploadForOcProjects({
          projects: selectedOcGroup.projects.map((p) => ({
            id: p.id,
            folio: p.folio,
            status: p.status,
          })),
          ocNumero,
          file,
          comment: comment.trim() || null,
          uploaderRole: props.role,
          onPhase: setUploadPhase,
          uploadOrigin: 'archivos_supervisor_oc',
          packageCategory: 'info_cliente',
          loadExistingVersions: fetchDesignVersions,
        })
        const ocNum = ordenById.get(selectedOcGroup.ordenCompraId!)?.numero?.trim() || selectedOcGroup.ordenCompraId
        let msg = `Orden ${ocNum}: información subida a ${result.okFolios.length} proyecto(s) (${result.okFolios.join(', ')}). Cada folio la verá en Diseño → Información del cliente.`
        if (result.failed.length > 0) {
          msg += ` No se pudo en: ${result.failed.map((f) => `${f.folio} (${f.error})`).join('; ')}.`
        }
        setNotice(msg)
      } else if (selected) {
        const versions = await fetchDesignVersions(selected.id)
        await runDesignZipUpload({
          project: { id: selected.id, folio: selected.folio, status: selected.status },
          file,
          comment: comment.trim() || null,
          existingDesignVersions: versions,
          uploaderRole: props.role,
          onPhase: setUploadPhase,
          uploadOrigin: 'archivos_supervisor',
          packageCategory: 'info_cliente',
        })
        setNotice(
          `Proyecto ${selected.folio}. La diseñadora lo verá en Bodega → Diseño → Información del cliente (solo descarga).`,
        )
      }
      setComment('')
      await load()
      props.onUploaded?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo subir el archivo')
    } finally {
      setUploadBusy(false)
      setUploadPhase('')
    }
  }

  async function setProjectPrioridadNivel(r: ProjectRow, nivel: ProjectPrioridadNivel) {
    if (!canSetBodegaProjectPrioridad(props.role)) return
    if (prioridadBusyId) return
    setPrioridadBusyId(r.id)
    setError(null)
    try {
      await updateBodegaProjectPrioridadNivel({
        projectId: r.id,
        previousNivel: r.prioridadNivel,
        newNivel: nivel,
      })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo actualizar la prioridad')
    } finally {
      setPrioridadBusyId(null)
    }
  }

  const globalPriorityQueue = useMemo(() => {
    return [...filtered]
      .filter((r) => hasProjectPrioridad(r.prioridadNivel))
      .sort((a, b) => {
        const pc = compareProjectPrioridadNivel(a.prioridadNivel, b.prioridadNivel)
        if (pc !== 0) return pc
        return a.folio.localeCompare(b.folio, 'es')
      })
  }, [filtered])

  if (!canAccessBodegaArchivosDisenoNav(props.role)) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 shadow-sm">
        No tienes acceso a esta sección.
      </div>
    )
  }

  const canPrior = canSetBodegaProjectPrioridad(props.role)

  return (
    <section className={archivosUi.page}>
      <header className={archivosUi.hero}>
        <div className={archivosUi.heroBody}>
          <div className="flex items-start gap-4">
            <div className="hidden rounded-xl border border-white/15 bg-white/10 p-3 sm:block">
              <IconNavArchivos className="h-8 w-8 text-sky-200" />
            </div>
            <div className="min-w-0 flex-1">
              <p className={archivosUi.heroKicker}>Bodega · Ref. supervisor</p>
              <h1 className={archivosUi.heroTitle}>Archivos para la diseñadora</h1>
              <p className={archivosUi.heroText}>
                Sube aquí el ZIP de referencia del cliente (bocetos, correos, especificaciones). La diseñadora lo
                consulta en cada proyecto, pestaña <strong className="text-white">Diseño → Información del cliente</strong>.
                No sustituye la entrega formal de diseño.
              </p>
              <div className={archivosUi.flowStrip}>
                <div className={archivosUi.flowStep}>
                  <span className={archivosUi.flowNum}>1</span>
                  <div>
                    <p className={archivosUi.flowStepTitle}>Busca por OC o folio</p>
                    <p className={archivosUi.flowStepDesc}>
                      Agrupa por OC y asigna nivel de prioridad (urgente &gt; alta &gt; media &gt; baja).
                    </p>
                  </div>
                </div>
                <div className={archivosUi.flowStep}>
                  <span className={archivosUi.flowNum}>2</span>
                  <div>
                    <p className={archivosUi.flowStepTitle}>Proyecto u OC completa</p>
                    <p className={archivosUi.flowStepDesc}>
                      Un folio, o la misma info para todos los proyectos de la orden.
                    </p>
                  </div>
                </div>
                <div className={archivosUi.flowStep}>
                  <span className={archivosUi.flowNum}>3</span>
                  <div>
                    <p className={archivosUi.flowStepTitle}>Sube el ZIP</p>
                    <p className={archivosUi.flowStepDesc}>Comentario opcional para contexto.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 shadow-sm">{error}</div>
      ) : null}

      {globalPriorityQueue.length > 0 ? (
        <section className="overflow-hidden rounded-2xl border border-rose-200/90 bg-gradient-to-br from-rose-50/90 to-white shadow-sm ring-1 ring-rose-900/[0.04]">
          <div className="border-b border-rose-100 bg-white/80 px-4 py-3.5 sm:px-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-rose-800/90">
              Cola global de prioridad
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-slate-700">
              Orden entre <strong>todas</strong> las órdenes de compra: el proyecto más urgente arriba (4 Urgente → 1
              Baja). Cada folio tiene su propio nivel.
            </p>
          </div>
          <ol className="divide-y divide-rose-100/80">
            {globalPriorityQueue.map((r, idx) => {
              const oc = r.orden_compra_id ? ordenById.get(r.orden_compra_id) : undefined
              const sel = r.id === selectedId
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    className={[
                      'flex w-full flex-wrap items-center gap-2 px-4 py-3 text-left transition sm:px-5',
                      sel ? 'bg-sky-50' : 'hover:bg-white/80',
                    ].join(' ')}
                    onClick={() => setSelectedId(r.id)}
                  >
                    <span className="w-6 shrink-0 text-[12px] font-bold tabular-nums text-rose-400">{idx + 1}</span>
                    <BodegaProjectPrioridadBadge nivel={r.prioridadNivel} />
                    <span className="font-mono text-[12px] font-bold text-slate-900">{r.folio}</span>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-slate-700">{r.nombre}</span>
                    <span className="shrink-0 text-[11px] font-semibold text-slate-500">
                      OC {oc?.numero?.trim() || '—'}
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        </section>
      ) : null}

      <div className={archivosUi.mainGrid}>
        <div className={archivosUi.explorerCard}>
          <div className={archivosUi.explorerHead}>
            <p className={archivosUi.explorerTitle}>Proyectos por orden de compra</p>
            <p className={archivosUi.explorerSub}>
              Expande cada OC para ver sus folios. Si hay muchas órdenes, usa la búsqueda o abre solo la que necesitas.
            </p>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar: N° OC, folio, nombre, cliente, empresa…"
              className={archivosUi.searchInput}
              aria-label="Buscar proyectos"
            />
            {!loading ? (
              <div className={archivosUi.statsRow}>
                <span className={archivosUi.statPill}>
                  <span className="font-bold tabular-nums text-slate-900">{groupedByOrdenCompra.length}</span> orden
                  {groupedByOrdenCompra.length === 1 ? '' : 'es'} de compra
                </span>
                <span className={archivosUi.statPill}>
                  <span className="font-bold tabular-nums text-slate-900">{filtered.length}</span> proyecto
                  {filtered.length === 1 ? '' : 's'}
                </span>
                {globalPriorityQueue.length > 0 ? (
                  <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-900">
                    {globalPriorityQueue.length} con prioridad
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className={archivosUi.listScroll}>
            {loading ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-14 text-center text-[13px] font-medium text-slate-500">
                Cargando proyectos…
              </div>
            ) : filtered.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-14 text-center">
                <p className="text-[15px] font-bold text-slate-800">Sin resultados</p>
                <p className="mt-1 text-[13px] text-slate-600">Prueba otro término o quita el filtro de búsqueda.</p>
              </div>
            ) : (
              groupedByOrdenCompra.map((grp) => {
                const open = expandedOcKeys.has(grp.key)
                const grpMaxPri = maxPrioridadNivel(grp.projects.map((p) => p.prioridadNivel))
                const hasPrior = hasProjectPrioridad(grpMaxPri)
                return (
                  <section key={grp.key} className={archivosUi.ocGroup}>
                    <div
                      className={[archivosUi.ocHeaderBtn, open ? archivosUi.ocHeaderOpen : ''].filter(Boolean).join(' ')}
                    >
                      <div
                        role="button"
                        tabIndex={0}
                        aria-expanded={open}
                        className="flex min-w-0 flex-1 cursor-pointer items-start gap-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                        onClick={() => toggleOcExpanded(grp.key)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            toggleOcExpanded(grp.key)
                          }
                        }}
                      >
                        <span
                          className={[
                            archivosUi.ocChevron,
                            open ? 'rotate-180 border-sky-300 text-sky-800' : '',
                          ].join(' ')}
                          aria-hidden
                        >
                          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5}>
                            <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                            {grp.ordenCompraId ? 'Orden de compra' : 'Sin OC'}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <span className={archivosUi.ocBadge}>
                              {grp.ordenCompraId
                                ? ordenById.get(grp.ordenCompraId)?.numero?.trim() || grp.headerTitle.replace(/^Orden de compra · /, '')
                                : 'Manual / sin OC'}
                            </span>
                            {hasPrior ? <BodegaProjectPrioridadBadge nivel={grpMaxPri} /> : null}
                          </div>
                          {grp.headerSubtitle ? (
                            <p className="mt-1 text-[12px] font-medium text-slate-600">{grp.headerSubtitle}</p>
                          ) : null}
                        </div>
                        <span className={archivosUi.ocCount}>
                          {grp.projects.length} proy.
                        </span>
                      </div>
                      {grp.ordenCompraId ? (
                        <button
                          type="button"
                          className={[
                            'mr-3 mt-1 shrink-0 self-start rounded-lg border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide transition',
                            uploadTarget === 'oc' && selectedOcId === grp.ordenCompraId
                              ? 'border-sky-500 bg-sky-600 text-white shadow-sm'
                              : 'border-slate-200 bg-white text-slate-700 hover:border-sky-300 hover:bg-sky-50',
                          ].join(' ')}
                          title="Subir el mismo ZIP a todos los proyectos de esta orden"
                          onClick={() => selectOcForUpload(grp.ordenCompraId!)}
                        >
                          Todos
                        </button>
                      ) : null}
                    </div>
                    {open ? (
                      <div className={archivosUi.ocBody}>
                        {grp.projects.map((r) => {
                          const sel = r.id === selectedId
                          return (
                            <div
                              key={r.id}
                              className={[
                                archivosUi.projectCard,
                                sel ? archivosUi.projectCardSel : archivosUi.projectCardIdle,
                                hasProjectPrioridad(r.prioridadNivel) ? prioridadMeta(r.prioridadNivel).cardRingClass : '',
                              ].join(' ')}
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setUploadTarget('proyecto')
                                  setSelectedOcId(null)
                                  setSelectedId(r.id)
                                }}
                                className={[archivosUi.projectMain, 'outline-none focus-visible:ring-2 focus-visible:ring-sky-500'].join(
                                  ' ',
                                )}
                              >
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="inline-flex rounded-lg bg-slate-900 px-2.5 py-1 font-mono text-[11px] font-bold text-white">
                                    {r.folio}
                                  </span>
                                  <BodegaProjectPrioridadBadge nivel={r.prioridadNivel} />
                                  <span
                                    className={[
                                      'inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset',
                                      statusPillClass(r.status),
                                    ].join(' ')}
                                  >
                                    {statusLabelEs(r.status)}
                                  </span>
                                  {sel ? (
                                    <span className="ml-auto text-[10px] font-bold uppercase text-sky-800">Seleccionado</span>
                                  ) : null}
                                </div>
                                <p className="mt-2 text-[14px] font-bold leading-snug text-slate-900">{r.nombre}</p>
                                <p className="mt-1 text-[12px] text-slate-600">
                                  <span className="font-semibold text-slate-500">Cliente:</span> {r.cliente || '—'}
                                </p>
                              </button>
                              {canPrior ? (
                                <div className="flex shrink-0 items-center border-t border-slate-100 px-3 py-2.5 sm:border-l sm:border-t-0 sm:px-3">
                                  <BodegaProjectPrioridadControl
                                    compact
                                    nivel={r.prioridadNivel}
                                    canEdit
                                    busy={prioridadBusyId === r.id}
                                    onChange={(nivel) => void setProjectPrioridadNivel(r, nivel)}
                                  />
                                </div>
                              ) : (
                                <div className="flex shrink-0 items-center px-3 py-2.5 sm:border-l sm:border-slate-100">
                                  <BodegaProjectPrioridadBadge nivel={r.prioridadNivel} />
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    ) : null}
                  </section>
                )
              })
            )}
          </div>
        </div>

        <aside className={archivosUi.uploadCard}>
          <div className={archivosUi.uploadHead}>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-sky-100/90">Paso 3</p>
            <h2 className="mt-0.5 text-lg font-bold text-white">Subir referencia (ZIP)</h2>
            <p className="mt-1 text-[12px] leading-relaxed text-sky-50/90">
              Material para la diseñadora — no es entrega de diseño a revisar.
            </p>
          </div>
          <div className={archivosUi.uploadBody}>
            <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                className={[
                  'flex-1 rounded-lg px-2 py-2 text-[11px] font-bold transition',
                  uploadTarget === 'proyecto' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900',
                ].join(' ')}
                onClick={() => {
                  setUploadTarget('proyecto')
                  setSelectedOcId(null)
                }}
              >
                Un proyecto
              </button>
              <button
                type="button"
                className={[
                  'flex-1 rounded-lg px-2 py-2 text-[11px] font-bold transition',
                  uploadTarget === 'oc' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900',
                ].join(' ')}
                onClick={() => {
                  setUploadTarget('oc')
                  setSelectedId(null)
                }}
              >
                Toda la OC
              </button>
            </div>

            {uploadTarget === 'oc' ? (
              <label className="block">
                <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Orden de compra</span>
                <select
                  value={selectedOcId ?? ''}
                  onChange={(e) => setSelectedOcId(e.target.value || null)}
                  disabled={uploadBusy || ocGroupsWithId.length === 0}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[13px] text-slate-900 shadow-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-300/35 disabled:bg-slate-50"
                >
                  <option value="">— Elige orden de compra —</option>
                  {ocGroupsWithId.map((g) => {
                    const num = ordenById.get(g.ordenCompraId!)?.numero?.trim() || g.ordenCompraId
                    return (
                      <option key={g.key} value={g.ordenCompraId!}>
                        {num} · {g.projects.length} proyecto{g.projects.length === 1 ? '' : 's'}
                      </option>
                    )
                  })}
                </select>
                <p className="mt-1.5 text-[11px] leading-snug text-slate-600">
                  También puedes pulsar <strong className="font-semibold">Todos</strong> en el encabezado de la OC en la lista.
                </p>
              </label>
            ) : null}

            {uploadTarget === 'oc' && selectedOcGroup ? (
              <div className={archivosUi.selectedSummary}>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Orden seleccionada</p>
                <p className="mt-1 font-mono text-[15px] font-bold text-slate-900">
                  {ordenById.get(selectedOcGroup.ordenCompraId!)?.numero?.trim() || selectedOcGroup.ordenCompraId}
                </p>
                <p className="mt-1 text-[12px] text-slate-700">
                  El ZIP se copiará a <strong>{selectedOcGroup.projects.length}</strong> proyecto
                  {selectedOcGroup.projects.length === 1 ? '' : 's'}:
                </p>
                <p className="mt-1 font-mono text-[11px] leading-relaxed text-slate-600">
                  {selectedOcGroup.projects.map((p) => p.folio).join(', ')}
                </p>
              </div>
            ) : uploadTarget === 'proyecto' && selected ? (
              <div className={archivosUi.selectedSummary}>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Proyecto seleccionado</p>
                <p className="mt-1 font-mono text-[15px] font-bold text-slate-900">{selected.folio}</p>
                <p className="mt-0.5 text-[13px] font-semibold text-slate-800">{selected.nombre}</p>
                {selectedGroup ? (
                  <p className="mt-2 border-t border-slate-100 pt-2 text-[11px] text-slate-600">
                    <span className="font-semibold">OC:</span> {selectedGroup.headerTitle.replace(/^Orden de compra · /, '')}
                    {selectedGroup.headerSubtitle ? ` · ${selectedGroup.headerSubtitle}` : ''}
                  </p>
                ) : null}
                {canPrior ? (
                  <div className="mt-3 border-t border-slate-100 pt-3">
                    <BodegaProjectPrioridadControl
                      nivel={selected.prioridadNivel}
                      canEdit
                      busy={prioridadBusyId === selected.id}
                      onChange={(nivel) => void setProjectPrioridadNivel(selected, nivel)}
                    />
                  </div>
                ) : null}
              </div>
            ) : (
              <div className={archivosUi.uploadZone}>
                <IconNavArchivos className="mx-auto h-9 w-9 text-sky-400/80" />
                <p className="mt-3 text-[14px] font-bold text-slate-800">
                  {uploadTarget === 'oc' ? 'Selecciona una orden de compra' : 'Selecciona un proyecto'}
                </p>
                <p className="mt-1 max-w-[16rem] text-[12px] leading-relaxed text-slate-600">
                  {uploadTarget === 'oc'
                    ? 'Elige la OC en el desplegable o el botón «Todos» junto a la orden en la lista.'
                    : 'En la lista de la izquierda, elige un folio dentro de su orden de compra.'}
                </p>
              </div>
            )}

            <label className="block">
              <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Comentario (opcional)</span>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                disabled={!canSubmitUpload || uploadBusy}
                placeholder="Ej. Referencia del cliente, boceto aprobado por correo, medidas acordadas…"
                className="mt-1.5 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[13px] text-slate-900 shadow-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-300/35 disabled:bg-slate-50"
              />
            </label>

            <label
              className={[
                archivosUi.btnPrimary,
                'w-full',
                canSubmitUpload && !uploadBusy ? '' : archivosUi.btnPrimaryDisabled,
              ].join(' ')}
            >
              {uploadBusy
                ? uploadPhase || 'Procesando…'
                : uploadTarget === 'oc'
                  ? 'Elegir ZIP y subir a toda la OC'
                  : 'Elegir ZIP y subir'}
              <input
                type="file"
                accept=".zip,application/zip"
                className="hidden"
                disabled={!canSubmitUpload || uploadBusy}
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null
                  void onPickZip(f)
                  e.currentTarget.value = ''
                }}
              />
            </label>

            {notice ? (
              <div
                className="rounded-xl border-2 border-emerald-300 bg-emerald-50 px-4 py-3.5 text-[13px] leading-relaxed text-emerald-950 shadow-sm ring-1 ring-emerald-200/80"
                role="status"
              >
                <p className="font-bold text-emerald-900">✓ Se adjuntó la información correctamente</p>
                <p className="mt-1.5 text-[12px] text-emerald-900/90">{notice}</p>
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </section>
  )
}
