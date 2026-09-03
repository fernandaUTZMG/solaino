import { useEffect, useMemo, useState } from 'react'
import { isSupabaseConfigured } from '../env'
import { signOut } from '../lib/auth'
import { isDesktopApp } from '../lib/loginRemember'
import { roleLabel, type AppRole } from '../lib/roles'

export type TopBarSessionInfo = { username: string | null; role: AppRole }

function localPartEmail(email: string | null | undefined): string | null {
  if (!email || !email.includes('@')) return email?.trim() || null
  return email.split('@')[0]?.trim() || null
}

function IconLogOut(props: { className?: string }) {
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
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" x2="9" y1="12" y2="12" />
    </svg>
  )
}

function BrandLogo() {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <div className="rounded-xl bg-white/95 px-3 py-2 shadow-md ring-1 ring-white/40">
        <span className="text-base font-semibold tracking-tight text-section-navy">Solaino</span>
        <span className="ml-2 text-[10px] font-bold uppercase tracking-[0.12em] text-blue-700">Inventario</span>
      </div>
    )
  }

  return (
    <div className="rounded-xl bg-white px-2.5 py-1.5 shadow-md ring-1 ring-white/50 sm:px-3 sm:py-2">
      <img
        src="/img/logo2.png"
        alt="Solain — Soluciones integrales"
        className="h-8 w-auto max-w-[min(52vw,240px)] object-contain object-left sm:h-9 sm:max-w-[280px]"
        onError={() => setFailed(true)}
      />
    </div>
  )
}

function SessionAvatar({ label }: { label: string }) {
  const letter = (label.trim()[0] || '?').toUpperCase()
  return (
    <div
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/20 text-[13px] font-bold text-white ring-1 ring-white/25 sm:h-10 sm:w-10 sm:text-[14px]"
      aria-hidden
    >
      {letter}
    </div>
  )
}

export function TopBar(props: { sessionInfo?: TopBarSessionInfo | null; authEmail?: string | null }) {
  const [appVersion, setAppVersion] = useState<string | null>(null)

  useEffect(() => {
    if (isDesktopApp() && window.solainoDesktop?.updater?.getVersion) {
      void window.solainoDesktop.updater.getVersion().then(setAppVersion).catch(() => {})
      return
    }
    const webVersion = import.meta.env.VITE_APP_VERSION?.trim()
    if (webVersion) setAppVersion(webVersion)
  }, [])

  const sessionDisplay = useMemo(() => {
    if (props.sessionInfo) {
      const user = props.sessionInfo.username?.trim() || localPartEmail(props.authEmail) || 'Usuario'
      return { kind: 'full' as const, user, roleLabel: roleLabel(props.sessionInfo.role) }
    }
    if (props.authEmail) {
      const user = localPartEmail(props.authEmail) || 'Usuario'
      return { kind: 'partial' as const, user }
    }
    return { kind: 'placeholder' as const }
  }, [props.sessionInfo, props.authEmail])

  const badgeTitle =
    sessionDisplay.kind === 'full'
      ? `${sessionDisplay.user} · ${sessionDisplay.roleLabel}`
      : sessionDisplay.kind === 'partial'
        ? `${sessionDisplay.user} · …`
        : 'Módulo inventario'

  const showSignOut = isSupabaseConfigured()

  return (
    <header className="font-ios sticky top-0 z-40 w-full border-b border-black/20 bg-section-navy shadow-[0_12px_40px_-16px_rgba(0,0,0,0.45)] antialiased">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.07] to-transparent" aria-hidden />
      <div className="relative mx-auto flex w-full max-w-screen-2xl items-center gap-3 px-4 py-2.5 sm:gap-4 sm:px-6 sm:py-3">
        <div className="min-w-0 shrink">
          <BrandLogo />
        </div>

        <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2 sm:gap-3">
          {sessionDisplay.kind === 'full' ? (
            <div
              className="flex min-w-0 max-w-[min(100%,14rem)] items-center gap-2.5 rounded-xl bg-white/10 py-1.5 pl-2 pr-2.5 ring-1 ring-white/15 sm:max-w-[18rem] sm:gap-3 sm:rounded-2xl sm:px-3 sm:py-2"
              title={badgeTitle}
            >
              <SessionAvatar label={sessionDisplay.user} />
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-[14px] font-semibold tracking-tight text-white sm:text-[15px]">
                  {sessionDisplay.user}
                </p>
                <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-blue-200/90 sm:text-[11px]">
                  {sessionDisplay.roleLabel}
                </p>
              </div>
            </div>
          ) : sessionDisplay.kind === 'partial' ? (
            <div
              className="flex min-w-0 max-w-[min(100%,14rem)] items-center gap-2.5 rounded-xl bg-white/10 px-2.5 py-1.5 ring-1 ring-white/15 sm:rounded-2xl sm:px-3 sm:py-2"
              title={badgeTitle}
            >
              <SessionAvatar label={sessionDisplay.user} />
              <p className="min-w-0 flex-1 truncate text-[14px] font-semibold text-white sm:text-[15px]">
                {sessionDisplay.user}
                <span className="font-normal text-blue-200/80"> · …</span>
              </p>
            </div>
          ) : (
            <span className="max-w-[10rem] truncate rounded-xl bg-white/10 px-2.5 py-1.5 text-center text-[12px] font-medium text-blue-100/90 ring-1 ring-white/10 sm:max-w-none sm:px-3 sm:text-[13px]">
              Módulo inventario
            </span>
          )}

          <div className="hidden h-8 w-px shrink-0 bg-white/20 sm:block" aria-hidden />

          {appVersion ? (
            <span
              className="inline-flex h-9 shrink-0 items-center rounded-xl bg-white/10 px-2.5 font-mono text-[11px] font-semibold tabular-nums text-blue-100 ring-1 ring-white/10 sm:h-10 sm:px-3 sm:text-[12px]"
              title={
                isDesktopApp()
                  ? `Versión instalada: v${appVersion}`
                  : `Versión en desarrollo: v${appVersion}`
              }
            >
              v{appVersion}
            </span>
          ) : null}

          <span
            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-xl bg-black/25 px-2.5 text-[9px] font-bold uppercase tracking-[0.16em] text-blue-100 ring-1 ring-white/10 sm:h-10 sm:px-3 sm:text-[10px]"
            title={isSupabaseConfigured() ? 'Conectado a Supabase' : 'Sin base remota'}
          >
            {isSupabaseConfigured() ? (
              <>
                <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_0_2px_rgba(52,211,153,0.35)]" aria-hidden />
                Supabase
              </>
            ) : (
              'Local'
            )}
          </span>

          {showSignOut ? (
            <button
              type="button"
              className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-white px-2.5 text-[12px] font-semibold text-section-navy shadow-md transition hover:bg-blue-50 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-section-navy sm:h-10 sm:gap-2 sm:px-4 sm:text-[13px]"
              onClick={() => {
                void signOut().catch(() => undefined)
              }}
              title="Cerrar sesión"
            >
              <IconLogOut className="h-[17px] w-[17px] shrink-0 sm:h-[18px] sm:w-[18px]" />
              Salir
            </button>
          ) : null}
        </div>
      </div>
    </header>
  )
}
