import type { SupabaseClient } from '@supabase/supabase-js'
import { invokeBodegaR2Storage, isBodegaR2Enabled, type BodegaLogicalBucket } from './bodegaR2Storage'
import {
  formatStorageUploadError,
  isBodegaStorageSessionError,
  refreshSessionBeforeStorageUpload,
} from './bodegaStorageCommon'
import { getSupabase } from './supabaseClient'

export const BODEGA_PROYECTOS_BUCKET = 'bodega-proyectos'
export const BODEGA_ORDENES_BUCKET = 'bodega-ordenes-compra'

function toLogicalBucket(bucketId: string): BodegaLogicalBucket | null {
  if (bucketId === BODEGA_PROYECTOS_BUCKET || bucketId === BODEGA_ORDENES_BUCKET) return bucketId
  return null
}

/** Tamaño máximo por archivo cuando R2 está activo (5 GB). */
export const BODEGA_R2_MAX_FILE_BYTES = 5 * 1024 * 1024 * 1024

const R2_PUT_MAX_ATTEMPTS = 3

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function presignAndPutToR2(
  sb: SupabaseClient,
  logical: BodegaLogicalBucket,
  path: string,
  file: File,
  contentType: string,
): Promise<void> {
  let lastErr: unknown
  for (let attempt = 0; attempt < R2_PUT_MAX_ATTEMPTS; attempt++) {
    try {
      await refreshSessionBeforeStorageUpload(sb, { force: attempt > 0 })
      const { signedUrl } = await invokeBodegaR2Storage<{ signedUrl: string }>({
        action: 'presign_upload',
        bucket: logical,
        path,
        contentType,
        expiresSec: 7200,
      })
      const putRes = await fetch(signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: file,
      })
      if (putRes.ok) return
      const detail = await putRes.text().catch(() => '')
      const err = new Error(
        `No se pudo subir a R2 (${putRes.status}).${detail ? ` ${detail.slice(0, 200)}` : ''} Revisa CORS del bucket R2 (tu dominio de la app).`,
      )
      if (putRes.status >= 500 && attempt < R2_PUT_MAX_ATTEMPTS - 1) {
        lastErr = err
        await sleep(1500 * (attempt + 1))
        continue
      }
      throw err
    } catch (err) {
      lastErr = err
      if (isBodegaStorageSessionError(err) && attempt < R2_PUT_MAX_ATTEMPTS - 1) {
        await sleep(800)
        continue
      }
      throw err
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('No se pudo subir a R2.')
}

/**
 * Sube un archivo a R2 (PUT firmado) o a Supabase Storage si R2 no está activado.
 */
export async function uploadBodegaStorageObject(
  sb: SupabaseClient,
  bucketId: string,
  path: string,
  file: File,
  contentType: string,
): Promise<void> {
  const logical = toLogicalBucket(bucketId)
  if (isBodegaR2Enabled() && logical) {
    if (file.size > BODEGA_R2_MAX_FILE_BYTES) {
      throw new Error(
        `El archivo pesa ${(file.size / (1024 * 1024 * 1024)).toFixed(2)} GB y supera el máximo permitido (5 GB).`,
      )
    }
    await presignAndPutToR2(sb, logical, path, file, contentType)
    return
  }

  await refreshSessionBeforeStorageUpload(sb)
  const body = await file.arrayBuffer()
  const { error } = await sb.storage.from(bucketId).upload(path, body, {
    cacheControl: '3600',
    upsert: true,
    contentType,
  })
  if (error) throw new Error(formatStorageUploadError(error))
}

/**
 * URL firmada para descargar/ver. Con R2: intenta R2 y si no existe el objeto, Supabase (archivos antiguos).
 */
export async function createSignedUrlForBodegaStorage(
  bucketId: string,
  storagePath: string,
  expiresSec = 3600,
): Promise<string | null> {
  const logical = toLogicalBucket(bucketId)
  if (isBodegaR2Enabled() && logical) {
    try {
      const { signedUrl } = await invokeBodegaR2Storage<{ signedUrl: string }>({
        action: 'presign_download',
        bucket: logical,
        path: storagePath,
        expiresSec,
      })
      return signedUrl ?? null
    } catch {
      /* fallback abajo */
    }
  }

  const sb = getSupabase()
  const { data, error } = await sb.storage.from(bucketId).createSignedUrl(storagePath, expiresSec)
  if (error || !data?.signedUrl) return null
  return data.signedUrl
}

export async function moveBodegaStorageObject(
  bucketId: string,
  fromPath: string,
  toPath: string,
): Promise<void> {
  const logical = toLogicalBucket(bucketId)
  if (isBodegaR2Enabled() && logical) {
    await invokeBodegaR2Storage({ action: 'move', bucket: logical, path: fromPath, destinationPath: toPath })
    return
  }
  const sb = getSupabase()
  const { error } = await sb.storage.from(bucketId).move(fromPath, toPath)
  if (error) throw error
}
