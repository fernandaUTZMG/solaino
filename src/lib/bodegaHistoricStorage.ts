import { BODEGA_PROYECTOS_BUCKET, createSignedUrlForBodegaStorage } from './bodegaObjectStorage'
import {
  assertBodegaStorageSession,
  BodegaStorageSessionError,
  isBodegaStorageSessionError,
  refreshSessionBeforeStorageUpload,
} from './bodegaStorageCommon'
import { uploadBodegaProyectosBinary } from './bodegaStorageUpload'
import { invokeBodegaR2Storage } from './bodegaR2Storage'
import { getSupabase } from './supabaseClient'
import type { BodegaHistoricoArea } from './bodegaHistoricTypes'
import {
  buildHistoricStoragePath,
  deleteHistoricFileRecord,
  registerHistoricFile,
} from './bodegaHistoricRepo'
import {
  buildHistoricStoragePathFromRelative,
  isIgnoredHistoricUploadFile,
} from './bodegaHistoricPath'

export type HistoricFolderUploadResult = {
  uploaded: number
  skipped: number
  failed: number
  /** La subida se detuvo antes de terminar (p. ej. sesión expirada). */
  stoppedReason?: string
}

function isHistoricPermissionError(err: unknown): boolean {
  const e = err as { code?: string; message?: string; status?: number } | null
  if (!e) return false
  if (e.status === 403 || e.code === '42501') return true
  const msg = String(e.message ?? err).toLowerCase()
  return (
    msg.includes('403') ||
    msg.includes('forbidden') ||
    msg.includes('permission denied') ||
    msg.includes('row-level security') ||
    msg.includes('sin permiso para registrar')
  )
}

function isStorageAuthError(err: unknown): boolean {
  if (isHistoricPermissionError(err) || isBodegaStorageSessionError(err)) return false
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase()
  return /401|unauthorized|jwt|expired|invalid_grant|no autorizado/.test(msg)
}

function rethrowIfSessionOrPermission(err: unknown): void {
  if (isHistoricPermissionError(err)) {
    throw new Error(historicPermissionErrorMessage())
  }
  if (isBodegaStorageSessionError(err)) {
    throw err
  }
}

function historicPermissionErrorMessage(): string {
  return `Sin permiso para registrar en histórico (403). Ejecuta en Supabase el SQL patch_bodega_historico_roles.sql (incluye política UPDATE para upsert) y recarga el esquema API.`
}

async function uploadHistoricFileOnce(args: {
  sb: ReturnType<typeof getSupabase>
  area: BodegaHistoricoArea
  file: File
  rel: string
}): Promise<void> {
  const storagePath = buildHistoricStoragePathFromRelative(args.area, args.rel)
  const contentType = args.file.type?.trim() || 'application/octet-stream'
  await uploadBodegaProyectosBinary(args.sb, BODEGA_PROYECTOS_BUCKET, storagePath, args.file, contentType)
  await registerHistoricFile({
    area: args.area,
    storagePath,
    displayName: args.file.name,
    fileSize: args.file.size,
    contentType,
    replaceIfExists: true,
  })
}

export async function uploadHistoricFolderFromBrowser(args: {
  area: BodegaHistoricoArea
  files: FileList | File[]
  onPhase?: (phase: string) => void
  signal?: AbortSignal
}): Promise<HistoricFolderUploadResult> {
  const phase = (p: string) => args.onPhase?.(p)
  const list = Array.from(args.files)
  const withPath = list
    .map((file) => {
      const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath?.trim()
      return { file, rel: rel || file.name }
    })
    .filter(({ file }) => !isIgnoredHistoricUploadFile(file.name))

  let uploaded = 0
  let skipped = 0
  let failed = 0
  let stoppedReason: string | undefined
  const total = withPath.length
  const sb = getSupabase()
  await assertBodegaStorageSession(sb)
  await refreshSessionBeforeStorageUpload(sb, { force: true })

  for (let i = 0; i < withPath.length; i++) {
    if (args.signal?.aborted) {
      stoppedReason = 'Subida cancelada.'
      break
    }
    const { file, rel } = withPath[i]!
    if (i > 0 && i % 15 === 0) {
      phase(`Renovando sesión… (${i + 1} / ${total})`)
      await assertBodegaStorageSession(sb)
      await refreshSessionBeforeStorageUpload(sb, { force: true })
    }
    phase(`Subiendo ${i + 1} / ${total}: ${rel}`)
    try {
      await assertBodegaStorageSession(sb)
      await uploadHistoricFileOnce({ sb, area: args.area, file, rel })
      uploaded++
    } catch (err) {
      if (isBodegaStorageSessionError(err)) {
        if (uploaded > 0) {
          stoppedReason = `${err.message} Ya se guardaron ${uploaded} archivo(s). Vuelve a iniciar sesión y sube la misma carpeta para completar los que faltan.`
          break
        }
        throw err
      }
      rethrowIfSessionOrPermission(err)
      if (isStorageAuthError(err)) {
        try {
          await assertBodegaStorageSession(sb)
          await refreshSessionBeforeStorageUpload(sb, { force: true })
          await uploadHistoricFileOnce({ sb, area: args.area, file, rel })
          uploaded++
          continue
        } catch (retryErr) {
          if (isBodegaStorageSessionError(retryErr) && uploaded > 0) {
            stoppedReason = `${retryErr.message} Ya se guardaron ${uploaded} archivo(s). Vuelve a iniciar sesión y sube la misma carpeta para completar los que faltan.`
            break
          }
          rethrowIfSessionOrPermission(retryErr)
          throw new BodegaStorageSessionError(
            'Sesión inválida durante la subida. Espera 1–2 minutos, inicia sesión de nuevo e intenta otra vez.',
          )
        }
      } else {
        failed++
      }
    }
  }

  skipped = list.length - withPath.length
  return { uploaded, skipped, failed, stoppedReason }
}

export async function uploadHistoricFile(args: {
  area: BodegaHistoricoArea
  file: File
  folio?: string | null
  notes?: string | null
  subfolder?: string | null
  onPhase?: (phase: string) => void
}): Promise<void> {
  const phase = (p: string) => args.onPhase?.(p)
  const path = buildHistoricStoragePath(args.area, args.file.name, args.subfolder)
  const contentType = args.file.type?.trim() || 'application/octet-stream'

  phase('Subiendo archivo…')
  const sb = getSupabase()
  await assertBodegaStorageSession(sb)
  await refreshSessionBeforeStorageUpload(sb)
  await uploadBodegaProyectosBinary(sb, BODEGA_PROYECTOS_BUCKET, path, args.file, contentType)

  phase('Registrando…')
  await registerHistoricFile({
    area: args.area,
    storagePath: path,
    displayName: args.file.name,
    folio: args.folio,
    notes: args.notes,
    fileSize: args.file.size,
    contentType,
  })
}

export async function downloadHistoricFile(storagePath: string): Promise<void> {
  const url = await createSignedUrlForBodegaStorage(BODEGA_PROYECTOS_BUCKET, storagePath)
  if (!url) throw new Error('No se pudo generar el enlace de descarga.')
  window.open(url, '_blank', 'noopener,noreferrer')
}

export async function deleteHistoricFile(storagePath: string, recordId: string): Promise<void> {
  try {
    await invokeBodegaR2Storage({ action: 'delete', bucket: 'bodega-proyectos', path: storagePath })
  } catch {
    const sb = getSupabase()
    await sb.storage.from(BODEGA_PROYECTOS_BUCKET).remove([storagePath])
  }
  await deleteHistoricFileRecord(recordId)
}

export function formatHistoricFileSize(bytes: number | null): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 1) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}
