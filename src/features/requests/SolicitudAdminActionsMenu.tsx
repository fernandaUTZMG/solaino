import { useEffect, useLayoutEffect, useRef, useState, type ComponentType } from 'react'
import { createPortal } from 'react-dom'
import { IconBan, IconSave, IconSend, IconTrash } from '../../ui/shellIcons'

export type SolicitudAdminAction = 'compra_hecha' | 'aprobar' | 'entregar' | 'rechazar' | 'eliminar'

function IconChevronDown(props: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

function IconSliders(props: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
      aria-hidden
    >
      <line x1="4" x2="4" y1="21" y2="14" />
      <line x1="4" x2="4" y1="10" y2="3" />
      <line x1="12" x2="12" y1="21" y2="12" />
      <line x1="12" x2="12" y1="8" y2="3" />
      <line x1="20" x2="20" y1="21" y2="16" />
      <line x1="20" x2="20" y1="12" y2="3" />
      <line x1="2" x2="6" y1="14" y2="14" />
      <line x1="10" x2="14" y1="8" y2="8" />
      <line x1="18" x2="22" y1="16" y2="16" />
    </svg>
  )
}

function IconCart(props: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
      aria-hidden
    >
      <circle cx="8" cy="21" r="1" />
      <circle cx="19" cy="21" r="1" />
      <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
    </svg>
  )
}

const MENU_ITEMS: Array<{
  id: SolicitudAdminAction
  label: string
  hint: string
  icon: ComponentType<{ className?: string }>
  iconClass: string
  hoverClass: string
  destructive?: boolean
}> = [
  {
    id: 'compra_hecha',
    label: 'Compra hecha',
    hint: 'Marca que ya se compró el material',
    icon: IconCart,
    iconClass: 'text-sky-600',
    hoverClass: 'hover:bg-sky-50',
  },
  {
    id: 'aprobar',
    label: 'Aprobar',
    hint: 'Aprueba la solicitud',
    icon: IconSave,
    iconClass: 'text-emerald-600',
    hoverClass: 'hover:bg-emerald-50',
  },
  {
    id: 'entregar',
    label: 'Entregar',
    hint: 'Registra entrega / surtido',
    icon: IconSend,
    iconClass: 'text-violet-600',
    hoverClass: 'hover:bg-violet-50',
  },
  {
    id: 'rechazar',
    label: 'Rechazar',
    hint: 'Rechaza la solicitud',
    icon: IconBan,
    iconClass: 'text-amber-700',
    hoverClass: 'hover:bg-amber-50',
  },
  {
    id: 'eliminar',
    label: 'Eliminar del panel',
    hint: 'Quita la fila del listado',
    icon: IconTrash,
    iconClass: 'text-rose-600',
    hoverClass: 'hover:bg-rose-50',
    destructive: true,
  },
]

type MenuPos = { top: number; left: number; width: number }

export function SolicitudAdminActionsMenu(props: {
  open: boolean
  busy: boolean
  productLabel: string
  onToggle: () => void
  onClose: () => void
  onAction: (action: SolicitudAdminAction) => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null)

  useLayoutEffect(() => {
    if (!props.open || !rootRef.current) {
      setMenuPos(null)
      return
    }
    const btn = rootRef.current.querySelector('button')
    if (!btn) return
    const r = btn.getBoundingClientRect()
    const menuWidth = 248
    const gap = 8
    const left = Math.min(Math.max(8, r.right - menuWidth), window.innerWidth - menuWidth - 8)
    const top = r.bottom + gap
    setMenuPos({ top, left, width: menuWidth })
  }, [props.open])

  useEffect(() => {
    if (!props.open) return
    function onPointer(e: MouseEvent) {
      const t = e.target as Node
      if (rootRef.current?.contains(t)) return
      const portal = document.getElementById('solicitud-actions-menu-portal')
      if (portal?.contains(t)) return
      props.onClose()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') props.onClose()
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [props.open, props.onClose])

  const menu =
    props.open && menuPos ? (
      <div
        id="solicitud-actions-menu-portal"
        role="menu"
        className="fixed z-[300] overflow-hidden rounded-2xl border border-slate-200/90 bg-white py-1.5 shadow-xl shadow-slate-900/15 ring-1 ring-slate-900/5"
        style={{
          top: menuPos.top,
          left: menuPos.left,
          width: menuPos.width,
        }}
      >
        <div className="border-b border-slate-100 px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">Acciones</p>
          <p className="mt-0.5 truncate text-[11px] font-medium text-slate-700" title={props.productLabel}>
            {props.productLabel}
          </p>
        </div>
        <div className="px-1.5 py-1">
          {MENU_ITEMS.map((item, idx) => (
            <div key={item.id}>
              {item.destructive && idx > 0 ? <div className="my-1 border-t border-slate-100" aria-hidden /> : null}
              <button
                type="button"
                role="menuitem"
                disabled={props.busy}
                className={[
                  'flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-50',
                  item.hoverClass,
                ].join(' ')}
                onClick={() => {
                  props.onClose()
                  props.onAction(item.id)
                }}
              >
                <span
                  className={[
                    'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200/80 bg-white shadow-sm',
                    item.iconClass,
                  ].join(' ')}
                >
                  <item.icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={[
                      'block text-[13px] font-semibold',
                      item.destructive ? 'text-rose-800' : 'text-slate-900',
                    ].join(' ')}
                  >
                    {item.label}
                  </span>
                  <span className="block text-[11px] leading-snug text-slate-500">{item.hint}</span>
                </span>
              </button>
            </div>
          ))}
        </div>
      </div>
    ) : null

  return (
    <div ref={rootRef} className="relative inline-block w-full py-0.5">
      <button
        type="button"
        disabled={props.busy}
        aria-expanded={props.open}
        aria-haspopup="menu"
        aria-label="Acciones"
        className={[
          'box-border inline-flex w-full min-w-[9.5rem] items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left shadow-sm transition',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-900/20',
          props.open
            ? 'border-sky-300 bg-sky-50 text-sky-950 shadow-[0_0_0_2px_rgba(125,211,252,0.45)]'
            : 'border-slate-200/90 bg-white text-slate-800 hover:border-sky-300/70 hover:bg-sky-50/40',
          props.busy ? 'cursor-wait opacity-60' : '',
        ].join(' ')}
        onClick={props.onToggle}
      >
        <span className="inline-flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200/80 bg-section-navy text-white shadow-sm">
            <IconSliders className="h-3.5 w-3.5" aria-hidden />
          </span>
          <span className="truncate text-[12px] font-semibold">{props.busy ? 'Procesando…' : 'Acciones'}</span>
        </span>
        <IconChevronDown
          className={['h-4 w-4 shrink-0 text-slate-500 transition-transform', props.open ? 'rotate-180' : ''].join(
            ' ',
          )}
        />
      </button>
      {menu ? createPortal(menu, document.body) : null}
    </div>
  )
}
