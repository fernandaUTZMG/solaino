import { useEffect, useMemo, useState } from 'react'
import { signInWithPassword, usernameToInternalEmail } from '../../lib/auth'
import { testSupabaseConnectivity } from '../../lib/supabaseConnectivity'
import {
  clearRememberedLogin,
  loadRememberedLogin,
  saveRememberedLogin,
} from '../../lib/loginRemember'
import { requestPasswordRecovery } from '../../lib/passwordRecoveryRepo'

/** Usuario en círculo (estilo apps actuales / Lucide circle-user). */
function FieldIconUser(props: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="10" r="3" />
      <path d="M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662" />
    </svg>
  )
}

function LoginBrandMark() {
  const [imgFailed, setImgFailed] = useState(false)

  if (imgFailed) {
    return (
      <div className="px-2 text-center leading-tight">
        <span className="block bg-gradient-to-b from-violet-600 to-section-navy bg-clip-text text-base font-bold tracking-tight text-transparent sm:text-lg">
          Solaino
        </span>
        <span className="mt-0.5 block text-[9px] font-semibold uppercase tracking-wide text-slate-500">
          Inventario
        </span>
      </div>
    )
  }

  return (
    <img
      src="/img/logo2.png"
      alt="Solaino — Soluciones integrales"
      className="max-h-11 w-auto max-w-[10rem] object-contain object-center sm:max-h-12 sm:max-w-[11rem]"
      onError={() => setImgFailed(true)}
    />
  )
}

/** Candado con ojo de cerradura (Lucide lock-keyhole). */
function FieldIconLock(props: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
      aria-hidden
    >
      <circle cx="12" cy="16" r="1" />
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

/** Ver contraseña (Lucide eye, trazo fino). */
function IconEye(props: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
      aria-hidden
    >
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

/** Ocultar contraseña (Lucide eye-off). */
function IconEyeOff(props: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
      aria-hidden
    >
      <path d="M10.733 5.076A10.744 10.744 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M14.121 14.121A3 3 0 1 1 9.88 9.88" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <path d="M2 2l20 20" />
    </svg>
  )
}

export function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recoveryBusy, setRecoveryBusy] = useState(false)
  const [recoveryMsg, setRecoveryMsg] = useState<string | null>(null)
  const [connBusy, setConnBusy] = useState(false)
  const [connMsg, setConnMsg] = useState<string | null>(null)
  const [connOk, setConnOk] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    void loadRememberedLogin().then((saved) => {
      if (cancelled || !saved) return
      setRemember(true)
      if (saved.username) setUsername(saved.username)
      if (saved.password) setPassword(saved.password)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const canSubmit = useMemo(
    () => username.trim().length >= 3 && password.length >= 6,
    [username, password],
  )

  function usernameForRecoveryHint(raw: string): string {
    const t = raw.trim().toLowerCase()
    if (!t) return ''
    const at = t.indexOf('@')
    if (at > 0) return t.slice(0, at)
    return t
  }

  async function onForgotPassword() {
    const hint = usernameForRecoveryHint(username)
    if (hint.length < 2) {
      setRecoveryMsg(null)
      setError('Escribe tu usuario (arriba) para que el administrador sepa quién solicita ayuda.')
      return
    }
    setRecoveryBusy(true)
    setRecoveryMsg(null)
    setError(null)
    try {
      await requestPasswordRecovery(hint)
      setRecoveryMsg('Listo: se le notificó al administrador tu petición.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar la solicitud')
    } finally {
      setRecoveryBusy(false)
    }
  }

  async function onTestConnection() {
    setConnBusy(true)
    setConnMsg(null)
    setConnOk(null)
    setError(null)
    try {
      const r = await testSupabaseConnectivity()
      setConnOk(r.ok)
      setConnMsg(r.detail ? `${r.message} (${r.detail})` : r.message)
    } catch (e) {
      setConnOk(false)
      setConnMsg(e instanceof Error ? e.message : 'No se pudo probar la conexión.')
    } finally {
      setConnBusy(false)
    }
  }

  async function onSubmit() {
    if (!canSubmit) return
    setError(null)
    setRecoveryMsg(null)
    setBusy(true)
    try {
      const input = username.trim()
      const email = input.includes('@') ? input.toLowerCase() : usernameToInternalEmail(input)
      await signInWithPassword(email, password)
      try {
        if (remember) {
          await saveRememberedLogin(input, password)
        } else {
          await clearRememberedLogin()
        }
      } catch {
        /* ignore */
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo iniciar sesión')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="font-ios relative min-h-screen w-full overflow-hidden bg-gradient-to-b from-slate-50 via-white to-slate-100 antialiased">
      <div
        className="pointer-events-none absolute -left-32 top-24 h-72 w-72 rounded-full bg-section-navy/[0.06] blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-24 bottom-40 h-64 w-64 rounded-full bg-sky-400/15 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-[-15%] bottom-0 h-[min(50vh,460px)] rounded-t-[55%] bg-gradient-to-t from-section-navy via-[#0a2852] to-[#0d3468] shadow-[0_-20px_60px_-14px_rgba(4,26,56,0.45)] sm:inset-x-[-10%] sm:rounded-t-[48%]"
        aria-hidden
      />

      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-10 sm:px-6">
        <div className="relative w-full max-w-md">
          <div className="absolute left-1/2 top-0 z-20 flex -translate-x-1/2 -translate-y-1/2">
            <div className="flex min-h-[5.5rem] min-w-[5.5rem] items-center justify-center rounded-full bg-gradient-to-br from-section-navy to-[#0c2f5c] px-2 shadow-xl shadow-section-navy/25 ring-[6px] ring-white/90 sm:min-h-24 sm:min-w-24 sm:px-2.5">
              <div className="flex max-w-[12.5rem] min-w-[4.5rem] items-center justify-center rounded-full bg-white px-3 py-2.5 shadow-inner sm:max-w-[13rem] sm:px-4 sm:py-3">
                <LoginBrandMark />
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200/60 bg-white/95 px-6 pb-8 pt-16 shadow-[0_25px_50px_-12px_rgba(15,23,42,0.12)] backdrop-blur-sm sm:px-8 sm:pb-10 sm:pt-[4.5rem]">
            <div className="text-center">
              <h1 className="text-[28px] font-semibold leading-[1.14] tracking-[-0.03em] text-slate-900 sm:text-[30px]">
                Iniciar sesión
              </h1>
            </div>

            {error ? (
              <div className="mt-4 rounded-2xl border border-rose-100 bg-rose-50/90 px-3.5 py-2.5 text-center text-[15px] leading-snug text-rose-800">
                {error}
              </div>
            ) : null}
            {recoveryMsg ? (
              <div className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50/90 px-3.5 py-2.5 text-center text-[15px] leading-snug text-emerald-900">
                {recoveryMsg}
              </div>
            ) : null}
            {connMsg ? (
              <div
                className={[
                  'mt-3 rounded-2xl border px-3.5 py-2.5 text-left text-[13px] leading-snug',
                  connOk
                    ? 'border-emerald-100 bg-emerald-50/90 text-emerald-900'
                    : 'border-amber-200 bg-amber-50/95 text-amber-950',
                ].join(' ')}
              >
                {connMsg}
              </div>
            ) : null}

            <div className="mt-7 space-y-5">
              <label className="block text-left">
                <span className="mb-2 block text-[13px] font-medium leading-normal text-slate-600">Usuario</span>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                    <FieldIconUser className="h-5 w-5" />
                  </span>
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="usuario o correo"
                    autoComplete="username"
                    spellCheck={false}
                    autoCapitalize="off"
                    className="w-full rounded-2xl border border-slate-200/80 bg-slate-50/80 py-3 pl-11 pr-3.5 text-[17px] leading-normal text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-section-navy/30 focus:bg-white focus:ring-4 focus:ring-section-navy/[0.12]"
                  />
                </div>
              </label>

              <label className="block text-left">
                <span className="mb-2 block text-[13px] font-medium leading-normal text-slate-600">Contraseña</span>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                    <FieldIconLock className="h-5 w-5" />
                  </span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void onSubmit()
                    }}
                    className="w-full rounded-2xl border border-slate-200/80 bg-slate-50/80 py-3 pl-11 pr-12 text-[17px] leading-normal text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-section-navy/30 focus:bg-white focus:ring-4 focus:ring-section-navy/[0.12]"
                  />
                  <button
                    type="button"
                    className="absolute right-1.5 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-section-navy/35 focus-visible:ring-offset-2 active:scale-95"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    title={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  >
                    {showPassword ? (
                      <IconEyeOff className="h-5 w-5" />
                    ) : (
                      <IconEye className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </label>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                <label className="inline-flex cursor-pointer select-none items-center gap-2.5 text-[17px] leading-normal text-slate-600">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => {
                      const checked = e.target.checked
                      setRemember(checked)
                      if (!checked) void clearRememberedLogin()
                    }}
                    className="h-4 w-4 rounded border-slate-300 accent-section-navy focus:ring-section-navy/40"
                  />
                  Recordarme
                </label>
                <button
                  type="button"
                  disabled={recoveryBusy}
                  className="text-[17px] font-normal leading-normal text-section-navy underline-offset-4 transition hover:text-[#0a2852] hover:underline disabled:opacity-50"
                  onClick={() => void onForgotPassword()}
                >
                  {recoveryBusy ? 'Enviando…' : '¿Olvidaste tu contraseña?'}
                </button>
              </div>

              <button
                type="button"
                disabled={!canSubmit || busy}
                className="w-full rounded-2xl bg-gradient-to-b from-section-navy to-[#05152e] py-3.5 text-[17px] font-semibold leading-normal tracking-wide text-white shadow-lg shadow-section-navy/25 transition hover:shadow-xl hover:brightness-[1.06] active:scale-[0.99] active:brightness-95 disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:shadow-lg"
                onClick={() => void onSubmit()}
              >
                {busy ? 'Entrando…' : 'Iniciar sesión'}
              </button>

              <button
                type="button"
                disabled={connBusy || busy}
                className="w-full rounded-2xl border border-slate-200 bg-white py-3 text-[15px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-55"
                onClick={() => void onTestConnection()}
              >
                {connBusy ? 'Probando conexión…' : 'Probar conexión con Supabase'}
              </button>
            </div>

            <p className="mt-7 text-center text-[13px] leading-relaxed text-slate-500">
              ¿Necesitas acceso?{' '}
              <span className="font-medium text-slate-600">Solicítalo con tu administrador.</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
