import type { SupabaseClient } from '@supabase/supabase-js'
import { uploadBodegaStorageObject } from './bodegaObjectStorage'

export {
  assertBodegaProyectosStorageFileAllowed,
  assertBodegaProyectosStorageZipAllowed,
  BODEGA_SUPABASE_FREE_TIER_STORAGE_FILE_CAP_BYTES,
  formatStorageUploadError,
  refreshSessionBeforeStorageUpload,
} from './bodegaStorageCommon'

const IMAGE_FILENAME_EXT_RE = /\.(jpe?g|png|gif|webp|bmp|heic|heif|tif|tiff)$/i

export function isImageLikeFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true
  return IMAGE_FILENAME_EXT_RE.test(file.name)
}

export function guessImageContentType(file: File): string {
  if (file.type && file.type.startsWith('image/')) return file.type
  const n = file.name.toLowerCase()
  if (n.endsWith('.png')) return 'image/png'
  if (n.endsWith('.gif')) return 'image/gif'
  if (n.endsWith('.webp')) return 'image/webp'
  if (n.endsWith('.bmp')) return 'image/bmp'
  if (n.endsWith('.heic') || n.endsWith('.heif')) return 'image/heic'
  if (n.endsWith('.tif') || n.endsWith('.tiff')) return 'image/tiff'
  return 'image/jpeg'
}

/** Sube binario a R2 (si está activo) o Supabase Storage. */
export async function uploadBodegaProyectosBinary(
  sb: SupabaseClient,
  bucketId: string,
  path: string,
  file: File,
  contentType: string,
): Promise<void> {
  await uploadBodegaStorageObject(sb, bucketId, path, file, contentType)
}
