import { isSupabaseConfigured } from '../env'
import { getSupabase } from './supabaseClient'

const DEFAULT_BUCKET = 'productos-fotos'
const MAX_BYTES = 8 * 1024 * 1024

function bucketId(): string {
  const v = import.meta.env.VITE_SUPABASE_STORAGE_BUCKET
  return typeof v === 'string' && v.trim() ? v.trim() : DEFAULT_BUCKET
}

function safeExt(file: File): string {
  const fromName = file.name.split('.').pop()?.toLowerCase()
  if (fromName && /^[a-z0-9]+$/.test(fromName) && fromName.length <= 8) return fromName
  const mime = file.type.split('/')[1]?.toLowerCase()
  if (mime === 'jpeg') return 'jpg'
  if (mime && /^[a-z0-9]+$/.test(mime) && mime.length <= 8) return mime
  return 'bin'
}

function contentTypeForImage(file: File, ext: string): string {
  if (file.type && file.type.startsWith('image/')) return file.type
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'png':
      return 'image/png'
    case 'gif':
      return 'image/gif'
    case 'webp':
      return 'image/webp'
    case 'svg':
      return 'image/svg+xml'
    default:
      return 'application/octet-stream'
  }
}

/**
 * Sube una imagen al bucket de Storage y devuelve la URL pública.
 * El bucket debe existir y ser público (o con lectura pública) para que la URL funcione en `<img>`.
 */
export async function uploadProductoImagen(file: File, folderId: string): Promise<string> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase no está configurado.')
  }
  if (!file.type.startsWith('image/')) {
    throw new Error('El archivo debe ser una imagen.')
  }
  if (file.size > MAX_BYTES) {
    throw new Error('La imagen no debe superar 8 MB.')
  }

  const ext = safeExt(file)
  const path = `${folderId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`
  const sb = getSupabase()
  const bucket = bucketId()
  const body = await file.arrayBuffer()
  const contentType = contentTypeForImage(file, ext)

  const { error } = await sb.storage.from(bucket).upload(path, body, {
    contentType,
    upsert: false,
  })
  if (error) throw error

  const { data } = sb.storage.from(bucket).getPublicUrl(path)
  return data.publicUrl
}
