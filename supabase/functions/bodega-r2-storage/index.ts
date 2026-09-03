/**
 * URLs firmadas para Cloudflare R2 (archivos grandes de Bodega).
 *
 * Secrets (Dashboard → Edge Functions):
 * - R2_ACCOUNT_ID, R2_BUCKET_NAME, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
 * - R2_STORAGE_ENABLED=1 (opcional; 0 desactiva R2)
 *
 * Despliegue: supabase functions deploy bodega-r2-storage
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import {
  type BodegaLogicalBucket,
  canBodegaStorageDelete,
  canBodegaStorageMove,
  canBodegaStorageReadPath,
  canBodegaStorageUpload,
  normalizeObjectKey,
  r2ObjectKey,
} from '../_shared/bodegaStorageAuth.ts'
import { createBodegaDownloadSignedUrl, getUserRole } from '../_shared/bodegaSignedUrl.ts'
import {
  isR2Configured,
  r2MoveObject,
  r2PresignPut,
  r2DeleteObject,
  readR2Config,
} from '../_shared/r2S3.ts'

type Action = 'presign_upload' | 'presign_download' | 'move' | 'delete'

type RequestBody = {
  action?: Action
  bucket?: string
  path?: string
  destinationPath?: string
  contentType?: string
  expiresSec?: number
}

function parseLogicalBucket(raw: string | undefined): BodegaLogicalBucket | null {
  if (raw === 'bodega-proyectos' || raw === 'bodega-ordenes-compra') return raw
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  if (!isR2Configured()) {
    return jsonResponse(
      {
        error: 'R2 no configurado',
        hint: 'Define R2_ACCOUNT_ID, R2_BUCKET_NAME, R2_ACCESS_KEY_ID y R2_SECRET_ACCESS_KEY en Edge Functions → Secrets.',
      },
      503,
    )
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return jsonResponse({ error: 'Faltan variables Supabase en la función' }, 500)
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) {
    return jsonResponse({ error: 'Sin autorización' }, 401)
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser()
  if (userErr || !user) return jsonResponse({ error: 'No autorizado' }, 401)

  const role = await getUserRole(userClient, user.id)
  if (!role) return jsonResponse({ error: 'Perfil sin rol' }, 403)

  let body: RequestBody
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'JSON inválido' }, 400)
  }

  const action = body.action
  const logicalBucket = parseLogicalBucket(body.bucket?.trim())
  if (!action || !logicalBucket) {
    return jsonResponse({ error: 'action y bucket requeridos' }, 400)
  }

  const path = normalizeObjectKey(body.path ?? '')
  if (!path) return jsonResponse({ error: 'path requerido' }, 400)

  const cfg = readR2Config()!
  const objectKey = r2ObjectKey(logicalBucket, path)
  const expiresSec = Math.min(Math.max(body.expiresSec ?? 3600, 60), 86400)

  const admin = createClient(supabaseUrl, serviceKey)

  if (action === 'presign_download') {
    if (!canBodegaStorageReadPath(role, logicalBucket, path)) {
      return jsonResponse({ error: 'Sin permiso de lectura' }, 403)
    }
    const signed = await createBodegaDownloadSignedUrl({
      supabaseAdmin: admin,
      logicalBucket,
      path,
      expiresSec,
    })
    if (!signed) return jsonResponse({ error: 'Archivo no encontrado' }, 404)
    return jsonResponse({
      signedUrl: signed.url,
      provider: signed.provider,
      expiresSec,
    })
  }

  if (action === 'presign_upload') {
    if (!canBodegaStorageUpload(role, logicalBucket, path)) {
      return jsonResponse({ error: 'Sin permiso de subida' }, 403)
    }
    const contentType = (body.contentType ?? 'application/octet-stream').trim() || 'application/octet-stream'
    const signedUrl = await r2PresignPut(cfg, objectKey, expiresSec, contentType)
    return jsonResponse({ signedUrl, provider: 'r2', expiresSec, path })
  }

  if (action === 'move') {
    if (!canBodegaStorageMove(role)) return jsonResponse({ error: 'Sin permiso para mover' }, 403)
    const destPath = normalizeObjectKey(body.destinationPath ?? '')
    if (!destPath) return jsonResponse({ error: 'destinationPath requerido' }, 400)
    const destKey = r2ObjectKey(logicalBucket, destPath)
    await r2MoveObject(cfg, objectKey, destKey)
    return jsonResponse({ ok: true, from: path, to: destPath })
  }

  if (action === 'delete') {
    if (!canBodegaStorageDelete(role, path)) return jsonResponse({ error: 'Sin permiso para borrar' }, 403)
    await r2DeleteObject(cfg, objectKey)
    return jsonResponse({ ok: true })
  }

  return jsonResponse({ error: 'action no válida' }, 400)
})
