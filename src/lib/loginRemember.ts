export type RememberedLogin = {
  username: string
  password: string
}

const REMEMBER_KEY = 'solaino_login_remember'
const USERNAME_KEY = 'solaino_login_username'
const PASSWORD_KEY = 'solaino_login_password_b64'

export function isDesktopApp(): boolean {
  return typeof window !== 'undefined' && window.solainoDesktop?.isDesktop === true
}

function loadFromWebStorage(): RememberedLogin | null {
  try {
    if (localStorage.getItem(REMEMBER_KEY) !== '1') return null
    const username = localStorage.getItem(USERNAME_KEY) ?? ''
    const enc = localStorage.getItem(PASSWORD_KEY)
    const password = enc ? decodeURIComponent(escape(atob(enc))) : ''
    if (!username && !password) return null
    return { username, password }
  } catch {
    return null
  }
}

function saveToWebStorage(username: string, password: string): void {
  localStorage.setItem(REMEMBER_KEY, '1')
  localStorage.setItem(USERNAME_KEY, username)
  localStorage.setItem(PASSWORD_KEY, btoa(unescape(encodeURIComponent(password))))
}

function clearWebStorage(): void {
  localStorage.removeItem(REMEMBER_KEY)
  localStorage.removeItem(USERNAME_KEY)
  localStorage.removeItem(PASSWORD_KEY)
}

/** Carga usuario/contraseña guardados si «Recordarme» estaba activo. */
export async function loadRememberedLogin(): Promise<RememberedLogin | null> {
  if (isDesktopApp()) {
    try {
      const data = await window.solainoDesktop!.loginRemember.load()
      if (data?.username || data?.password) {
        return { username: data.username ?? '', password: data.password ?? '' }
      }
    } catch {
      /* fallback web */
    }
  }
  return loadFromWebStorage()
}

/** Guarda credenciales tras inicio de sesión exitoso. */
export async function saveRememberedLogin(username: string, password: string): Promise<void> {
  const trimmedUser = username.trim()
  if (isDesktopApp()) {
    try {
      await window.solainoDesktop!.loginRemember.save(trimmedUser, password)
      clearWebStorage()
      return
    } catch {
      /* fallback web */
    }
  }
  saveToWebStorage(trimmedUser, password)
}

/** Borra credenciales guardadas. */
export async function clearRememberedLogin(): Promise<void> {
  if (isDesktopApp()) {
    try {
      await window.solainoDesktop!.loginRemember.clear()
    } catch {
      /* ignore */
    }
  }
  clearWebStorage()
}
