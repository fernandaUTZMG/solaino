import { useCallback, useEffect, useMemo, useState } from 'react'
import { AdminDashboardPage } from './features/admin/AdminDashboardPage.tsx'
import { InventoryPage } from './features/inventory/InventoryPage.tsx'
import { LoginPage } from './features/auth/LoginPage.tsx'
import { HistoryPage } from './features/admin/HistoryPage.tsx'
import { UsersAdminPage } from './features/admin/UsersAdminPage.tsx'
import { RequisitoresPage } from './features/admin/RequisitoresPage.tsx'
import { EmpresasPage } from './features/admin/EmpresasPage.tsx'
import { SolicitudesPage } from './features/requests/SolicitudesPage.tsx'
import type { BodegaDeliveryJump } from './features/bodega/BodegaPage.tsx'
import { BodegaHubPage } from './features/bodega/BodegaHubPage.tsx'
import { writeStoredBodegaSection } from './features/bodega/bodegaHubSection.ts'
import { SupervisorArchivosPage } from './features/bodega/SupervisorArchivosPage.tsx'
import { BodegaNubeFilesPage } from './features/bodega/BodegaNubeFilesPage.tsx'
import { BodegaPrioridadesPage } from './features/bodega/BodegaPrioridadesPage.tsx'
import { BodegaReportesPage } from './features/bodega/BodegaReportesPage.tsx'
import { BodegaMaquinadoPage } from './features/bodega/BodegaMaquinadoPage.tsx'
import { BodegaOperatorQueuesPage } from './features/bodega/BodegaOperatorQueuesPage.tsx'
import { BodegaPlanTrabajoPage } from './features/bodega/BodegaPlanTrabajoPage.tsx'
import { BodegaProduccionSemanalPage } from './features/bodega/BodegaProduccionSemanalPage.tsx'
import { BodegaHistoricoPage } from './features/bodega/BodegaHistoricoPage.tsx'
import { DesktopUpdateBanner } from './ui/DesktopUpdateBanner.tsx'
import { TopBar } from './ui/TopBar.tsx'
import { AppNotificationsBell } from './ui/AppNotificationsBell.tsx'
import {
  BODEGA_GROUP_VIEWS,
  INVENTARIO_GROUP_VIEWS,
  PRODUCCION_GROUP_VIEWS,
  MainSectionNav,
  type MainNavView,
} from './ui/MainSectionNav.tsx'
import {
  IconNavHistorial,
  IconNavHome,
  IconNavInventory,
  IconNavSolicitudes,
  IconNavArchivos,
  IconNavCloud,
  IconNavPrioridades,
  IconNavPlanTrabajo,
  IconNavProduccion,
  IconNavReportes,
  IconNavUsuarios,
} from './ui/shellIcons.tsx'
import { isSupabaseConfigured } from './env.ts'
import { humanizeProfileLoadError, loadSessionProfile, signOut, type MyProfile, useSession } from './lib/auth.ts'
import { fetchPendingPasswordRecoveryCount } from './lib/passwordRecoveryRepo.ts'
import { getSupabase } from './lib/supabaseClient.ts'
import {
  canAccessAdminTools,
  canManageUsers,
  canAccessBodega,
  canAccessBodegaArchivosDisenoNav,
  canAccessBodegaPrioridadesNav,
  canAccessProduccionNav,
  canAccessBodegaReportesNav,
  canAccessHistoricoNav,
  canAccessInventory,
  canAccessMaquinadoNav,
  canAccessTallerOperadorNav,
  canManageBodegaLikeAdmin,
  canAccessSolicitudesNav,
  canManageSolicitudes,
  canReceiveBodegaPrioridadNotifications,
  canReviewBodegaDesign,
  type AppRole,
} from './lib/roles.ts'
import {
  fetchPendingDeliveryReviewsForSupervisors,
  type PendingDeliveryReviewItem,
} from './lib/bodegaPendingReviewsRepo.ts'

type AppMainView =
  | 'inicio'
  | 'inventario'
  | 'bodega'
  | 'operador_taller'
  | 'maquinado'
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

const APP_MAIN_VIEWS: readonly AppMainView[] = [
  'inicio',
  'inventario',
  'bodega',
  'operador_taller',
  'maquinado',
  'solicitudes',
  'archivos',
  'prioridades',
  'plan_trabajo',
  'produccion_semanal',
  'reportes',
  'nube',
  'historico',
  'historial',
  'usuarios',
  'requisitores',
  'empresas',
]

function navViewStorageKey(userId: string): string {
  return `solaino.mainView:${userId}`
}

function readStoredMainView(userId: string): AppMainView | null {
  try {
    const raw = localStorage.getItem(navViewStorageKey(userId))?.trim()
    if (!raw || !(APP_MAIN_VIEWS as readonly string[]).includes(raw)) return null
    return raw as AppMainView
  } catch {
    return null
  }
}

function writeStoredMainView(userId: string, v: AppMainView): void {
  try {
    localStorage.setItem(navViewStorageKey(userId), v)
  } catch {
    /* ignore quota / private mode */
  }
}

function parseHashMainView(): AppMainView | null {
  const m = /^#view=([^&]+)$/.exec(window.location.hash.trim())
  if (!m) return null
  const v = decodeURIComponent(m[1]) as AppMainView
  return (APP_MAIN_VIEWS as readonly string[]).includes(v) ? v : null
}

function syncHashMainView(v: AppMainView | null): void {
  const path = `${window.location.pathname}${window.location.search}`
  if (!v) {
    window.history.replaceState(null, '', path)
    return
  }
  window.history.replaceState(null, '', `${path}#view=${encodeURIComponent(v)}`)
}

function isBodegaModuleView(v: AppMainView): boolean {
  return v === 'bodega'
}

/** Migra hash antiguo #view=maquinado / #view=operador_taller a la vista dedicada. */
function resolveMainView(v: AppMainView, role: AppRole, _userId: string): AppMainView {
  if (v === 'maquinado' && canAccessMaquinadoNav(role)) return 'maquinado'
  if (v === 'operador_taller' && canAccessTallerOperadorNav(role)) return 'operador_taller'
  return isBodegaModuleView(v) ? 'bodega' : v
}

function isMainViewAllowed(v: AppMainView, role: AppRole): boolean {
  switch (v) {
    case 'inicio':
    case 'historial':
    case 'usuarios':
      return canManageUsers(role)
    case 'inventario':
      return canAccessInventory(role)
    case 'bodega':
    case 'nube':
      return canAccessBodega(role)
    case 'operador_taller':
      return canAccessTallerOperadorNav(role)
    case 'maquinado':
      return canAccessMaquinadoNav(role)
    case 'solicitudes':
      return canAccessSolicitudesNav(role)
    case 'archivos':
      return canAccessBodegaArchivosDisenoNav(role)
    case 'prioridades':
      return canAccessBodegaPrioridadesNav(role)
    case 'plan_trabajo':
    case 'produccion_semanal':
      return canAccessProduccionNav(role)
    case 'reportes':
      return canAccessBodegaReportesNav(role)
    case 'historico':
      return canAccessHistoricoNav(role)
    case 'empresas':
    case 'requisitores':
      return canManageBodegaLikeAdmin(role)
    default:
      return false
  }
}

function App() {
  const { session, loading } = isSupabaseConfigured() ? useSession() : { session: null, loading: false }
  const [role, setRole] = useState<AppRole>('user')
  const [myProfile, setMyProfile] = useState<MyProfile | null>(null)
  const [view, setView] = useState<AppMainView>('inventario')
  /** Evita escribir localStorage con la vista por defecto antes de conocer rol y preferencia guardada. */
  const [mainNavReady, setMainNavReady] = useState(false)
  const [profileLoadError, setProfileLoadError] = useState<string | null>(null)
  const [pendingSolicitudes, setPendingSolicitudes] = useState<number>(0)
  const [pendingRecoveries, setPendingRecoveries] = useState<number>(0)
  const [loginAtIso, setLoginAtIso] = useState<string>(() => new Date().toISOString())
  const [bodegaPendingReviews, setBodegaPendingReviews] = useState<PendingDeliveryReviewItem[]>([])
  const [bodegaDeliveryJumpRequest, setBodegaDeliveryJumpRequest] = useState<BodegaDeliveryJump | null>(null)
  const [bodegaReviewPanelOpen, setBodegaReviewPanelOpen] = useState(false)
  const [bodegaProjectDeliveryOpen, setBodegaProjectDeliveryOpen] = useState(false)
  const showAuth = useMemo(() => isSupabaseConfigured(), [])

  const clearBodegaDeliveryJump = useCallback(() => {
    setBodegaDeliveryJumpRequest(null)
  }, [])

  const openBodegaProjectFromNotification = useCallback(
    (projectId: string, opts?: { tab?: BodegaDeliveryJump['tab'] }) => {
      const tab: BodegaDeliveryJump['tab'] =
        opts?.tab ?? (role === 'programadora_maquinaria' ? 'cnc' : 'diseno')
      setBodegaDeliveryJumpRequest({ projectId, tab })
      setView('bodega')
    },
    [role],
  )

  const refreshBodegaPendingReviews = useCallback(async () => {
    if (!showAuth || !session || !canReviewBodegaDesign(role)) {
      setBodegaPendingReviews([])
      return
    }
    try {
      setBodegaPendingReviews(await fetchPendingDeliveryReviewsForSupervisors())
    } catch {
      setBodegaPendingReviews([])
    }
  }, [showAuth, session, role])

  async function refreshPendingSolicitudes() {
    if (!showAuth) return
    if (!session) {
      setPendingSolicitudes(0)
      return
    }
    if (!canManageSolicitudes(role)) {
      setPendingSolicitudes(0)
      return
    }
    try {
      const sb = getSupabase()
      const { data, error } = await sb
        .from('solicitudes')
        .select('id')
        .eq('status', 'pendiente')
      if (error) throw error
      setPendingSolicitudes((data as unknown[] | null)?.length ?? 0)
    } catch {
      setPendingSolicitudes(0)
    }
  }

  // Solo al iniciar sesión / cambiar de usuario — no en cada TOKEN_REFRESHED
  // (eso sacaba al usuario de la sección al volver de otra pantalla).
  const sessionUserId = session?.user?.id ?? null
  useEffect(() => {
    if (!showAuth) return
    if (!sessionUserId) {
      setRole('user')
      setMyProfile(null)
      setMainNavReady(false)
      setProfileLoadError(null)
      setView('inventario')
      syncHashMainView(null)
      setPendingSolicitudes(0)
      setPendingRecoveries(0)
      return
    }
    setMainNavReady(false)
    setProfileLoadError(null)
    setLoginAtIso(new Date().toISOString())
    let active = true
    void loadSessionProfile().then((result) => {
      if (!active) return
      if (!result.ok) {
        setMyProfile(null)
        setRole('user')
        setProfileLoadError(result.message)
        setMainNavReady(true)
        return
      }

      const p = result.profile
      setMyProfile(p)
      const nextRole = p.role
      setRole(nextRole)

      const uid = sessionUserId
      const fromHash = parseHashMainView()
      const fromStore = readStoredMainView(uid)
      const preferredRaw =
        (fromHash && isMainViewAllowed(fromHash, nextRole) ? fromHash : null) ??
        (fromStore && isMainViewAllowed(fromStore, nextRole) ? fromStore : null)
      if (preferredRaw) {
        setView(resolveMainView(preferredRaw, nextRole, uid))
      } else if (canAccessAdminTools(nextRole)) {
        setView('inicio')
      } else if (canAccessBodegaPrioridadesNav(nextRole)) {
        setView('prioridades')
      } else if (!canAccessInventory(nextRole) && canAccessBodega(nextRole)) {
        setView('bodega')
        if (canAccessMaquinadoNav(nextRole) && !canAccessTallerOperadorNav(nextRole)) {
          writeStoredBodegaSection(uid, 'maquinado')
        } else if (canAccessTallerOperadorNav(nextRole) && !canAccessMaquinadoNav(nextRole)) {
          writeStoredBodegaSection(uid, 'taller')
        }
      } else {
        setView('inventario')
      }
      setMainNavReady(true)
    })
    return () => {
      active = false
    }
  }, [sessionUserId, showAuth])

  useEffect(() => {
    if (!showAuth || !session?.user?.id || !mainNavReady) return
    writeStoredMainView(session.user.id, view)
    syncHashMainView(view)
  }, [view, session?.user?.id, mainNavReady, showAuth])

  useEffect(() => {
    if (!showAuth || !session || !mainNavReady) return
    const onHashChange = () => {
      const h = parseHashMainView()
      if (h && isMainViewAllowed(h, role)) {
        setView(resolveMainView(h, role, session.user.id))
      }
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [showAuth, session, mainNavReady, role])

  useEffect(() => {
    if (!showAuth || !session || !canManageUsers(role)) {
      setPendingRecoveries(0)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const n = await fetchPendingPasswordRecoveryCount()
        if (!cancelled) setPendingRecoveries(n)
      } catch {
        if (!cancelled) setPendingRecoveries(0)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [session, role, showAuth])

  useEffect(() => {
    if (!showAuth || !session) return
    if (view === 'solicitudes' && !canAccessSolicitudesNav(role)) {
      setView(
        canAccessAdminTools(role)
          ? 'inicio'
          : canAccessInventory(role)
            ? 'inventario'
            : canAccessBodega(role)
              ? 'bodega'
              : 'inventario',
      )
    }
    if (view === 'archivos' && !canAccessBodegaArchivosDisenoNav(role)) {
      setView(
        canAccessAdminTools(role)
          ? 'inicio'
          : canAccessInventory(role)
            ? 'inventario'
            : canAccessBodega(role)
              ? 'bodega'
              : 'inventario',
      )
    }
    if (view === 'prioridades' && !canAccessBodegaPrioridadesNav(role)) {
      setView(
        canAccessAdminTools(role)
          ? 'inicio'
          : canAccessInventory(role)
            ? 'inventario'
            : canAccessBodega(role)
              ? 'bodega'
              : 'inventario',
      )
    }
    if (view === 'plan_trabajo' && !canAccessProduccionNav(role)) {
      setView(
        canAccessAdminTools(role)
          ? 'inicio'
          : canAccessInventory(role)
            ? 'inventario'
            : canAccessBodega(role)
              ? 'bodega'
              : 'inventario',
      )
    }
    if (view === 'produccion_semanal' && !canAccessProduccionNav(role)) {
      setView(
        canAccessAdminTools(role)
          ? 'inicio'
          : canAccessInventory(role)
            ? 'inventario'
            : canAccessBodega(role)
              ? 'bodega'
              : 'inventario',
      )
    }
    if (view === 'reportes' && !canAccessBodegaReportesNav(role)) {
      setView(
        canAccessAdminTools(role)
          ? 'inicio'
          : canAccessInventory(role)
            ? 'inventario'
            : canAccessBodega(role)
              ? 'bodega'
              : 'inventario',
      )
    }
    if (view === 'nube' && !canAccessBodega(role)) {
      setView(
        canAccessAdminTools(role)
          ? 'inicio'
          : canAccessInventory(role)
            ? 'inventario'
            : 'inventario',
      )
    }
    if (view === 'historico' && !canAccessHistoricoNav(role)) {
      setView(canAccessBodega(role) ? 'bodega' : 'inventario')
    }
    if (view === 'maquinado' && !canAccessMaquinadoNav(role)) {
      setView(canAccessBodega(role) ? 'bodega' : 'inventario')
    }
    if (view === 'operador_taller' && !canAccessTallerOperadorNav(role)) {
      setView(canAccessBodega(role) ? 'bodega' : 'inventario')
    }
    if (view === 'usuarios' && !canManageUsers(role)) {
      setView(canAccessBodega(role) ? 'bodega' : 'inventario')
    }
    if ((view === 'inicio' || view === 'historial') && !canAccessAdminTools(role)) {
      setView(
        canManageUsers(role) ? 'usuarios' : canAccessBodega(role) ? 'bodega' : 'inventario',
      )
    }
  }, [showAuth, session, role, view])

  useEffect(() => {
    void refreshBodegaPendingReviews()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, role, showAuth])

  useEffect(() => {
    if (!showAuth || !session || !canReviewBodegaDesign(role)) return
    const t = window.setInterval(() => {
      void refreshBodegaPendingReviews()
    }, 20000)
    return () => window.clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAuth, session, role])

  useEffect(() => {
    setBodegaReviewPanelOpen(false)
  }, [view])

  useEffect(() => {
    void refreshPendingSolicitudes()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, role, showAuth])

  useEffect(() => {
    if (!showAuth || !session || !canManageUsers(role)) return
    const t = window.setInterval(() => {
      void refreshPendingSolicitudes()
      void (async () => {
        try {
          const n = await fetchPendingPasswordRecoveryCount()
          setPendingRecoveries(n)
        } catch {
          setPendingRecoveries(0)
        }
      })()
    }, 15000)
    return () => window.clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAuth, session, role])

  async function refreshAdminBadges() {
    await refreshPendingSolicitudes()
    await refreshBodegaPendingReviews()
    if (canManageUsers(role) && session && showAuth) {
      try {
        setPendingRecoveries(await fetchPendingPasswordRecoveryCount())
      } catch {
        setPendingRecoveries(0)
      }
    }
  }

  const showTopBar = (!showAuth || Boolean(session) || loading) && !bodegaProjectDeliveryOpen

  const mainNavGroups = useMemo(() => {
    const groups: Parameters<typeof MainSectionNav>[0]['groups'] = []

    if (canAccessInventory(role)) {
      const children: Parameters<typeof MainSectionNav>[0]['groups'][0]['children'] = []
      if (canAccessSolicitudesNav(role)) {
        children.push({
          view: 'solicitudes',
          label: 'Solicitudes',
          hint: 'Productos que pides al inventario',
          icon: <IconNavSolicitudes className="h-[17px] w-[17px] shrink-0" />,
          badge: canManageSolicitudes(role) ? pendingSolicitudes : undefined,
          badgeTitle:
            pendingSolicitudes > 0 ? `${pendingSolicitudes} solicitud(es) pendiente(s)` : undefined,
        })
      }
      groups.push({
        id: 'inventario',
        label: 'Inventario',
        icon: <IconNavInventory className="h-[18px] w-[18px] shrink-0 opacity-95" />,
        defaultView: 'inventario',
        activeViews: [...INVENTARIO_GROUP_VIEWS],
        children,
      })
    }

    if (canAccessBodega(role)) {
      const children: Parameters<typeof MainSectionNav>[0]['groups'][0]['children'] = [
        {
          view: 'bodega',
          label: 'Proyectos',
          hint: 'Diseño, programación, maquinado y taller',
          icon: <IconNavHome className="h-[17px] w-[17px] shrink-0" />,
        },
      ]
      if (canAccessBodegaArchivosDisenoNav(role)) {
        children.push({
          view: 'archivos',
          label: 'Archivos',
          hint: 'Información adjunta para diseño (supervisor)',
          icon: <IconNavArchivos className="h-[17px] w-[17px] shrink-0" />,
        })
      }
      if (canAccessBodegaReportesNav(role)) {
        children.push({
          view: 'reportes',
          label: 'Reportes',
          hint: 'Tiempos y avance de bodega',
          icon: <IconNavReportes className="h-[17px] w-[17px] shrink-0" />,
        })
      }
      if (canAccessBodega(role)) {
        children.push({
          view: 'nube',
          label: 'Nube',
          hint: 'Archivos que sube cada usuario',
          icon: <IconNavCloud className="h-[17px] w-[17px] shrink-0" />,
        })
      }
      if (canAccessHistoricoNav(role)) {
        children.push({
          view: 'historico',
          label: 'Histórico',
          hint: 'Respaldo y archivos del flujo por área',
          icon: <IconNavHistorial className="h-[17px] w-[17px] shrink-0" />,
        })
      }
      if (canAccessBodegaPrioridadesNav(role)) {
        children.push({
          view: 'prioridades',
          label: 'Prioridades',
          hint: 'Orden de trabajo de proyectos',
          icon: <IconNavPrioridades className="h-[17px] w-[17px] shrink-0" />,
        })
      }
      if (canAccessMaquinadoNav(role)) {
        children.push({
          view: 'maquinado',
          label: 'Maquinado',
          hint: 'Cola CNC/Torno por pieza',
        })
      }
      if (canAccessTallerOperadorNav(role)) {
        children.push({
          view: 'operador_taller',
          label: 'Taller',
          hint: 'Perfilado, detallado y armado',
        })
      }
      groups.push({
        id: 'bodega',
        label: 'Bodega',
        icon: <IconNavHome className="h-[18px] w-[18px] shrink-0 opacity-95" />,
        defaultView: 'bodega',
        activeViews: [
          ...BODEGA_GROUP_VIEWS,
          ...(canAccessMaquinadoNav(role) ? (['maquinado'] as const) : []),
          ...(canAccessTallerOperadorNav(role) ? (['operador_taller'] as const) : []),
        ],
        children,
        parentBadge:
          canReviewBodegaDesign(role) && bodegaPendingReviews.length > 0
            ? bodegaPendingReviews.length
            : undefined,
        parentBadgeTitle:
          bodegaPendingReviews.length > 0
            ? `${bodegaPendingReviews.length} entrega(s) pendientes de revisión`
            : undefined,
      })
    }

    if (canAccessProduccionNav(role)) {
      groups.push({
        id: 'produccion',
        label: 'Producción',
        icon: <IconNavProduccion className="h-[18px] w-[18px] shrink-0 opacity-95" />,
        defaultView: 'plan_trabajo',
        activeViews: [...PRODUCCION_GROUP_VIEWS],
        children: [
          {
            view: 'plan_trabajo',
            label: 'Plan de trabajo bodega',
            hint: 'Plan semanal, avance y atrasos',
            icon: <IconNavPlanTrabajo className="h-[17px] w-[17px] shrink-0" />,
          },
          {
            view: 'produccion_semanal',
            label: 'Producción semanal',
            hint: 'Seguimiento semanal de producción',
            icon: <IconNavProduccion className="h-[17px] w-[17px] shrink-0" />,
          },
        ],
      })
    }

    return groups
  }, [role, pendingSolicitudes, bodegaPendingReviews.length])

  const mainNavFlatItems = useMemo(() => {
    const items: Parameters<typeof MainSectionNav>[0]['flatItems'] = []
    if (canAccessAdminTools(role)) {
      items.push({ view: 'inicio', label: 'Inicio' })
      items.push({
        view: 'historial',
        label: 'Historial',
        icon: <IconNavHistorial className="h-[18px] w-[18px] shrink-0 opacity-95" />,
      })
      items.push({
        view: 'usuarios',
        label: 'Usuarios',
        icon: <IconNavUsuarios className="h-[18px] w-[18px] shrink-0 opacity-95" />,
        badge: pendingRecoveries,
        badgeTitle:
          pendingRecoveries > 0 ? `${pendingRecoveries} recuperación(es) de contraseña` : undefined,
      })
    } else {
      if (canManageBodegaLikeAdmin(role)) {
        items.push({ view: 'empresas', label: 'Clientes (empresas)' })
        items.push({ view: 'requisitores', label: 'Requisitores' })
      }
      if (canManageUsers(role)) {
        items.push({
          view: 'usuarios',
          label: 'Usuarios',
          icon: <IconNavUsuarios className="h-[18px] w-[18px] shrink-0 opacity-95" />,
          badge: pendingRecoveries,
          badgeTitle:
            pendingRecoveries > 0 ? `${pendingRecoveries} recuperación(es) de contraseña` : undefined,
        })
      }
    }
    return items
  }, [role, pendingRecoveries])

  const bodegaReviewSlot =
    canAccessBodega(role) && canReviewBodegaDesign(role) && bodegaPendingReviews.length > 0 ? (
      <div className={['relative inline-flex items-stretch', bodegaReviewPanelOpen ? 'z-[110]' : ''].join(' ')}>
        <button
          type="button"
          title="Ver cuál revisar (folio, tipo y archivo)"
          aria-expanded={bodegaReviewPanelOpen}
          aria-label="Listado de entregas pendientes de revisión"
          className={[
            'inline-flex shrink-0 items-center justify-center rounded-xl border px-2.5 py-2 text-[12px] font-bold transition',
            bodegaReviewPanelOpen
              ? 'border-section-navy bg-section-navy text-white shadow-md'
              : 'border-amber-400/80 bg-amber-50 text-amber-950 hover:bg-amber-100',
          ].join(' ')}
          onClick={() => setBodegaReviewPanelOpen((o) => !o)}
        >
          !
        </button>
        {bodegaReviewPanelOpen ? (
          <div
            className="absolute left-0 top-[calc(100%+6px)] z-[120] isolate w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_20px_50px_-12px_rgba(15,23,42,0.35)] ring-1 ring-slate-200/80"
            role="menu"
          >
            <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-600">
              Pendiente de revisión — elige para abrir el proyecto
            </div>
            <ul className="max-h-72 overflow-y-auto py-1">
              {bodegaPendingReviews.map((item) => (
                <li key={`${item.kind}-${item.versionId}`}>
                  <button
                    type="button"
                    role="menuitem"
                    className="w-full bg-white px-3 py-2.5 text-left text-[12px] transition hover:bg-sky-50"
                    onClick={() => {
                      setBodegaReviewPanelOpen(false)
                      setBodegaDeliveryJumpRequest({
                        projectId: item.projectId,
                        tab: item.kind === 'design' ? 'diseno' : 'cnc',
                      })
                      setView('bodega')
                    }}
                  >
                    <div className="font-mono text-[12px] font-bold text-slate-900">
                      {item.folio ?? `Proyecto ${item.projectId.slice(0, 8)}…`}
                    </div>
                    <div className="mt-0.5 text-[11px] font-semibold text-blue-900">
                      {item.kind === 'design' ? 'Diseño' : 'Programación / CNC'} · versión {item.version}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-slate-600" title={item.zipFilename}>
                      {item.zipFilename}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    ) : null

  const bodegaNavSlot =
    canAccessBodega(role) &&
    (canReceiveBodegaPrioridadNotifications(role) || bodegaReviewSlot != null) ? (
      <span className="inline-flex items-center gap-1.5">
        {canReceiveBodegaPrioridadNotifications(role) ? (
          <AppNotificationsBell variant="nav" onOpenProject={openBodegaProjectFromNotification} />
        ) : null}
        {bodegaReviewSlot}
      </span>
    ) : null

  useEffect(() => {
    if (!bodegaProjectDeliveryOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [bodegaProjectDeliveryOpen])

  return (
    <div
      className={[
        'min-h-screen text-slate-900',
        showAuth && session && !bodegaProjectDeliveryOpen ? 'font-ios antialiased' : '',
        showTopBar && showAuth && session
          ? 'bg-gradient-to-b from-slate-200/90 via-slate-100 to-blue-50/50'
          : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {showTopBar ? (
        <div className="relative z-40">
          <TopBar sessionInfo={myProfile} authEmail={session?.user?.email ?? null} />
          <DesktopUpdateBanner />
        </div>
      ) : null}
      <main
        className={
          bodegaProjectDeliveryOpen
            ? 'min-h-0 w-full max-w-none flex-1 p-0'
            : showTopBar
              ? [
                  'mx-auto w-full px-4 py-5 sm:py-6',
                  view === 'solicitudes' ||
                  view === 'archivos' ||
                  view === 'prioridades' ||
                  view === 'plan_trabajo' ||
                  view === 'produccion_semanal' ||
                  view === 'reportes' ||
                  view === 'nube' ||
                  view === 'inventario'
                    ? 'max-w-[min(100%,1920px)] sm:px-8'
                    : 'max-w-screen-2xl sm:px-6',
                ].join(' ')
              : 'min-h-0 w-full flex-1'
        }
      >
        {showAuth ? (
          loading ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-sm">
              Verificando sesión…
            </div>
          ) : session ? (
            !mainNavReady ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-sm">
                Cargando tu perfil…
              </div>
            ) : profileLoadError ? (
              <div className="max-w-lg space-y-4 rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-950 shadow-sm">
                <p className="font-semibold">No se pudo iniciar tu sesión correctamente</p>
                <p>{humanizeProfileLoadError(profileLoadError)}</p>
                <button
                  type="button"
                  className="rounded-xl bg-section-navy px-4 py-2 font-semibold text-white hover:bg-section-navy/90"
                  onClick={() => void signOut({ localOnly: true }).catch(() => undefined)}
                >
                  Cerrar sesión e intentar de nuevo
                </button>
              </div>
            ) : (
            <div className={bodegaProjectDeliveryOpen ? 'min-h-0' : 'space-y-6'}>
              {!bodegaProjectDeliveryOpen ? (
                <MainSectionNav
                  view={view as MainNavView}
                  onNavigate={(v) => {
                    setBodegaReviewPanelOpen(false)
                    setView(v as AppMainView)
                  }}
                  flatItems={mainNavFlatItems}
                  groups={mainNavGroups}
                  elevated={bodegaReviewPanelOpen}
                  slotAfterBodega={bodegaNavSlot}
                />
              ) : null}

              {view === 'inicio' ? (
                <AdminDashboardPage
                  role={role}
                  username={myProfile?.username ?? null}
                  loginAtIso={loginAtIso}
                  onGoInventory={() => setView('inventario')}
                  onGoBodega={() => setView('bodega')}
                  onGoUsers={() => setView('usuarios')}
                  onGoRequisitores={() => setView('requisitores')}
                  onGoEmpresas={() => setView('empresas')}
                />
              ) : view === 'empresas' ? (
                <EmpresasPage role={role} />
              ) : view === 'requisitores' ? (
                <RequisitoresPage role={role} />
              ) : isBodegaModuleView(view) && canAccessBodega(role) ? (
                <BodegaHubPage
                  role={role}
                  deliveryJumpRequest={bodegaDeliveryJumpRequest}
                  onDeliveryJumpConsumed={clearBodegaDeliveryJump}
                  onBodegaDeliveriesChanged={refreshBodegaPendingReviews}
                  onProjectDeliveryScreenOpen={setBodegaProjectDeliveryOpen}
                />
              ) : view === 'inventario' ? (
                canAccessInventory(role) ? (
                  <InventoryPage role={role} onSolicitudesChanged={() => void refreshAdminBadges()} />
                ) : canAccessBodega(role) ? (
                  <BodegaHubPage
                    role={role}
                    deliveryJumpRequest={bodegaDeliveryJumpRequest}
                    onDeliveryJumpConsumed={clearBodegaDeliveryJump}
                    onBodegaDeliveriesChanged={refreshBodegaPendingReviews}
                    onProjectDeliveryScreenOpen={setBodegaProjectDeliveryOpen}
                  />
                ) : (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 shadow-sm">
                    No tienes acceso a este módulo.
                  </div>
                )
              ) : view === 'solicitudes' && canAccessSolicitudesNav(role) ? (
                <SolicitudesPage role={role} onChanged={() => void refreshAdminBadges()} />
              ) : view === 'archivos' && canAccessBodegaArchivosDisenoNav(role) ? (
                <SupervisorArchivosPage role={role} onUploaded={() => void refreshBodegaPendingReviews()} />
              ) : view === 'prioridades' && canAccessBodegaPrioridadesNav(role) ? (
                <BodegaPrioridadesPage
                  role={role}
                  onOpenProject={(projectId) => {
                    setBodegaDeliveryJumpRequest({
                      projectId,
                      tab: role === 'programadora_maquinaria' ? 'cnc' : 'diseno',
                    })
                    setView('bodega')
                  }}
                />
              ) : view === 'plan_trabajo' && canAccessProduccionNav(role) ? (
                <BodegaPlanTrabajoPage
                  role={role}
                  onOpenProject={(projectId) => {
                    setBodegaDeliveryJumpRequest({
                      projectId,
                      tab: role === 'programadora_maquinaria' ? 'cnc' : 'diseno',
                    })
                    setView('bodega')
                  }}
                />
              ) : view === 'produccion_semanal' && canAccessProduccionNav(role) ? (
                <BodegaProduccionSemanalPage role={role} />
              ) : view === 'reportes' && canAccessBodegaReportesNav(role) ? (
                <BodegaReportesPage role={role} />
              ) : view === 'nube' && canAccessBodega(role) ? (
                <BodegaNubeFilesPage role={role} />
              ) : view === 'historico' && canAccessHistoricoNav(role) ? (
                <BodegaHistoricoPage role={role} />
              ) : view === 'maquinado' && canAccessMaquinadoNav(role) ? (
                <BodegaMaquinadoPage role={role} />
              ) : view === 'operador_taller' && canAccessTallerOperadorNav(role) ? (
                <BodegaOperatorQueuesPage role={role} />
              ) : view === 'usuarios' && canManageUsers(role) ? (
                <UsersAdminPage role={role} onChanged={() => void refreshAdminBadges()} />
              ) : canAccessAdminTools(role) ? (
                <HistoryPage role={role} />
              ) : (
                canAccessInventory(role) ? (
                  <InventoryPage role={role} onSolicitudesChanged={() => void refreshAdminBadges()} />
                ) : canAccessBodega(role) ? (
                  <BodegaHubPage
                    role={role}
                    deliveryJumpRequest={bodegaDeliveryJumpRequest}
                    onDeliveryJumpConsumed={clearBodegaDeliveryJump}
                    onBodegaDeliveriesChanged={refreshBodegaPendingReviews}
                    onProjectDeliveryScreenOpen={setBodegaProjectDeliveryOpen}
                  />
                ) : (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 shadow-sm">
                    No tienes acceso a este módulo.
                  </div>
                )
              )}
            </div>
            )
          ) : (
            <LoginPage />
          )
        ) : (
          <InventoryPage role="admin" />
        )}
      </main>
    </div>
  )
}

export default App
