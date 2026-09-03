import { useCallback, useEffect, useMemo, useState } from 'react'
import type { OrdenCompraRow } from '../../lib/bodegaOrdenes'
import {
  compareProjectPrioridadNivel,
  hasProjectPrioridad,
  maxPrioridadNivel,
  PROJECT_PRIORIDAD_OPTIONS,
  prioridadRowHighlightClass,
} from '../../lib/bodegaProjectPrioridad'
import {
  fetchBodegaProjectsPrioridadList,
  fetchOrdenesCompra,
  type BodegaProjectPrioridadRow,
} from '../../lib/bodegaProjectsPrioridadRepo'
import type { AppRole } from '../../lib/roles'
import { BodegaProjectPrioridadBadge } from './BodegaProjectPrioridadBadge.tsx'

type OcGroup = {
  key: string
  ordenCompraId: string | null
  headerTitle: string
  headerSubtitle: string | null
  projects: BodegaProjectPrioridadRow[]
}

const STATUS_ES: Record<string, string> = {
  pendiente: 'Pendiente',
  en_diseno: 'En diseño',
  revision_diseno: 'Revisión diseño',
  modificacion_diseno: 'Modificación',
  diseno_parcial: 'Diseño parcial',
  diseno_aprobado: 'Diseño aprobado',
  en_programacion: 'En programación',
  revision_programacion: 'Revisión prog.',
  terminado: 'Terminado',
}

type Props = {
  role: AppRole
  onOpenProject: (projectId: string) => void
}

export function BodegaPrioridadesPage(props: Props) {
  const [rows, setRows] = useState<BodegaProjectPrioridadRow[]>([])
  const [ordenes, setOrdenes] = useState<OrdenCompraRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [onlyPrioridad, setOnlyPrioridad] = useState(true)
  const [expandedOcKeys, setExpandedOcKeys] = useState<Set<string>>(() => new Set())

  const ordenById = useMemo(() => new Map(ordenes.map((o) => [o.id, o])), [ordenes])

  const load = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      setRows(await fetchBodegaProjectsPrioridadList())
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
    let list = rows
    if (onlyPrioridad) list = list.filter((r) => hasProjectPrioridad(r.prioridadNivel))
    const s = q.trim().toLowerCase()
    if (!s) return list
    return list.filter((r) => {
      const oc = r.orden_compra_id ? ordenById.get(r.orden_compra_id) : undefined
      const hay = `${r.folio} ${r.nombre} ${r.cliente} ${r.empresa ?? ''} ${oc?.numero ?? ''}`.toLowerCase()
      return hay.includes(s)
    })
  }, [rows, q, ordenById, onlyPrioridad])

  const globalQueue = useMemo(() => {
    return [...filtered]
      .filter((r) => hasProjectPrioridad(r.prioridadNivel))
      .sort((a, b) => {
        const pc = compareProjectPrioridadNivel(a.prioridadNivel, b.prioridadNivel)
        if (pc !== 0) return pc
        return a.folio.localeCompare(b.folio, 'es')
      })
  }, [filtered])

  const groupedByOc = useMemo((): OcGroup[] => {
    const bucket = new Map<string, BodegaProjectPrioridadRow[]>()
    for (const r of filtered) {
      const k =
        r.orden_compra_id && String(r.orden_compra_id).trim() !== '' ? `oc:${r.orden_compra_id}` : 'sin-oc'
      if (!bucket.has(k)) bucket.set(k, [])
      bucket.get(k)!.push(r)
    }
    const out: OcGroup[] = []
    for (const [k, list] of bucket) {
      const projects = [...list].sort((a, b) => {
        const pc = compareProjectPrioridadNivel(a.prioridadNivel, b.prioridadNivel)
        if (pc !== 0) return pc
        return a.folio.localeCompare(b.folio, 'es')
      })
      if (k === 'sin-oc') {
        out.push({
          key: k,
          ordenCompraId: null,
          headerTitle: 'Sin orden de compra',
          headerSubtitle: null,
          projects,
        })
      } else {
        const id = k.slice(3)
        const oc = ordenById.get(id)
        out.push({
          key: k,
          ordenCompraId: id,
          headerTitle: `OC ${oc?.numero?.trim() || id.slice(0, 8)}`,
          headerSubtitle: oc?.empresa?.nombre?.trim() || null,
          projects,
        })
      }
    }
    out.sort((a, b) => {
      if (a.key === 'sin-oc') return 1
      if (b.key === 'sin-oc') return -1
      return maxPrioridadNivel(b.projects.map((p) => p.prioridadNivel)) - maxPrioridadNivel(a.projects.map((p) => p.prioridadNivel))
    })
    return out
  }, [filtered, ordenById])

  const ocGroupKeysSig = useMemo(() => groupedByOc.map((g) => g.key).join('|'), [groupedByOc])

  useEffect(() => {
    const keys = groupedByOc.map((g) => g.key)
    if (keys.length <= 6) setExpandedOcKeys(new Set(keys))
    else setExpandedOcKeys(new Set(keys.slice(0, 3)))
  }, [ocGroupKeysSig, groupedByOc])

  function toggleOc(key: string) {
    setExpandedOcKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const openTabHint =
    props.role === 'programadora_maquinaria' ? 'programación' : props.role === 'disenadora' ? 'diseño' : 'proyecto'

  return (
    <section className="space-y-6">
      <header className="overflow-hidden rounded-2xl border border-rose-200/60 bg-gradient-to-br from-rose-950 via-rose-900 to-section-navy shadow-lg">
        <div className="px-5 py-6 sm:px-8 sm:py-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-rose-200/90">Taller · Planificación</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-[1.65rem]">Prioridades</h1>
          <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-rose-50/90 sm:text-[14px]">
            Qué proyectos atender primero, <strong className="text-white">entre todas las órdenes de compra</strong>.
            El encargado asigna el nivel; aquí solo consultas y abres el proyecto en Bodega.
          </p>
        </div>
      </header>

      <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:p-5">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Escala (mayor número = más urgente)</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {PROJECT_PRIORIDAD_OPTIONS.filter((o) => o.nivel > 0).map((o) => (
            <span
              key={o.nivel}
              className={[
                'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-bold',
                o.badgeClass,
              ].join(' ')}
            >
              <span className="tabular-nums opacity-80">{o.nivel}</span>
              {o.short}
            </span>
          ))}
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{error}</div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <label className="block min-w-0 flex-1 sm:max-w-md">
          <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Buscar</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Folio, nombre, cliente, N° OC…"
            className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-[13px] shadow-sm outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-300/35"
          />
        </label>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] font-semibold text-slate-800">
          <input
            type="checkbox"
            checked={onlyPrioridad}
            onChange={(e) => setOnlyPrioridad(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Solo con prioridad asignada
        </label>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-14 text-center text-[14px] text-slate-600">
          Cargando…
        </div>
      ) : globalQueue.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-14 text-center">
          <p className="text-[16px] font-bold text-slate-800">
            {onlyPrioridad ? 'No hay proyectos con prioridad ahora' : 'Sin proyectos que coincidan'}
          </p>
          <p className="mx-auto mt-2 max-w-md text-[13px] text-slate-600">
            Cuando el supervisor marque urgencia en un folio, aparecerá aquí arriba del resto.
          </p>
        </div>
      ) : (
        <>
          <section className="overflow-hidden rounded-2xl border-2 border-rose-300/70 bg-white shadow-md ring-1 ring-rose-900/[0.06]">
            <div className="border-b border-rose-100 bg-gradient-to-r from-rose-50 to-white px-4 py-4 sm:px-5">
              <h2 className="text-[15px] font-bold text-rose-950">Orden de trabajo sugerido</h2>
              <p className="mt-1 text-[12px] text-slate-600">
                {globalQueue.length} proyecto{globalQueue.length === 1 ? '' : 's'} — el #1 es el más urgente de todo el
                taller.
              </p>
            </div>
            <ol className="divide-y divide-rose-50">
              {globalQueue.map((r, idx) => {
                const oc = r.orden_compra_id ? ordenById.get(r.orden_compra_id) : undefined
                return (
                  <li key={r.id} className="flex flex-wrap items-center gap-2 px-4 py-3.5 sm:px-5 sm:gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-100 text-[13px] font-black text-rose-800">
                      {idx + 1}
                    </span>
                    <BodegaProjectPrioridadBadge nivel={r.prioridadNivel} />
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-[13px] font-bold text-slate-900">{r.folio}</p>
                      <p className="truncate text-[12px] text-slate-600">{r.nombre}</p>
                      <p className="text-[11px] text-slate-500">
                        OC {oc?.numero?.trim() || '—'} · {STATUS_ES[r.status] ?? r.status} · {r.avance_pct}%
                      </p>
                    </div>
                    <button
                      type="button"
                      className="shrink-0 rounded-xl bg-section-navy px-4 py-2 text-[12px] font-bold text-white shadow-sm hover:brightness-110"
                      onClick={() => props.onOpenProject(r.id)}
                    >
                      Abrir en Bodega
                    </button>
                  </li>
                )
              })}
            </ol>
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-3.5 sm:px-5">
              <h2 className="text-[14px] font-bold text-slate-900">Por orden de compra</h2>
              <p className="mt-0.5 text-[12px] text-slate-600">Misma prioridad, agrupada por OC.</p>
            </div>
            <div className="max-h-[min(50vh,480px)] space-y-3 overflow-y-auto p-3 sm:p-4">
              {groupedByOc.map((grp) => {
                const open = expandedOcKeys.has(grp.key)
                const maxPri = maxPrioridadNivel(grp.projects.map((p) => p.prioridadNivel))
                return (
                  <div key={grp.key} className="overflow-hidden rounded-xl border border-slate-200/90 bg-slate-50/50">
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 border-b border-slate-200/80 bg-white px-4 py-3 text-left"
                      onClick={() => toggleOc(grp.key)}
                    >
                      <span className={`text-slate-500 transition ${open ? 'rotate-180' : ''}`} aria-hidden>
                        ▼
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-[14px] font-bold text-slate-900">{grp.headerTitle}</p>
                        {grp.headerSubtitle ? (
                          <p className="text-[11px] text-slate-600">{grp.headerSubtitle}</p>
                        ) : null}
                      </div>
                      {hasProjectPrioridad(maxPri) ? <BodegaProjectPrioridadBadge nivel={maxPri} /> : null}
                      <span className="text-[11px] font-semibold text-slate-500">{grp.projects.length} proy.</span>
                    </button>
                    {open ? (
                      <ul className="divide-y divide-slate-100">
                        {grp.projects.map((r) => (
                          <li
                            key={r.id}
                            className={[
                              'flex flex-wrap items-center gap-2 bg-white px-4 py-3',
                              prioridadRowHighlightClass(r.prioridadNivel),
                            ].join(' ')}
                          >
                            <BodegaProjectPrioridadBadge nivel={r.prioridadNivel} />
                            <span className="font-mono text-[12px] font-bold">{r.folio}</span>
                            <span className="min-w-0 flex-1 truncate text-[13px] text-slate-800">{r.nombre}</span>
                            <button
                              type="button"
                              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-800 hover:bg-slate-50"
                              onClick={() => props.onOpenProject(r.id)}
                            >
                              Abrir · {openTabHint}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </section>
        </>
      )}
    </section>
  )
}
