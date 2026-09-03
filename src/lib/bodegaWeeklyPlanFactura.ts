import { BODEGA_PROYECTOS_BUCKET, createSignedUrlForBodegaStorage } from './bodegaObjectStorage'
import { sanitizeStorageFileName } from './bodegaOrdenes'
import {
  assertBodegaProyectosStorageFileAllowed,
  refreshSessionBeforeStorageUpload,
  uploadBodegaProyectosBinary,
} from './bodegaStorageUpload'
import { getSupabase } from './supabaseClient'
import { updateWeeklyPlanItem } from './bodegaWeeklyPlanRepo'

export const BODEGA_WEEKLY_PLAN_FACTURA_PATCH = 'supabase/patch_bodega_weekly_plan_factura_archivo.sql'

const FACTURA_ACCEPT = '.pdf,.xml,.png,.jpg,.jpeg,.webp,.gif,application/pdf,image/*,text/xml,application/xml'

export function weeklyPlanFacturaAcceptAttr(): string {
  return FACTURA_ACCEPT
}

export function weeklyPlanFacturaStoragePath(itemId: string, fileName: string): string {
  const safe = sanitizeStorageFileName(fileName)
  return `plan-trabajo/facturas/${itemId}/${crypto.randomUUID()}-${safe}`
}

function guessFacturaContentType(file: File): string {
  if (file.type && file.type !== 'application/octet-stream') return file.type
  const n = file.name.toLowerCase()
  if (n.endsWith('.pdf')) return 'application/pdf'
  if (n.endsWith('.xml')) return 'application/xml'
  if (n.endsWith('.png')) return 'image/png'
  if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg'
  if (n.endsWith('.webp')) return 'image/webp'
  return 'application/octet-stream'
}

/** Número sugerido desde nombre de archivo (sin extensión). */
export function facturaNumeroFromFilename(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '').trim()
  return base.slice(0, 80)
}

export async function uploadWeeklyPlanFacturaFile(
  itemId: string,
  file: File,
): Promise<{ storagePath: string; displayName: string }> {
  assertBodegaProyectosStorageFileAllowed(file)
  const sb = getSupabase()
  await refreshSessionBeforeStorageUpload(sb)
  const storagePath = weeklyPlanFacturaStoragePath(itemId, file.name)
  await uploadBodegaProyectosBinary(sb, BODEGA_PROYECTOS_BUCKET, storagePath, file, guessFacturaContentType(file))
  return { storagePath, displayName: file.name }
}

export async function saveWeeklyPlanFacturaAttachment(
  itemId: string,
  args: {
    storagePath: string
    displayName: string
    facturaNumero?: string
  },
): Promise<void> {
  const patch: Record<string, string> = {
    factura_archivo_path: args.storagePath,
    factura_archivo_nombre: args.displayName,
  }
  if (args.facturaNumero !== undefined) {
    patch.factura = args.facturaNumero
  }
  await updateWeeklyPlanItem(itemId, patch)
}

export async function clearWeeklyPlanFacturaAttachment(itemId: string): Promise<void> {
  await updateWeeklyPlanItem(itemId, {
    factura_archivo_path: null,
    factura_archivo_nombre: null,
  })
}

export async function downloadWeeklyPlanFacturaFile(storagePath: string, displayName: string): Promise<void> {
  const url = await createSignedUrlForBodegaStorage(BODEGA_PROYECTOS_BUCKET, storagePath, 3600)
  if (!url) throw new Error('No se pudo generar enlace de descarga.')
  const a = document.createElement('a')
  a.href = url
  a.download = displayName || 'factura'
  a.target = '_blank'
  a.rel = 'noopener noreferrer'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export function isWeeklyPlanFacturaArchivoColumnError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '')
  return /factura_archivo/i.test(msg) && (/column/i.test(msg) || /schema cache/i.test(msg))
}
