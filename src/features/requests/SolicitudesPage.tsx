import { useEffect, useMemo, useState } from 'react'
import type { InventoryItem } from '../../types/inventory'
import { fetchProductos } from '../../lib/productosRepo'
import {
  fetchSolicitudesAll,
  fetchSolicitudesMine,
  deleteSolicitud,
  updateSolicitudStatus,
  type SolicitudRow,
  type SolicitudStatus,
} from '../../lib/solicitudesRepo'
import { formatFechaHoraLocal } from '../../lib/formatDateTime'
import { getSupabase } from '../../lib/supabaseClient'
import { IconNavSolicitudes, IconRefresh } from '../../ui/shellIcons'
import { canAccessSolicitudesNav, canManageSolicitudes, type AppRole } from '../../lib/roles'
import {
  SolicitudAdminActionsMenu,
  type SolicitudAdminAction,
} from './SolicitudAdminActionsMenu.tsx'

function statusLabel(s: SolicitudStatus) {
  if (s === 'pendiente') return 'Pendiente'
  if (s === 'aprobada') return 'Aprobada'
  if (s === 'rechazada') return 'Rechazada'
  return 'Entregada'
}

function statusTone(s: SolicitudStatus) {
  if (s === 'pendiente') return 'bg-amber-50 text-amber-800 border-amber-200'
  if (s === 'aprobada') return 'bg-emerald-50 text-emerald-800 border-emerald-200'
  if (s === 'rechazada') return 'bg-rose-50 text-rose-800 border-rose-200'
  return 'bg-slate-50 text-slate-800 border-slate-200'
}

function userStatusHelp(s: SolicitudStatus): string {
  if (s === 'pendiente') return 'En revisión por el supervisor o administrador.'
  if (s === 'aprobada') return 'Aprobada. Se procederá con la compra/entrega.'
  if (s === 'entregada') return 'Entregada / surtida.'
  return 'Rechazada por el supervisor o administrador.'
}

type ProfileMini = { id: string; username: string | null; email: string | null }

export function SolicitudesPage(props: { role: AppRole; onChanged?: () => void }) {
  const [rows, setRows] = useState<SolicitudRow[]>([])
  const [productos, setProductos] = useState<Map<string, InventoryItem>>(new Map())
  const [profiles, setProfiles] = useState<Map<string, ProfileMini>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [openActionsId, setOpenActionsId] = useState<string | null>(null)
  const [actionBusyId, setActionBusyId] = useState<string | null>(null)

  async function load() {
    setError(null)
    setLoading(true)
    try {
      const [s, items] = await Promise.all([
        canManageSolicitudes(props.role) ? fetchSolicitudesAll() : fetchSolicitudesMine(),
        fetchProductos(),
      ])
      setRows(s)
      setProductos(new Map(items.map((i) => [i.id, i])))
      if (canManageSolicitudes(props.role)) {
        const ids = Array.from(new Set(s.map((r) => r.requested_by).filter(Boolean)))
        if (ids.length > 0) {
          const sb = getSupabase()
          const { data, error: pErr } = await sb
            .from('profiles')
            .select('id,username,email')
            .in('id', ids)
          if (!pErr) {
            const list = (data as ProfileMini[] | null) ?? []
            setProfiles(new Map(list.map((p) => [p.id, p])))
          } else {
            setProfiles(new Map())
          }
        } else {
          setProfiles(new Map())
        }
      } else {
        setProfiles(new Map())
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar solicitudes')
      setRows([])
      setProductos(new Map())
      setProfiles(new Map())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const title = useMemo(
    () => (canManageSolicitudes(props.role) ? 'Solicitudes (todas)' : 'Mis solicitudes'),
    [props.role],
  )

  const subtitle = useMemo(
    () =>
      canManageSolicitudes(props.role)
        ? 'En cada fila usa «Acciones» para cambiar el estado o quitar la solicitud del panel.'
        : 'Consulta el estatus de tus solicitudes de producto.',
    [props.role],
  )

  const filteredRows = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return rows
    return rows.filter((r) => {
      const p = productos.get(r.producto_id)
      const who = profiles.get(r.requested_by)
      const whoLabel =
        canManageSolicitudes(props.role) ? who?.username?.trim() || who?.email || r.requested_by || '' : ''
      const hay = [
        formatFechaHoraLocal(r.created_at),
        r.status,
        statusLabel(r.status),
        whoLabel,
        p?.codigo,
        p?.nombre,
        r.producto_id,
        r.nota,
        String(r.cantidad),
        p != null ? String(p.stockActual) : '',
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(s)
    })
  }, [rows, q, productos, profiles, props.role])

  async function setStatus(id: string, status: SolicitudStatus) {
    setError(null)
    try {
      await updateSolicitudStatus(id, status)
      if (canManageSolicitudes(props.role)) {
        setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)))
      } else {
        await load()
      }
      props.onChanged?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo actualizar status')
    }
  }

  async function remove(id: string) {
    setError(null)
    try {
      await deleteSolicitud(id)
      setRows((prev) => prev.filter((r) => r.id !== id))
      if (!canManageSolicitudes(props.role)) {
        await load()
      }
      props.onChanged?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo eliminar solicitud')
    }
  }

  async function compraHecha(id: string) {
    setError(null)
    try {
      await updateSolicitudStatus(id, 'aprobada')
      if (canManageSolicitudes(props.role)) {
        setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: 'aprobada' as const } : r)))
      } else {
        await load()
      }
      props.onChanged?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo marcar compra')
    }
  }

  async function confirmRemove(id: string): Promise<void> {
    if (!window.confirm('¿Eliminar esta solicitud? Se quitará del listado (no se puede deshacer).')) return
    await remove(id)
  }

  async function runAdminRowAction(rowId: string, action: SolicitudAdminAction) {
    setOpenActionsId(null)
    setActionBusyId(rowId)
    try {
      switch (action) {
        case 'compra_hecha':
          await compraHecha(rowId)
          break
        case 'aprobar':
          await setStatus(rowId, 'aprobada')
          break
        case 'entregar':
          await setStatus(rowId, 'entregada')
          break
        case 'rechazar':
          await setStatus(rowId, 'rechazada')
          break
        case 'eliminar':
          await confirmRemove(rowId)
          break
      }
    } finally {
      setActionBusyId(null)
    }
  }

  if (!canAccessSolicitudesNav(props.role)) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 shadow-sm">
        No tienes acceso a solicitudes desde esta cuenta.
      </div>
    )
  }

  return (
    <section className="w-full min-w-0 space-y-3">
      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div>
      ) : null}

      <div className="w-full min-w-0 overflow-hidden rounded-3xl border border-slate-300/50 bg-white shadow-[0_16px_48px_-20px_rgba(4,26,56,0.18)]">
        <div className="border-b border-white/10 bg-section-navy px-4 py-3 sm:px-5 sm:py-3.5">
          <h2 className="inline-flex items-center gap-2 text-lg font-semibold tracking-tight text-white sm:text-xl">
            <IconNavSolicitudes className="h-5 w-5 shrink-0 text-blue-100/95" aria-hidden />
            {title}
          </h2>
          <p className="mt-0.5 text-[13px] text-blue-100/88">{subtitle}</p>
        </div>

        <div className="border-b border-slate-200/80 bg-slate-50/50 px-3 py-3 sm:px-4">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por fecha, estado, usuario, producto o nota…"
              className="w-full max-w-md rounded-xl border border-slate-200/90 bg-white px-3 py-2 text-[13px] text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-blue-900/30 focus:ring-2 focus:ring-blue-900/15"
            />
            <button
              type="button"
              disabled={loading}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-blue-950/30 bg-section-navy px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => void load()}
            >
              <IconRefresh className={`h-4 w-4 shrink-0 opacity-95 ${loading ? 'animate-spin' : ''}`} aria-hidden />
              Recargar
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-[13px] text-slate-500">Cargando solicitudes…</div>
        ) : (
          <div className="flex min-h-[min(72vh,920px)] flex-col p-3 sm:p-4">
            <div className="min-h-0 flex-1 w-full min-w-0 overflow-x-auto overflow-y-visible rounded-2xl border border-slate-200/80 pb-8 [-ms-overflow-style:auto] [scrollbar-gutter:stable]">
              <table className="w-full min-w-[1180px] table-fixed border-collapse text-left text-[13px] lg:min-w-[1280px] xl:min-w-[1360px]">
                <colgroup>
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '9%' }} />
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '17%' }} />
                  <col style={{ width: '16%' }} />
                  <col style={{ width: '5%' }} />
                  <col style={{ width: '5%' }} />
                  <col style={{ width: '27%' }} />
                </colgroup>
                <thead>
                  <tr className="divide-x divide-white/10 bg-section-navy">
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-blue-100/95">
                      Fecha
                    </th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-blue-100/95">
                      Estado
                    </th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-blue-100/95">
                      {canManageSolicitudes(props.role) ? 'Usuario' : 'Origen'}
                    </th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-blue-100/95">
                      Producto
                    </th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-blue-100/95">
                      Nota
                    </th>
                    <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-blue-100/95">
                      Cant.
                    </th>
                    <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-blue-100/95">
                      Stock
                    </th>
                    <th className="px-3 py-2.5 pr-4 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-blue-100/95">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-[12px] text-slate-500">
                        Sin solicitudes.
                      </td>
                    </tr>
                  ) : filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-[12px] text-slate-500">
                        No hay solicitudes que coincidan con la búsqueda.
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((r, i) => {
                      const p = productos.get(r.producto_id)
                      const status = r.status
                      const who = profiles.get(r.requested_by)
                      const whoLabel =
                        canManageSolicitudes(props.role)
                          ? who?.username?.trim() || who?.email || r.requested_by
                          : '—'
                      return (
                        <tr
                          key={r.id}
                          className={[
                            'border-b border-slate-100 transition-colors hover:bg-sky-50/60',
                            i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50',
                          ].join(' ')}
                        >
                          <td className="border-l border-slate-100 px-3 py-2.5 align-top text-[12px] leading-snug text-slate-600 first:border-l-0">
                            {formatFechaHoraLocal(r.created_at)}
                          </td>
                          <td className="border-l border-slate-100 px-3 py-2.5 align-top">
                            <span
                              className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-semibold ${statusTone(status)}`}
                            >
                              {statusLabel(status)}
                            </span>
                            {!canManageSolicitudes(props.role) ? (
                              <div className="mt-1 text-[11px] leading-snug text-slate-500">{userStatusHelp(status)}</div>
                            ) : null}
                          </td>
                          <td className="border-l border-slate-100 px-3 py-2.5 align-top text-[12px] text-slate-700">
                            <span className="block break-words">{whoLabel}</span>
                          </td>
                          <td className="border-l border-slate-100 px-3 py-2.5 align-top">
                            <div className="text-[12px] font-semibold leading-snug text-slate-900">
                              {p ? `${p.codigo} · ${p.nombre}` : r.producto_id}
                            </div>
                          </td>
                          <td className="border-l border-slate-100 px-3 py-2.5 align-top text-[12px] leading-snug text-slate-700">
                            {r.nota?.trim() ? (
                              <p className="m-0 max-h-28 overflow-y-auto whitespace-pre-wrap break-words">{r.nota}</p>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="border-l border-slate-100 bg-slate-100/25 px-3 py-2.5 text-center align-top text-[13px] font-semibold tabular-nums text-slate-800">
                            {r.cantidad}
                          </td>
                          <td className="border-l border-slate-100 bg-slate-100/25 px-3 py-2.5 text-center align-top text-[13px] tabular-nums text-slate-800">
                            {p ? p.stockActual : '—'}
                          </td>
                          <td className="overflow-visible border-l border-slate-100 px-3 py-3 pr-4 align-top">
                            {!canManageSolicitudes(props.role) ? (
                              <div className="flex max-w-[13rem] flex-col gap-1">
                                <button
                                  type="button"
                                  className="w-full rounded-lg border border-rose-200 bg-rose-50 px-2 py-1.5 text-center text-[10px] font-semibold text-rose-800 transition hover:bg-rose-100"
                                  onClick={() => void confirmRemove(r.id)}
                                >
                                  Eliminar solicitud
                                </button>
                                <p className="text-[9px] leading-snug text-slate-500">Para depurar tu listado.</p>
                              </div>
                            ) : (
                              <SolicitudAdminActionsMenu
                                open={openActionsId === r.id}
                                busy={actionBusyId === r.id}
                                productLabel={p ? `${p.codigo} · ${p.nombre}` : r.producto_id}
                                onToggle={() =>
                                  setOpenActionsId((cur) => (cur === r.id ? null : r.id))
                                }
                                onClose={() => setOpenActionsId((cur) => (cur === r.id ? null : cur))}
                                onAction={(action) => void runAdminRowAction(r.id, action)}
                              />
                            )}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!loading ? (
          <div className="border-t border-slate-200/80 bg-slate-50/80 px-3 py-2 text-center text-[11px] text-slate-600 sm:text-left sm:px-4">
            <span className="font-semibold tabular-nums text-slate-900">{filteredRows.length}</span>
            <span className="text-slate-500"> de </span>
            <span className="font-semibold tabular-nums text-slate-900">{rows.length}</span>
            <span className="text-slate-500"> solicitudes</span>
          </div>
        ) : null}
      </div>
    </section>
  )
}
