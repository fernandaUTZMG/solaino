import { useEffect, useMemo, useState } from 'react'
import { clearAuditLogForActor, fetchAuditLogByActor, type AuditRow } from '../../lib/auditRepo'
import { formatFechaHoraLocal } from '../../lib/formatDateTime'
import { getSupabase } from '../../lib/supabaseClient'
import { PaginationBar } from '../../ui/PaginationBar.tsx'
import type { AppRole } from '../../lib/roles'
import { canClearAuditLog } from '../../lib/roles'
import { IconRefresh } from '../../ui/shellIcons'
import { IconCalendar, IconPencil, IconPlus, IconTrash, IconX } from '../../ui/shellIcons'
import { CatalogPageHero, CatalogSearchField, catalogHistoryBtnClass } from './catalogListUi'

type ProfileRow = {
  id: string
  username: string | null
  email: string | null
  role: string
  created_at: string
}

function IconHistory(props: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
      aria-hidden
    >
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </svg>
  )
}

type HistorialTipo = 'crear' | 'modificar' | 'eliminar' | 'otro'

function tipoFromAudit(row: AuditRow): HistorialTipo {
  const a = String(row.action ?? '').toLowerCase()
  if (a.includes('elimin') || a.includes('delete')) return 'eliminar'
  if (a.includes('cread') || a.includes('insert') || a.includes('alta')) return 'crear'
  if (a.includes('actualiz') || a.includes('edit') || a.includes('update') || a.includes('modif')) return 'modificar'
  return 'otro'
}

function tipoLabel(tipo: HistorialTipo): string {
  if (tipo === 'crear') return 'Crear'
  if (tipo === 'modificar') return 'Modificar'
  if (tipo === 'eliminar') return 'Eliminar'
  return 'Otro'
}

function tipoBadgeClass(tipo: HistorialTipo): string {
  if (tipo === 'crear') return 'bg-emerald-100 text-emerald-800'
  if (tipo === 'modificar') return 'bg-sky-100 text-sky-800'
  if (tipo === 'eliminar') return 'bg-rose-100 text-rose-800'
  return 'bg-slate-100 text-slate-700'
}

function TipoIcon(props: { tipo: HistorialTipo; className?: string }) {
  const base = props.className ?? 'h-[18px] w-[18px]'
  if (props.tipo === 'crear') return <IconPlus className={`${base} text-emerald-600`} aria-hidden />
  if (props.tipo === 'modificar') return <IconPencil className={`${base} text-sky-700`} aria-hidden />
  if (props.tipo === 'eliminar') return <IconTrash className={`${base} text-rose-700`} aria-hidden />
  return <IconPencil className={`${base} text-slate-500`} aria-hidden />
}

function roleBadgeClass(role: string): string {
  const x = String(role).toLowerCase()
  if (x === 'admin') return 'bg-red-100 text-red-700'
  if (x === 'encargado') return 'bg-amber-100 text-amber-800'
  if (x === 'disenadora') return 'bg-fuchsia-100 text-fuchsia-800'
  if (x === 'programadora_maquinaria') return 'bg-indigo-100 text-indigo-800'
  if (x === 'operador_bodega') return 'bg-teal-100 text-teal-900'
  return 'bg-blue-100 text-blue-800'
}

function actionLabel(action: string): string {
  if (action === 'producto_creado') return 'Agregó producto'
  if (action === 'producto_actualizado') return 'Editó producto'
  if (action === 'producto_eliminado') return 'Eliminó producto'
  if (action === 'export_excel') return 'Exportó Excel'
  if (action === 'solicitud_actualizada') return 'Solicitud actualizada'
  if (action === 'solicitud_creada') return 'Solicitud creada'
  return action
}

function humanizeEstado(s: string): string {
  const k = s.toLowerCase()
  const map: Record<string, string> = {
    pendiente: 'Pendiente',
    aprobada: 'Aprobada',
    rechazada: 'Rechazada',
    rechazado: 'Rechazada',
    cancelada: 'Cancelada',
    cancelado: 'Cancelada',
  }
  return map[k] ?? (s ? s.charAt(0).toUpperCase() + s.slice(1) : '—')
}

function friendlyKeyLabel(key: string): string {
  const map: Record<string, string> = {
    codigo: 'Código',
    nombre: 'Nombre',
    cantidad: 'Cantidad',
    producto_id: 'Producto (referencia)',
    stock_anterior: 'Stock antes',
    stock_nuevo: 'Stock después',
    status: 'Estado',
    status_anterior: 'Estado anterior',
    status_nuevo: 'Estado nuevo',
    total: 'Total',
    filtered: 'Con filtro de búsqueda',
  }
  return map[key] ?? key.replace(/_/g, ' ')
}

/** Texto claro para la columna Detalle (no JSON técnico). */
function AuditDetailFriendly(props: { row: AuditRow }) {
  const { row } = props
  const m = row.metadata
  if (!m || typeof m !== 'object' || Array.isArray(m)) {
    return <span className="text-[11px] text-gray-400">Sin detalle.</span>
  }
  const o = m as Record<string, unknown>

  if (row.action === 'solicitud_actualizada') {
    return (
      <p className="text-[11px] leading-relaxed text-gray-700">
        La solicitud cambió de{' '}
        <span className="font-semibold text-gray-900">{humanizeEstado(String(o.status_anterior ?? '—'))}</span> a{' '}
        <span className="font-semibold text-gray-900">{humanizeEstado(String(o.status_nuevo ?? '—'))}</span>.
      </p>
    )
  }

  if (row.action === 'solicitud_creada') {
    const cant = o.cantidad != null ? String(o.cantidad) : '—'
    const st = o.status != null ? humanizeEstado(String(o.status)) : '—'
    const pid = o.producto_id != null ? String(o.producto_id) : null
    return (
      <div className="space-y-1 text-[11px] leading-relaxed text-gray-700">
        <p>
          Cantidad solicitada: <span className="font-semibold text-gray-900">{cant}</span>.
        </p>
        <p>
          Estado inicial: <span className="font-semibold text-gray-900">{st}</span>.
        </p>
        {pid ? (
          <p className="text-gray-500" title={pid}>
            Enlazada al producto del inventario (referencia interna).
          </p>
        ) : null}
      </div>
    )
  }

  if (row.action === 'producto_actualizado') {
    return (
      <div className="space-y-1 text-[11px] leading-relaxed text-gray-700">
        <p>
          <span className="font-semibold text-gray-900">{String(o.nombre ?? 'Producto')}</span>
          {o.codigo != null ? (
            <>
              {' '}
              (<span className="font-medium">{String(o.codigo)}</span>)
            </>
          ) : null}
        </p>
        <p>
          Stock actualizado: de <span className="font-semibold">{String(o.stock_anterior ?? '—')}</span> a{' '}
          <span className="font-semibold">{String(o.stock_nuevo ?? '—')}</span> unidades.
        </p>
      </div>
    )
  }

  if (row.action === 'producto_creado') {
    return (
      <p className="text-[11px] leading-relaxed text-gray-700">
        Alta de <span className="font-semibold text-gray-900">{String(o.nombre ?? '—')}</span>, código{' '}
        <span className="font-semibold">{String(o.codigo ?? '—')}</span>.
      </p>
    )
  }

  if (row.action === 'producto_eliminado') {
    return (
      <p className="text-[11px] leading-relaxed text-gray-700">
        Baja de <span className="font-semibold text-gray-900">{String(o.nombre ?? '—')}</span> (
        <span className="font-semibold">{String(o.codigo ?? '—')}</span>).
      </p>
    )
  }

  if (row.action === 'export_excel') {
    const items = Object.entries(o)
      .filter(([, v]) => v != null && typeof v !== 'object')
      .map(([k, v]) => (
        <li key={k}>
          <span className="text-gray-500">{friendlyKeyLabel(k)}:</span>{' '}
          <span className="font-medium text-gray-800">{String(v)}</span>
        </li>
      ))
    if (items.length === 0) {
      return <span className="text-[11px] text-gray-400">Exportación registrada.</span>
    }
    return <ul className="list-disc space-y-0.5 pl-3.5 text-[11px] text-gray-700">{items}</ul>
  }

  const items = Object.entries(o)
    .filter(([, v]) => v != null && typeof v !== 'object')
    .map(([k, v]) => (
      <li key={k}>
        <span className="text-gray-500">{friendlyKeyLabel(k)}:</span>{' '}
        <span className="font-medium text-gray-800">{String(v)}</span>
      </li>
    ))
  if (items.length === 0) {
    return <span className="text-[11px] text-gray-400">Sin detalles adicionales.</span>
  }
  return <ul className="list-disc space-y-0.5 pl-3.5 text-[11px] text-gray-700">{items}</ul>
}

/** Código de inventario mostrado en la tabla (metadatos o resolución por id de producto / solicitud). */
function codigoProductoParaFila(
  r: AuditRow,
  codigoPorProductoId: Record<string, string>,
  codigoPorSolicitudId: Record<string, string>,
): string {
  const m =
    r.metadata && typeof r.metadata === 'object' && !Array.isArray(r.metadata)
      ? (r.metadata as Record<string, unknown>)
      : null
  if (m && typeof m.codigo === 'string' && m.codigo.trim()) return m.codigo.trim()
  if (m && typeof m.producto_id === 'string') {
    const c = codigoPorProductoId[m.producto_id]
    if (c) return c
  }
  if (r.table_name === 'productos' && r.record_id) {
    const c = codigoPorProductoId[r.record_id]
    if (c) return c
  }
  if (r.table_name === 'solicitudes' && r.record_id) {
    const c = codigoPorSolicitudId[r.record_id]
    if (c) return c
  }
  return '—'
}

function UserHistoryModal(props: {
  open: boolean
  user: ProfileRow | null
  canClearHistory: boolean
  onClose: () => void
}) {
  const [rows, setRows] = useState<AuditRow[]>([])
  const [loading, setLoading] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [filtroTipo, setFiltroTipo] = useState<'TODOS' | HistorialTipo>('TODOS')
  const [codigoPorProductoId, setCodigoPorProductoId] = useState<Record<string, string>>({})
  const [codigoPorSolicitudId, setCodigoPorSolicitudId] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!props.open || !props.user) return
    const actorId = props.user.id
    queueMicrotask(() => {
      setError(null)
      setLoading(true)
      setRows([])
      setBusqueda('')
      setFiltroTipo('TODOS')
      void fetchAuditLogByActor(actorId, 300)
        .then((data) => setRows(data))
        .catch((e) => setError(e instanceof Error ? e.message : 'No se pudo cargar historial del usuario'))
        .finally(() => setLoading(false))
    })
  }, [props.open, props.user])

  useEffect(() => {
    if (!props.open || loading || rows.length === 0) {
      if (!props.open || rows.length === 0) {
        queueMicrotask(() => {
          setCodigoPorProductoId({})
          setCodigoPorSolicitudId({})
        })
      }
      return
    }

    let cancelled = false
    void (async () => {
      const sb = getSupabase()
      const productoIds = new Set<string>()
      const solicitudIds = new Set<string>()

      for (const r of rows) {
        const m =
          r.metadata && typeof r.metadata === 'object' && !Array.isArray(r.metadata)
            ? (r.metadata as Record<string, unknown>)
            : null
        if (m && typeof m.producto_id === 'string' && m.producto_id) productoIds.add(m.producto_id)
        if (r.table_name === 'productos' && r.record_id) productoIds.add(r.record_id)
        if (r.table_name === 'solicitudes' && r.record_id) solicitudIds.add(r.record_id)
      }

      const s2p: Record<string, string> = {}
      if (solicitudIds.size > 0) {
        const { data: sols, error: eSol } = await sb
          .from('solicitudes')
          .select('id, producto_id')
          .in('id', [...solicitudIds])
        if (eSol) {
          console.warn(eSol)
        } else {
          for (const s of sols ?? []) {
            const row = s as { id: string; producto_id: string }
            if (row.id && row.producto_id) {
              s2p[row.id] = row.producto_id
              productoIds.add(row.producto_id)
            }
          }
        }
      }

      const ids = [...productoIds].filter(Boolean)
      const p2c: Record<string, string> = {}
      if (ids.length > 0) {
        const { data: prods, error: eProd } = await sb.from('productos').select('id, codigo').in('id', ids)
        if (eProd) {
          console.warn(eProd)
        } else {
          for (const p of prods ?? []) {
            const row = p as { id: string; codigo: string | null }
            if (row.id && row.codigo != null && String(row.codigo).trim()) p2c[row.id] = String(row.codigo).trim()
          }
        }
      }

      const s2c: Record<string, string> = {}
      for (const sid of Object.keys(s2p)) {
        const pid = s2p[sid]
        if (pid && p2c[pid]) s2c[sid] = p2c[pid]
      }

      if (!cancelled) {
        setCodigoPorProductoId(p2c)
        setCodigoPorSolicitudId(s2c)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [props.open, loading, rows])

  const filteredRows = useMemo(() => {
    const s = busqueda.trim().toLowerCase()
    return rows.filter((r) => {
      const tipo = tipoFromAudit(r)
      if (filtroTipo !== 'TODOS' && tipo !== filtroTipo) return false
      if (!s) return true
      const codigo = codigoProductoParaFila(r, codigoPorProductoId, codigoPorSolicitudId)
      const entidad = (r.table_name ?? '—').toLowerCase()
      const haystack = [
        actionLabel(r.action),
        r.action,
        entidad,
        r.record_id,
        codigo,
        formatFechaHoraLocal(r.created_at),
        r.metadata ? JSON.stringify(r.metadata) : '',
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(s)
    })
  }, [rows, busqueda, filtroTipo, codigoPorProductoId, codigoPorSolicitudId])

  async function onClearHistory() {
    if (!props.user || !props.canClearHistory || clearing) return
    const label = props.user.username?.trim() || props.user.email?.trim() || props.user.id.slice(0, 8)
    const ok = window.confirm(
      `¿Eliminar permanentemente todo el historial de auditoría de «${label}»?\n\nEsta acción no se puede deshacer.`,
    )
    if (!ok) return
    setClearing(true)
    setError(null)
    try {
      await clearAuditLogForActor(props.user.id)
      setRows([])
      setBusqueda('')
      setFiltroTipo('TODOS')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo limpiar el historial')
    } finally {
      setClearing(false)
    }
  }

  if (!props.open || !props.user) return null

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-[2px] transition hover:bg-slate-900/65"
        onClick={props.onClose}
        aria-label="Cerrar"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="historial-usuario-titulo"
        className="relative flex w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-blue-950/25 bg-white shadow-2xl shadow-blue-950/15 ring-1 ring-blue-950/10"
      >
        <div className="relative overflow-hidden border-b border-blue-950/25 bg-section-navy px-4 py-4 text-white sm:px-6 sm:py-5">
          <div className="pointer-events-none absolute -right-8 -top-12 h-36 w-36 rounded-full bg-blue-400/15 blur-2xl" />
          <div className="relative flex items-start justify-between gap-4">
            <div className="flex min-w-0 flex-1 items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20 shadow-lg">
                <IconHistory className="h-6 w-6 text-blue-100" />
              </div>
              <div className="min-w-0 pt-0.5">
                <h2 id="historial-usuario-titulo" className="text-lg font-bold tracking-tight sm:text-xl">
                  Historial de usuario
                </h2>
                <p className="mt-1 text-sm leading-snug text-blue-100/88">
                  {props.user.username ?? '—'} · {props.user.email ?? '—'}
                </p>
              </div>
            </div>
            <button
              type="button"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition hover:bg-white/20"
              onClick={props.onClose}
              aria-label="Cerrar"
            >
              <IconX className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50/95 via-white to-sky-50/20 px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <CatalogSearchField
              value={busqueda}
              onChange={setBusqueda}
              placeholder="Buscar en historial (acción, entidad, código, fecha)…"
            />
            <select
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value as 'TODOS' | HistorialTipo)}
              className="w-full rounded-2xl border border-slate-200/90 bg-white py-2.5 pl-3 pr-8 text-[13px] font-medium text-slate-800 shadow-inner shadow-slate-200/40 outline-none focus:border-blue-900/35 focus:shadow-[0_0_0_3px_rgba(15,39,68,0.08)] sm:w-auto sm:min-w-[11rem]"
            >
              <option value="TODOS">Todos los tipos</option>
              <option value="crear">Crear</option>
              <option value="modificar">Modificar</option>
              <option value="eliminar">Eliminar</option>
              <option value="otro">Otro</option>
            </select>
          </div>
        </div>

        <div className="max-h-[min(72vh,720px)] overflow-y-auto bg-white p-4 sm:p-5 md:p-6">
          {error ? (
            <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 shadow-sm">
              {error}
            </div>
          ) : null}

          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200/90 bg-slate-50/40 py-16 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
              <div
                className="h-9 w-9 animate-spin rounded-full border-2 border-slate-200 border-t-sky-600 border-t-transparent"
                aria-hidden
              />
              <p className="text-[13px] font-medium text-slate-500">Cargando historial…</p>
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-14 text-center">
              <p className="text-[14px] font-medium text-slate-600">
                {rows.length === 0 ? 'Sin registros de auditoría para este usuario.' : 'No hay registros que coincidan con el filtro.'}
              </p>
              <p className="mt-1 text-[12px] text-slate-400">Ajusta la búsqueda o el tipo de acción.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
              <div className="h-1 bg-gradient-to-r from-sky-500/90 via-sky-400/50 to-transparent" aria-hidden />
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-slate-200/90 bg-gradient-to-b from-slate-100/95 to-slate-50/90">
                      <th className="w-10 px-3 py-3.5 sm:px-4" aria-hidden />
                      <th className="px-3 py-3.5 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 sm:px-4 md:w-[11rem]">
                        Fecha
                      </th>
                      <th className="px-3 py-3.5 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 sm:px-4 md:w-[12rem]">
                        Acción
                      </th>
                      <th className="px-3 py-3.5 text-center text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 sm:px-4 md:w-[7rem]">
                        Tipo
                      </th>
                      <th className="px-3 py-3.5 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 sm:px-4 md:w-[8rem]">
                        Entidad
                      </th>
                      <th className="px-3 py-3.5 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 sm:px-4 md:w-[7rem]">
                        Código
                      </th>
                      <th className="px-3 py-3.5 pr-4 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 sm:px-4">
                        Detalle
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRows.map((r, i) => {
                      const tipo = tipoFromAudit(r)
                      const codigo = codigoProductoParaFila(r, codigoPorProductoId, codigoPorSolicitudId)
                      const entidad = r.table_name ?? '—'
                      return (
                        <tr
                          key={r.id}
                          className={[
                            'transition-colors hover:bg-slate-50/95',
                            i % 2 === 1 ? 'bg-slate-50/35' : 'bg-white',
                          ].join(' ')}
                        >
                          <td className="px-3 py-3 align-middle sm:px-4">
                            <TipoIcon tipo={tipo} className="h-[18px] w-[18px]" />
                          </td>
                          <td className="px-3 py-3 align-top text-[12px] tabular-nums text-slate-600 sm:px-4">
                            <span className="inline-flex items-center gap-1.5">
                              <IconCalendar className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                              {formatFechaHoraLocal(r.created_at)}
                            </span>
                          </td>
                          <td className="px-3 py-3 align-top text-[13px] font-semibold text-slate-900 sm:px-4">
                            {actionLabel(r.action)}
                          </td>
                          <td className="px-3 py-3 align-top text-center sm:px-4">
                            <span
                              className={`inline-flex rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tipoBadgeClass(tipo)}`}
                            >
                              {tipoLabel(tipo)}
                            </span>
                          </td>
                          <td className="px-3 py-3 align-top font-mono text-[11px] text-slate-600 sm:px-4">{entidad}</td>
                          <td className="px-3 py-3 align-top font-mono text-[11px] font-medium text-slate-800 sm:px-4">
                            {codigo}
                          </td>
                          <td className="max-w-[min(28rem,40vw)] px-3 py-3 pr-4 align-top text-[12px] text-slate-700 sm:px-4">
                            <AuditDetailFriendly row={r} />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-2.5 text-center text-[11px] font-medium uppercase tracking-wide text-slate-400 sm:text-left sm:px-5">
                {filteredRows.length} {filteredRows.length === 1 ? 'registro' : 'registros'} mostrados
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-[13px] font-medium text-slate-600">
              Usuario: <span className="font-semibold text-slate-900">{props.user.username ?? '—'}</span>
            </span>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              {props.canClearHistory ? (
                <button
                  type="button"
                  disabled={clearing || loading}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-[13px] font-semibold text-rose-800 shadow-sm transition hover:border-rose-300 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => void onClearHistory()}
                >
                  <IconTrash className="h-4 w-4 shrink-0" aria-hidden />
                  {clearing ? 'Limpiando…' : 'Limpiar historial'}
                </button>
              ) : null}
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200/90 bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-700 shadow-sm transition hover:border-sky-300/70 hover:bg-sky-50/60 hover:text-slate-900"
                onClick={props.onClose}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function HistoryPage(props: { role: AppRole }) {
  const showClearHistory = canClearAuditLog(props.role)
  const [users, setUsers] = useState<ProfileRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<ProfileRow | null>(null)
  const [page, setPage] = useState(1)
  const pageSize = 10

  async function load() {
    setError(null)
    setLoading(true)
    try {
      const sb = getSupabase()
      const { data, error } = await sb
        .from('profiles')
        .select('id,username,email,role,created_at')
        .order('created_at', { ascending: false })
        .limit(500)
      if (error) throw error
      setUsers((data as ProfileRow[] | null) ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar usuarios')
      setUsers([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      void load()
    })
  }, [])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return users
    return users.filter((u) => {
      return (
        (u.username ?? '').toLowerCase().includes(s) ||
        (u.email ?? '').toLowerCase().includes(s) ||
        String(u.role ?? '').toLowerCase().includes(s) ||
        u.id.toLowerCase().includes(s)
      )
    })
  }, [q, users])

  useEffect(() => {
    queueMicrotask(() => setPage(1))
  }, [q])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const paginated = useMemo(() => {
    const start = (safePage - 1) * pageSize
    return filtered.slice(start, start + pageSize)
  }, [filtered, safePage])

  return (
    <section className="space-y-4">
      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 shadow-sm">
          {error}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-3xl border border-slate-200/70 bg-white shadow-[0_20px_50px_-24px_rgba(4,26,56,0.22),0_1px_0_rgba(255,255,255,0.8)_inset] ring-1 ring-slate-900/[0.03]">
        <CatalogPageHero
          accent="sky"
          title="Historial"
          subtitle="Auditoría de actividades en inventario y solicitudes. Elige un usuario para ver su registro detallado."
          toolbar={
            <>
              <CatalogSearchField
                value={q}
                onChange={setQ}
                placeholder="Buscar por usuario, correo, rol o ID…"
              />
              <button
                type="button"
                disabled={loading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200/90 bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-700 shadow-sm transition hover:border-sky-300/70 hover:bg-sky-50/60 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                onClick={() => void load()}
              >
                <IconRefresh className={`h-4 w-4 shrink-0 opacity-95 ${loading ? 'animate-spin' : ''}`} aria-hidden />
                Recargar
              </button>
            </>
          }
        />

        <div className="p-4 sm:p-5 md:p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200/90 bg-white py-16 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
              <div
                className="h-9 w-9 animate-spin rounded-full border-2 border-slate-200 border-t-sky-600 border-t-transparent"
                aria-hidden
              />
              <p className="text-[13px] font-medium text-slate-500">Cargando usuarios…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-14 text-center">
              <p className="text-[14px] font-medium text-slate-600">
                {users.length === 0 ? 'No hay usuarios registrados.' : 'No se encontraron usuarios con ese criterio.'}
              </p>
              <p className="mt-1 text-[12px] text-slate-400">Prueba otra búsqueda o recarga la lista.</p>
            </div>
          ) : (
            <>
              <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
                <div className="h-1 bg-gradient-to-r from-sky-500/90 via-sky-400/50 to-transparent" aria-hidden />
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] border-collapse text-left">
                    <thead>
                      <tr className="border-b border-slate-200/90 bg-gradient-to-b from-slate-100/95 to-slate-50/90">
                        <th className="px-4 py-3.5 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 sm:px-5 md:w-[120px]">
                          ID
                        </th>
                        <th className="px-4 py-3.5 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 sm:px-5">
                          Usuario
                        </th>
                        <th className="px-4 py-3.5 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 sm:px-5">
                          Correo
                        </th>
                        <th className="px-4 py-3.5 text-center text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 sm:px-5 md:w-[140px]">
                          Rol
                        </th>
                        <th className="px-4 py-3.5 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 sm:px-5 md:w-[160px]">
                          Alta
                        </th>
                        <th className="w-[1%] whitespace-nowrap px-3 py-3.5 text-right text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 sm:px-4">
                          Acciones
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {paginated.map((u, i) => (
                        <tr
                          key={u.id}
                          className={[
                            'group transition-colors hover:bg-slate-50/95',
                            i % 2 === 1 ? 'bg-slate-50/35' : 'bg-white',
                          ].join(' ')}
                        >
                          <td className="px-4 py-3.5 font-mono text-[11px] text-slate-500 sm:px-5" title={u.id}>
                            <span className="rounded-lg bg-slate-100/90 px-2 py-1 ring-1 ring-slate-200/80">
                              {u.id.length > 12 ? `${u.id.slice(0, 8)}…` : u.id}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-[14px] font-semibold text-slate-900 sm:px-5">
                            {u.username?.trim() || '—'}
                          </td>
                          <td className="max-w-[220px] truncate px-4 py-3.5 text-[13px] font-bold text-slate-900 sm:max-w-none sm:px-5">
                            {u.email ?? '—'}
                          </td>
                          <td className="px-4 py-3.5 text-center sm:px-5">
                            <span
                              className={`inline-flex rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${roleBadgeClass(String(u.role))}`}
                            >
                              {String(u.role).replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-[13px] font-bold tabular-nums text-slate-900 sm:px-5">
                            {formatFechaHoraLocal(u.created_at)}
                          </td>
                          <td className="whitespace-nowrap px-2 py-2 text-right sm:px-3">
                            <button
                              type="button"
                              title="Ver historial de actividad"
                              className={catalogHistoryBtnClass}
                              onClick={() => setSelected(u)}
                            >
                              <IconHistory className="h-4 w-4" aria-hidden />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-2.5 text-center text-[11px] font-medium uppercase tracking-wide text-slate-400 sm:text-left sm:px-5">
                  Mostrando {paginated.length} de {filtered.length}{' '}
                  {filtered.length === 1 ? 'usuario' : 'usuarios'}
                </div>
              </div>

              <div className="mt-4">
                <PaginationBar
                  page={safePage}
                  totalPages={totalPages}
                  totalItems={filtered.length}
                  pageSize={pageSize}
                  onPageChange={setPage}
                />
              </div>
            </>
          )}
        </div>
      </div>

      <UserHistoryModal
        open={selected !== null}
        user={selected}
        canClearHistory={showClearHistory}
        onClose={() => setSelected(null)}
      />
    </section>
  )
}

