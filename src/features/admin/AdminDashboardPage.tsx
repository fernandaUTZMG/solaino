import { useEffect, useMemo, useState } from 'react'
import { formatFechaHoraLocal } from '../../lib/formatDateTime'
import { fetchAdminDashboardCounts, type AdminDashboardCounts } from '../../lib/dashboardCountsRepo'
import { canAccessAdminTools, roleLabel, type AppRole } from '../../lib/roles'
import { IconNavInventory, IconNavUsuarios } from '../../ui/shellIcons'

function IconBodega(props: { className?: string }) {
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
      <path d="M3 9l9-6 9 6" />
      <path d="M5 10v10h14V10" />
      <path d="M9 20v-6h6v6" />
    </svg>
  )
}

function IconBriefcase(props: { className?: string }) {
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
      <path d="M10 2h4a2 2 0 0 1 2 2v2H8V4a2 2 0 0 1 2-2Z" />
      <path d="M3 7h18v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
      <path d="M3 12h18" />
    </svg>
  )
}

function IconClipboard(props: { className?: string }) {
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
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M9 2h6v4H9z" />
      <path d="M8 11h8" />
      <path d="M8 16h8" />
    </svg>
  )
}

function StatCard(props: {
  title: string
  value: string | number
  icon: React.ReactNode
  tone: 'sky' | 'emerald' | 'rose' | 'indigo' | 'amber' | 'slate'
  subtitle?: string
  onClick?: () => void
}) {
  const tone = props.tone
  const toneBg =
    tone === 'sky'
      ? 'bg-sky-500'
      : tone === 'emerald'
        ? 'bg-emerald-600'
        : tone === 'rose'
          ? 'bg-rose-500'
          : tone === 'indigo'
            ? 'bg-indigo-600'
            : tone === 'amber'
              ? 'bg-amber-500'
              : 'bg-slate-600'

  return (
    <button
      type="button"
      onClick={props.onClick}
      className={[
        'group w-full overflow-hidden rounded-2xl border border-slate-200/90 bg-white text-left shadow-sm transition',
        props.onClick ? 'hover:shadow-md hover:-translate-y-[1px] active:translate-y-0' : 'cursor-default',
      ].join(' ')}
      disabled={!props.onClick}
    >
      <div className="flex min-h-[84px] items-stretch">
        <div className={['flex w-20 items-center justify-center text-white', toneBg].join(' ')}>
          <span className="opacity-95">{props.icon}</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-4 py-3">
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{props.title}</div>
          <div className="text-[24px] font-semibold leading-tight tracking-tight text-slate-900 tabular-nums">
            {props.value}
          </div>
          {props.subtitle ? (
            <div className="text-[12px] leading-snug text-slate-500">{props.subtitle}</div>
          ) : null}
        </div>
      </div>
    </button>
  )
}

function fmtCount(n: number | null): string {
  if (n == null) return '—'
  return String(n)
}

export function AdminDashboardPage(props: {
  role: AppRole
  username: string | null
  loginAtIso: string
  onGoInventory: () => void
  onGoBodega: () => void
  onGoUsers: () => void
  onGoRequisitores: () => void
  onGoEmpresas: () => void
}) {
  const allowed = canAccessAdminTools(props.role)
  const [counts, setCounts] = useState<AdminDashboardCounts>({
    users: null,
    empresas: null,
    requisitores: null,
    cotizaciones: null,
  })

  useEffect(() => {
    if (!allowed) return
    let cancelled = false
    void fetchAdminDashboardCounts()
      .then((c) => {
        if (!cancelled) setCounts(c)
      })
      .catch(() => {
        if (!cancelled) {
          setCounts({ users: null, empresas: null, requisitores: null, cotizaciones: null })
        }
      })
    return () => {
      cancelled = true
    }
  }, [allowed])

  const who = useMemo(() => props.username?.trim() || 'Administrador', [props.username])

  if (!allowed) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 shadow-sm">
        No tienes acceso a esta pantalla.
      </div>
    )
  }

  return (
    <section className="space-y-4">
      <div className="rounded-3xl border border-blue-950/30 bg-section-navy px-5 py-4 text-white shadow-md">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-blue-200/90">Panel administrador</div>
            <div className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">{who}</div>
            <div className="mt-1 text-[13px] text-blue-100/85">
              <span className="font-semibold">{roleLabel(props.role)}</span>
              <span className="mx-2 text-white/25">·</span>
              Entrada: <span className="font-semibold">{formatFechaHoraLocal(props.loginAtIso)}</span>
            </div>
          </div>
          <div className="rounded-2xl bg-white/10 px-4 py-3 ring-1 ring-white/15">
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-blue-200/90">Acceso</div>
            <div className="mt-1 text-[13px] text-blue-100/85">
              Inventario + Bodega + Administración
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title="Módulo"
          value="Inventario"
          subtitle="Entradas, salidas, ajustes, solicitudes"
          tone="indigo"
          icon={<IconNavInventory className="h-9 w-9" />}
          onClick={props.onGoInventory}
        />
        <StatCard
          title="Módulo"
          value="Bodega"
          subtitle="Tiempos, OC, archivos, estados"
          tone="emerald"
          icon={<IconBodega className="h-9 w-9" />}
          onClick={props.onGoBodega}
        />
        <StatCard
          title="Usuarios registrados"
          value={fmtCount(counts.users)}
          subtitle="Bodega + oficina"
          tone="sky"
          icon={<IconNavUsuarios className="h-9 w-9" />}
          onClick={props.onGoUsers}
        />
        <StatCard
          title="Clientes (empresa)"
          value={fmtCount(counts.empresas)}
          subtitle="Catálogo de empresas"
          tone="amber"
          icon={<IconBriefcase className="h-9 w-9" />}
          onClick={props.onGoEmpresas}
        />
        <StatCard
          title="Requisitor (clientes)"
          value={fmtCount(counts.requisitores)}
          subtitle="Catálogo de requisitores"
          tone="rose"
          icon={<IconClipboard className="h-9 w-9" />}
          onClick={props.onGoRequisitores}
        />
      </div>
    </section>
  )
}

