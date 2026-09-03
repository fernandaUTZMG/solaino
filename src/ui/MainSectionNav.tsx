import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

export type MainNavView =
  | 'inicio'
  | 'inventario'
  | 'bodega'
  | 'maquinado'
  | 'operador_taller'
  | 'solicitudes'
  | 'archivos'
  | 'prioridades'
  | 'plan_trabajo'
  | 'produccion_semanal'
  | 'reportes'
  | 'nube'
  | 'historico'
  | 'historial'
  | 'usuarios'
  | 'requisitores'
  | 'empresas'

type NavChild = {
  view: MainNavView
  label: string
  hint?: string
  icon?: ReactNode
  badge?: number
  badgeTitle?: string
}

type NavGroup = {
  id: 'inventario' | 'bodega' | 'produccion'
  label: string
  icon: ReactNode
  defaultView: MainNavView
  activeViews: MainNavView[]
  children: NavChild[]
  parentBadge?: number
  parentBadgeTitle?: string
  parentExtra?: ReactNode
}

type FlatItem = {
  view: MainNavView
  label: string
  icon?: ReactNode
  badge?: number
  badgeTitle?: string
}

type Props = {
  view: MainNavView
  onNavigate: (view: MainNavView) => void
  groups: NavGroup[]
  flatItems: FlatItem[]
  elevated?: boolean
  /** Panel de revisiones ZIP (solo Bodega), junto al grupo. */
  slotAfterBodega?: ReactNode
}

function isViewActive(view: MainNavView, activeViews: MainNavView[]): boolean {
  return activeViews.includes(view)
}

function NavGroupControl(props: {
  group: NavGroup
  view: MainNavView
  onNavigate: (view: MainNavView) => void
  elevated?: boolean
}) {
  const menuId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const active = isViewActive(props.view, props.group.activeViews)
  const hasChildren = props.group.children.length > 0

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={rootRef} className={['relative inline-flex', props.elevated ? 'z-[110]' : ''].join(' ')}>
      <div
        className={[
          'inline-flex items-stretch overflow-hidden rounded-xl border shadow-sm transition',
          active ? 'border-section-navy/30 bg-section-navy text-white' : 'border-slate-200/90 bg-white/90 text-slate-700',
        ].join(' ')}
      >
        <button
          type="button"
          className={[
            'relative inline-flex items-center gap-2 px-3.5 py-2.5 text-[14px] font-semibold tracking-tight transition sm:px-4',
            active ? 'text-white' : 'hover:bg-slate-50',
          ].join(' ')}
          onClick={() => {
            setOpen(false)
            props.onNavigate(props.group.defaultView)
          }}
        >
          {props.group.icon}
          <span>{props.group.label}</span>
          {props.group.parentBadge != null && props.group.parentBadge > 0 ? (
            <span
              title={props.group.parentBadgeTitle}
              className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white tabular-nums ring-2 ring-white/25"
            >
              {props.group.parentBadge > 99 ? '99+' : props.group.parentBadge}
            </span>
          ) : null}
          {props.group.parentExtra}
        </button>
        {hasChildren ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={menuId}
            aria-label={`Más opciones de ${props.group.label}`}
            className={[
              'inline-flex w-9 shrink-0 items-center justify-center border-l text-[13px] font-bold transition',
              active ? 'border-white/25 hover:bg-white/10' : 'border-slate-200 hover:bg-slate-100',
            ].join(' ')}
            onClick={() => setOpen((o) => !o)}
          >
            <span className={['transition', open ? 'rotate-180' : ''].join(' ')} aria-hidden>
              ▾
            </span>
          </button>
        ) : null}
      </div>

      {open && hasChildren ? (
        <div
          id={menuId}
          role="menu"
          className="absolute left-0 top-[calc(100%+6px)] z-[120] w-[min(17rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_16px_40px_-12px_rgba(15,23,42,0.28)] ring-1 ring-slate-200/80"
        >
          <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
            Dentro de {props.group.label}
          </div>
          <ul className="py-1">
            {props.group.children.map((child) => {
              const childActive = props.view === child.view
              return (
                <li key={child.view}>
                  <button
                    type="button"
                    role="menuitem"
                    className={[
                      'flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition',
                      childActive ? 'bg-section-navy/10 text-section-navy' : 'hover:bg-slate-50',
                    ].join(' ')}
                    onClick={() => {
                      setOpen(false)
                      props.onNavigate(child.view)
                    }}
                  >
                    {child.icon ? (
                      <span className={childActive ? 'text-section-navy' : 'text-slate-500'}>{child.icon}</span>
                    ) : null}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="text-[13px] font-semibold">{child.label}</span>
                        {child.badge != null && child.badge > 0 ? (
                          <span
                            title={child.badgeTitle}
                            className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white tabular-nums"
                          >
                            {child.badge > 99 ? '99+' : child.badge}
                          </span>
                        ) : null}
                      </span>
                      {child.hint ? (
                        <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">{child.hint}</span>
                      ) : null}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

export function MainSectionNav(props: Props) {
  return (
    <nav
      className={[
        'relative flex flex-wrap items-center justify-center gap-2 overflow-visible rounded-2xl border border-white/60 bg-white/80 p-2 shadow-[0_8px_32px_-12px_rgba(4,26,56,0.12)] backdrop-blur-md',
        props.elevated ? 'z-[100]' : 'z-30',
      ].join(' ')}
      aria-label="Módulos principales"
    >
      {props.flatItems.map((item) => {
        const active = props.view === item.view
        return (
          <button
            key={item.view}
            type="button"
            className={[
              'relative inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[14px] font-semibold tracking-tight transition',
              active ? 'bg-section-navy text-white shadow-md' : 'text-slate-600 hover:bg-slate-100/90 hover:text-slate-900',
            ].join(' ')}
            onClick={() => props.onNavigate(item.view)}
          >
            {item.icon}
            <span>{item.label}</span>
            {item.badge != null && item.badge > 0 ? (
              <span
                title={item.badgeTitle}
                className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white tabular-nums ring-2 ring-white/30"
              >
                {item.badge > 99 ? '99+' : item.badge}
              </span>
            ) : null}
          </button>
        )
      })}

      {props.groups.map((group) => (
        <span key={group.id} className="inline-flex items-center gap-1.5">
          <NavGroupControl
            group={group}
            view={props.view}
            onNavigate={props.onNavigate}
            elevated={props.elevated && group.id === 'bodega'}
          />
          {group.id === 'bodega' ? props.slotAfterBodega : null}
        </span>
      ))}
    </nav>
  )
}

export const INVENTARIO_GROUP_VIEWS: MainNavView[] = ['inventario', 'solicitudes']

export const BODEGA_GROUP_VIEWS: MainNavView[] = [
  'bodega',
  'archivos',
  'reportes',
  'nube',
  'historico',
  'prioridades',
]

export const PRODUCCION_GROUP_VIEWS: MainNavView[] = ['plan_trabajo', 'produccion_semanal']

export function isInventarioGroupView(view: MainNavView): boolean {
  return INVENTARIO_GROUP_VIEWS.includes(view)
}

export function isBodegaGroupView(view: MainNavView): boolean {
  return BODEGA_GROUP_VIEWS.includes(view)
}

export function isProduccionGroupView(view: MainNavView): boolean {
  return PRODUCCION_GROUP_VIEWS.includes(view)
}
