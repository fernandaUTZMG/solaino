import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import {
  type BodegaLogicalBucket,
  normalizeObjectKey,
  r2ObjectKey,
} from './bodegaStorageAuth.ts'
import { isR2Configured, r2HeadExists, r2PresignGet, readR2Config } from './r2S3.ts'

/**
 * URL firmada para leer un objeto de bodega (R2 si existe; si no, Supabase Storage).
 * Usado por la app y por parse-design-assembly (service role en Supabase fallback).
 */
export async function createBodegaDownloadSignedUrl(args: {
  supabaseAdmin: SupabaseClient
  logicalBucket: BodegaLogicalBucket
  path: string
  expiresSec?: number
}): Promise<{ url: string; provider: 'r2' | 'supabase' } | null> {
  const expiresSec = args.expiresSec ?? 3600
  const key = normalizeObjectKey(args.path)

  if (isR2Configured()) {
    const cfg = readR2Config()!
    const objectKey = r2ObjectKey(args.logicalBucket, key)
    const exists = await r2HeadExists(cfg, objectKey)
    if (exists) {
      const url = await r2PresignGet(cfg, objectKey, expiresSec)
      return { url, provider: 'r2' }
    }
  }

  const { data, error } = await args.supabaseAdmin.storage
    .from(args.logicalBucket)
    .createSignedUrl(key, expiresSec)
  if (error || !data?.signedUrl) return null
  return { url: data.signedUrl, provider: 'supabase' }
}

export async function getUserRole(userClient: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await userClient.from('profiles').select('role').eq('id', userId).maybeSingle()
  if (error || !data?.role) return null
  return String(data.role)
}
