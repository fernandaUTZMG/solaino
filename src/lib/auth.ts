import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { getSupabase } from './supabaseClient'
import { isAppRole, type AppRole } from './roles'

const INTERNAL_EMAIL_DOMAIN = 'solaino.local'

export function usernameToInternalEmail(username: string): string {
  const u = username.trim().toLowerCase()
  if (!u) return ''
  return `${u}@${INTERNAL_EMAIL_DOMAIN}`
}

export function useSession() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const sb = useMemo(() => getSupabase(), [])

  useEffect(() => {
    let mounted = true
    void sb.auth.getSession().then(({ data, error }) => {
      if (!mounted) return
      if (error) {
        setSession(null)
      } else {
        setSession(data.session ?? null)
      }
      setLoading(false)
    })
    const { data } = sb.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setLoading(false)
    })
    return () => {
      mounted = false
      data.subscription.unsubscribe()
    }
  }, [sb])

  return { session, loading }
}

export type MyProfile = {
  username: string | null
  email: string | null
  role: AppRole
}

function localPartFromEmail(email: string | null | undefined): string | null {
  if (!email || !email.includes('@')) return email?.trim() || null
  return email.split('@')[0]?.trim() || null
}

function profileFromRow(
  data: { username?: string | null; email?: string | null; role?: unknown },
  sessionEmail: string | null,
  fallbackUsername: string | null,
): MyProfile {
  const rawRole = data.role
  const role: AppRole = isAppRole(rawRole) ? rawRole : 'user'
  return {
    username: data.username?.trim() || fallbackUsername,
    email: data.email ?? sessionEmail,
    role,
  }
}

export async function fetchMyProfile(): Promise<MyProfile | null> {
  const sb = getSupabase()
  const { data: auth } = await sb.auth.getUser()
  const user = auth.user
  const userId = user?.id
  if (!userId) return null

  const sessionEmail = user.email ?? null
  const fallbackUsername = localPartFromEmail(sessionEmail)

  const { data, error } = await sb
    .from('profiles')
    .select('username, email, role')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    return {
      username: fallbackUsername,
      email: sessionEmail,
      role: 'user',
    }
  }

  if (!data) {
    return {
      username: fallbackUsername,
      email: sessionEmail,
      role: 'user',
    }
  }

  return profileFromRow(data as { username?: string | null; email?: string | null; role?: unknown }, sessionEmail, fallbackUsername)
}

/** Carga de perfil al iniciar sesión: no asume rol «user» si falla la consulta. */
export async function loadSessionProfile(): Promise<
  { ok: true; profile: MyProfile } | { ok: false; message: string }
> {
  const sb = getSupabase()
  const { data: auth, error: authErr } = await sb.auth.getUser()
  if (authErr) {
    return { ok: false, message: authErr.message || 'No se pudo verificar la sesión.' }
  }
  const user = auth.user
  const userId = user?.id
  if (!userId) {
    return { ok: false, message: 'Sesión inválida. Cierra sesión e intenta de nuevo.' }
  }

  const sessionEmail = user.email ?? null
  const fallbackUsername = localPartFromEmail(sessionEmail)

  const { data, error } = await sb
    .from('profiles')
    .select('username, email, role')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    return {
      ok: false,
      message: `No se pudo cargar tu perfil (${error.message}). Revisa la conexión a internet o pide al administrador revisar permisos en Supabase.`,
    }
  }

  if (!data) {
    return {
      ok: false,
      message:
        'Tu cuenta no tiene perfil en el sistema. Pide al administrador que abra Usuarios, busque tu cuenta y asigne el rol «Programadora maquinaria (Bodega)».',
    }
  }

  const profile = profileFromRow(
    data as { username?: string | null; email?: string | null; role?: unknown },
    sessionEmail,
    fallbackUsername,
  )

  if (profile.role === 'user' && !isAppRole((data as { role?: unknown }).role)) {
    return {
      ok: false,
      message:
        'Tu cuenta tiene un rol no reconocido en el sistema. Pide al administrador que revise tu usuario en Usuarios.',
    }
  }

  return { ok: true, profile }
}

export async function fetchMyRole(): Promise<AppRole> {
  const p = await fetchMyProfile()
  return p?.role ?? 'user'
}

const INVALID_LOGIN_PHRASES = ['invalid login credentials', 'invalid credentials', 'invalid email or password']

function isInvalidLoginError(message: string, code?: string): boolean {
  const c = (code ?? '').toLowerCase()
  if (c === 'invalid_credentials') return true
  const m = message.trim().toLowerCase()
  return INVALID_LOGIN_PHRASES.some((p) => m.includes(p))
}

export async function signInWithPassword(email: string, password: string) {
  const sb = getSupabase()
  const e = email.trim()
  let error: { message?: string; code?: string } | null = null
  try {
    ;({ error } = await sb.auth.signInWithPassword({ email: e, password }))
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(humanizeProfileLoadError(msg))
  }
  if (error) {
    const base = humanizeProfileLoadError(error.message || 'No se pudo iniciar sesión.')
    const code = error.code
    if (code === 'email_not_confirmed') {
      throw new Error(
        'Tu cuenta no tiene el correo confirmado en Auth. Pide al administrador que pulse otra vez «Establecer contraseña» en usuarios (o ejecute la reparación de identidades en Supabase).',
      )
    }
    if (code === 'user_banned') {
      throw new Error('Esta cuenta está inhabilitada.')
    }
    if (isInvalidLoginError(base, code)) {
      const codeHint = code ? ` (${code})` : ''
      throw new Error(`Usuario o contraseña incorrectos. Verifícalo con el administrador.${codeHint}`)
    }
    throw new Error(base)
  }
}

const SIGN_OUT_REMOTE_MS = 4_000

export type SignOutOptions = {
  /** Cierra sesión solo en esta PC sin llamar al servidor (útil sin internet / firewall). */
  localOnly?: boolean
}

export async function signOut(options?: SignOutOptions) {
  const sb = getSupabase()
  if (options?.localOnly) {
    const { error: localErr } = await sb.auth.signOut({ scope: 'local' })
    if (localErr) throw localErr
    return
  }

  const remote = sb.auth.signOut()
  const { error } = await Promise.race([
    remote,
    new Promise<{ error: Error }>((resolve) => {
      setTimeout(() => resolve({ error: new Error('timeout') }), SIGN_OUT_REMOTE_MS)
    }),
  ])

  if (error) {
    const { error: localErr } = await sb.auth.signOut({ scope: 'local' })
    if (localErr) throw localErr
  }
}

/** Mensaje más claro cuando la red bloquea Supabase (firewall, proxy, sin internet). */
export function humanizeProfileLoadError(message: string): string {
  const m = message.trim()
  if (/failed to fetch|load failed|networkerror|network error|timeout/i.test(m)) {
    return 'No hay conexión con el servidor (Failed to fetch). Suele ser firewall, antivirus o red de la planta bloqueando Supabase. Prueba abrir la URL del proyecto en el navegador de esta PC o pide a TI que permita salida HTTPS a *.supabase.co.'
  }
  return m
}

