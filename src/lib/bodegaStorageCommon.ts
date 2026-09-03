import type { SupabaseClient } from '@supabase/supabase-js'
import { isBodegaR2Enabled } from './bodegaR2Storage'

const SESSION_REFRESH_LEAD_SEC = 300

export class BodegaStorageSessionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BodegaStorageSessionError'
  }
}

export function isBodegaStorageSessionError(err: unknown): err is BodegaStorageSessionError {
  return err instanceof BodegaStorageSessionError
}

/** Falla si no hay sesión activa (p. ej. el usuario cerró sesión durante una subida larga). */
export async function assertBodegaStorageSession(sb: SupabaseClient): Promise<void> {
  const { data, error } = await sb.auth.getSession()
  if (error) {
    throw new BodegaStorageSessionError(
      'No se pudo validar la sesión. Vuelve a iniciar sesión e intenta la subida de nuevo.',
    )
  }
  if (!data.session?.access_token) {
    throw new BodegaStorageSessionError(
      'Sesión cerrada. Vuelve a iniciar sesión para continuar la subida.',
    )
  }
}

export async function refreshSessionBeforeStorageUpload(
  sb: SupabaseClient,
  options?: { force?: boolean },
): Promise<void> {
  const { data, error: sessionError } = await sb.auth.getSession()
  if (sessionError) {
    throw new BodegaStorageSessionError(
      'No se pudo validar la sesión. Vuelve a iniciar sesión e intenta la subida de nuevo.',
    )
  }
  const session = data.session
  if (!session?.access_token) {
    throw new BodegaStorageSessionError(
      'Sesión cerrada. Vuelve a iniciar sesión para continuar la subida.',
    )
  }

  const expiresAt = session.expires_at
  const nowSec = Math.floor(Date.now() / 1000)
  const secondsLeft = expiresAt != null ? expiresAt - nowSec : 0
  if (!options?.force && secondsLeft > SESSION_REFRESH_LEAD_SEC) {
    return
  }

  const { error } = await sb.auth.refreshSession()
  if (!error) return

  const msg = error.message.toLowerCase()
  if (
    msg.includes('session missing') ||
    msg.includes('invalid refresh token') ||
    msg.includes('refresh token not found')
  ) {
    throw new BodegaStorageSessionError(
      'Sesión expirada o cerrada. Vuelve a iniciar sesión e intenta la subida de nuevo.',
    )
  }
  if (msg.includes('rate limit') || msg.includes('too many requests')) {
    throw new BodegaStorageSessionError(
      'Demasiados intentos de renovar la sesión. Espera 1–2 minutos, inicia sesión de nuevo y reintenta la subida.',
    )
  }
  console.warn('[bodega storage] refreshSession:', error.message)
}
export function formatStorageUploadError(err: unknown): string {
  const msg =
    err instanceof Error
      ? err.message
      : err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string'
        ? String((err as { message: string }).message)
        : ''
  const httpStatus =
    err && typeof err === 'object' && typeof (err as { status?: unknown }).status === 'number'
      ? (err as { status: number }).status
      : NaN
  if (!msg && !Number.isFinite(httpStatus)) return 'No se pudo subir el archivo a Storage.'
  const m = msg.toLowerCase()
  if (m.includes('jwt') || m.includes('expired') || m.includes('invalid_grant'))
    return 'La sesión expiró mientras se procesaba el archivo. Vuelve a iniciar sesión e intenta de nuevo.'
  if (m.includes('duplicate') || m.includes('already exists'))
    return 'Ese archivo ya está en el servidor. Refresca el proyecto o sube otra versión.'
  const statusCodeStr =
    err && typeof err === 'object' && 'statusCode' in err ? String((err as { statusCode: unknown }).statusCode) : ''
  if (
    statusCodeStr === '413' ||
    httpStatus === 413 ||
    m.includes('413') ||
    m.includes('payload too large') ||
    m.includes('entity too large')
  )
    return 'El archivo supera el límite de tamaño permitido en Storage (en Supabase revisa límites del plan o reduce el ZIP).'
  if (m.includes('row-level security') || m.includes('policy') || m.includes('permission'))
    return (
      'Storage rechazó la subida por permisos. Programadora de maquinaria, encargado, diseñadora (solo diseño) o admin: confirma tu rol. ' +
      'Si subes tiempo de maquinado, ejecuta en Supabase supabase/patch_bodega_proyectos_storage_maquinado_paths.sql (rutas /maquinado/ y /programacion/).'
    )
  const looksLikeSizeRejection =
    m.includes('maximum') ||
    m.includes('max size') ||
    m.includes('file size') ||
    m.includes('too large') ||
    m.includes('limit exceeded') ||
    m.includes('exceeds')
  if (httpStatus === 400 || statusCodeStr === '400' || m === 'bad request') {
    const detail = msg ? ` Detalle: ${msg}` : ''
    const sizeHint =
      looksLikeSizeRejection || !detail
        ? ' En plan Free, Supabase no permite más de 50 MB por archivo (límite global en Storage → Settings). Opciones: comprimir el ZIP, activar R2 (VITE_USE_R2_STORAGE=1), o plan Pro.'
        : ' Suele deberse a: límite de tamaño del bucket o global, tipos MIME no permitidos para .zip, o sesión.'
    return 'Storage rechazó la petición (400).' + detail + sizeHint
  }
  return msg || 'No se pudo subir el archivo a Storage.'
}

/** Límite global típico en Supabase plan Free. */
export const BODEGA_SUPABASE_FREE_TIER_STORAGE_FILE_CAP_BYTES = 50 * 1024 * 1024

export function assertBodegaProyectosStorageFileAllowed(file: File): void {
  assertBodegaProyectosStorageZipAllowed(file)
}

export function assertBodegaProyectosStorageZipAllowed(file: File): void {
  if (isBodegaR2Enabled()) return

  const skipFreeCap = import.meta.env.VITE_BODEGA_SKIP_UPLOAD_SIZE_CAP === '1'
  const customMaxMb = String(import.meta.env.VITE_BODEGA_MAX_STORAGE_UPLOAD_MB ?? '').trim()
  const customMaxBytes =
    customMaxMb && Number.isFinite(Number(customMaxMb)) && Number(customMaxMb) > 0
      ? Number(customMaxMb) * 1024 * 1024
      : null

  if (customMaxBytes != null && file.size > customMaxBytes) {
    throw new Error(
      `El ZIP pesa ${(file.size / (1024 * 1024)).toFixed(1)} MB y supera el máximo configurado (${customMaxMb} MB). Ajusta VITE_BODEGA_MAX_STORAGE_UPLOAD_MB o reduce el archivo.`,
    )
  }
  if (!skipFreeCap && file.size > BODEGA_SUPABASE_FREE_TIER_STORAGE_FILE_CAP_BYTES) {
    throw new Error(
      `El ZIP pesa ${(file.size / (1024 * 1024)).toFixed(1)} MB. En Supabase plan Free el límite es 50 MB por archivo. Activa Cloudflare R2 (VITE_USE_R2_STORAGE=1) o comprime el paquete.`,
    )
  }
}
