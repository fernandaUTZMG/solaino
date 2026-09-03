import { useCallback, useEffect, useRef, useState } from 'react'
import {
  fetchUnreadAppNotificationCount,
  fetchUnreadAppNotifications,
  markAllAppNotificationsRead,
  markAppNotificationRead,
  type AppNotificationRow,
} from '../lib/appNotificationsRepo'

function IconBell(props: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
      aria-hidden
    >
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString('es-MX', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function NotificationBody(props: { notification: AppNotificationRow }) {
  const n = props.notification
  const pieces = n.payload.pieces_to_correct ?? []

  if (n.kind === 'bodega_design_correccion' && pieces.length > 0) {
    return (
      <div className="mt-1 space-y-2">
        {n.payload.proyecto_nombre || n.payload.folio ? (
          <p className="text-[12px] leading-snug text-slate-700">
            {n.payload.proyecto_nombre ?? n.payload.folio}
            {n.payload.design_version ? ` · V${n.payload.design_version}` : ''}
          </p>
        ) : null}
        <ul className="space-y-1.5 rounded-lg border border-amber-200/80 bg-amber-50/70 px-2.5 py-2">
          {pieces.map((piece, idx) => (
            <li key={`${piece.source_path ?? piece.label ?? idx}`} className="text-[12px] leading-snug text-amber-950">
              <span className="font-semibold text-amber-950">
                {piece.label ?? piece.source_path ?? `Pieza ${idx + 1}`}
              </span>
              {piece.feedback ? (
                <span className="mt-0.5 block text-[11px] font-normal text-amber-900/90">{piece.feedback}</span>
              ) : null}
            </li>
          ))}
        </ul>
        {n.payload.project_status === 'diseno_parcial' ? (
          <p className="text-[11px] leading-snug text-teal-800">
            Las demás piezas de esta entrega ya fueron aprobadas.
          </p>
        ) : null}
      </div>
    )
  }

  return <p className="mt-0.5 text-[12px] leading-snug text-slate-700">{n.body}</p>
}

type Props = {
  onOpenProject?: (projectId: string) => void
  /** `nav`: junto al botón Bodega; `topbar`: barra superior (legacy). */
  variant?: 'nav' | 'topbar'
}

export function AppNotificationsBell(props: Props) {
  const variant = props.variant ?? 'nav'
  const [open, setOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [items, setItems] = useState<AppNotificationRow[]>([])
  const [loading, setLoading] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  const refresh = useCallback(async () => {
    try {
      const [count, list] = await Promise.all([
        fetchUnreadAppNotificationCount(),
        fetchUnreadAppNotifications(25),
      ])
      setUnreadCount(count)
      setItems(list)
    } catch {
      setUnreadCount(0)
      setItems([])
    }
  }, [])

  useEffect(() => {
    void refresh()
    const t = window.setInterval(() => void refresh(), 30_000)
    return () => window.clearInterval(t)
  }, [refresh])

  useEffect(() => {
    if (!open) return
    setLoading(true)
    void refresh().finally(() => setLoading(false))
  }, [open, refresh])

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  async function onOpenItem(n: AppNotificationRow) {
    try {
      await markAppNotificationRead(n.id)
    } catch {
      /* ignore */
    }
    setItems((prev) => prev.filter((x) => x.id !== n.id))
    setUnreadCount((c) => Math.max(0, c - 1))
    setOpen(false)
    const pid = n.payload.project_id
    if (pid && props.onOpenProject) props.onOpenProject(pid)
  }

  async function onMarkAllRead() {
    try {
      await markAllAppNotificationsRead()
      setItems([])
      setUnreadCount(0)
    } catch {
      /* ignore */
    }
  }

  const btnClass =
    variant === 'nav'
      ? 'relative inline-flex h-[42px] w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200/90 bg-white/90 text-slate-700 shadow-sm transition hover:bg-slate-50'
      : 'relative inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 text-white ring-1 ring-white/20 transition hover:bg-white/25 sm:h-10 sm:w-10'

  const badgeRing = variant === 'nav' ? 'ring-2 ring-white' : 'ring-2 ring-section-navy'

  return (
    <div className={['relative shrink-0', open && variant === 'nav' ? 'z-[110]' : ''].join(' ')} ref={panelRef}>
      <button
        type="button"
        className={btnClass}
        title={unreadCount > 0 ? `${unreadCount} aviso(s) sin leer` : 'Notificaciones'}
        aria-label={unreadCount > 0 ? `${unreadCount} notificaciones sin leer` : 'Notificaciones'}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <IconBell className="h-[18px] w-[18px]" />
        {unreadCount > 0 ? (
          <span
            className={[
              'absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white',
              badgeRing,
            ].join(' ')}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          className={[
            'absolute top-[calc(100%+6px)] z-[120] w-[min(100vw-2rem,22rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_16px_40px_-12px_rgba(15,23,42,0.28)] ring-1 ring-slate-200/80',
            variant === 'nav' ? 'left-0' : 'right-0 mt-2',
          ].join(' ')}
        >
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3 py-2.5">
            <p className="text-[13px] font-bold text-slate-900">Notificaciones</p>
            {items.length > 0 ? (
              <button
                type="button"
                className="text-[11px] font-semibold text-sky-700 hover:underline"
                onClick={() => void onMarkAllRead()}
              >
                Marcar todas leídas
              </button>
            ) : null}
          </div>
          <ul className="max-h-[min(60vh,320px)] overflow-y-auto">
            {loading ? (
              <li className="px-4 py-6 text-center text-[13px] text-slate-500">Cargando…</li>
            ) : items.length === 0 ? (
              <li className="px-4 py-6 text-center text-[13px] text-slate-500">Sin avisos nuevos</li>
            ) : (
              items.map((n) => (
                <li key={n.id} className="border-b border-slate-100 last:border-0">
                  <button
                    type="button"
                    className="w-full px-3 py-2.5 text-left hover:bg-sky-50/80"
                    onClick={() => void onOpenItem(n)}
                  >
                    <p className="text-[12px] font-bold text-slate-900">{n.title}</p>
                    <NotificationBody notification={n} />
                    <p className="mt-1 text-[10px] text-slate-400">{formatWhen(n.created_at)}</p>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
