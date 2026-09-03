import { getSupabase } from './supabaseClient'
import { BodegaStorageSessionError } from './bodegaStorageCommon'

export type BodegaLogicalBucket = 'bodega-proyectos' | 'bodega-ordenes-compra'

export type BodegaR2Action = 'presign_upload' | 'presign_download' | 'move' | 'delete'

type R2FnResponse = {
  signedUrl?: string
  provider?: 'r2' | 'supabase'
  error?: string
  hint?: string
}

export function isBodegaR2Enabled(): boolean {
  return import.meta.env.VITE_USE_R2_STORAGE === '1'
}

function formatR2InvokeError(error: unknown, data: R2FnResponse | null): string {
  const status =
    error && typeof error === 'object' && 'context' in error
      ? (error as { context?: { status?: number } }).context?.status
      : undefined
  const msg =
    (data?.error && String(data.error)) ||
    (error && typeof error === 'object' && 'message' in error && typeof (error as { message: unknown }).message === 'string'
      ? String((error as { message: string }).message)
      : '')
  if (status === 401 || msg.toLowerCase().includes('unauthorized') || msg.toLowerCase().includes('jwt')) {
    throw new BodegaStorageSessionError(
      'Sesión inválida o expirada al contactar R2. Vuelve a iniciar sesión e intenta de nuevo.',
    )
  }
  if (msg.includes('R2 no configurado') || msg.includes('503')) {
    return (
      'Cloudflare R2 no está configurado en Supabase. Crea el bucket en Cloudflare, añade los secrets R2_* en Edge Functions y despliega bodega-r2-storage. Ver supabase/R2_STORAGE_SETUP.md.'
    )
  }
  return msg || 'Error al contactar almacenamiento R2.'
}

export async function invokeBodegaR2Storage<T extends R2FnResponse>(body: {
  action: BodegaR2Action
  bucket: BodegaLogicalBucket
  path: string
  destinationPath?: string
  contentType?: string
  expiresSec?: number
}): Promise<T> {
  const sb = getSupabase()
  const { data, error } = await sb.functions.invoke<T>('bodega-r2-storage', { body })
  if (error) throw new Error(formatR2InvokeError(error, data as R2FnResponse | null))
  if (data && typeof data === 'object' && 'error' in data && data.error) {
    throw new Error(formatR2InvokeError(null, data as R2FnResponse))
  }
  return data as T
}
