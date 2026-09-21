import type { AppRole } from './roles'
import { supervisorSetProjectStatus } from './bodegaProjectStatus'
import {
  BODEGA_PROYECTOS_BUCKET,
  fetchNextDesignVersionNumber,
  insertDesignVersion,
  supersedeOlderPendingDesignVersions,
  type DesignPackageCategory,
  type ProjectDesignVersionRow,
} from './designVersionsRepo'
import { insertProjectActivity } from './projectActivityRepo'
import { analyzeDesignZip, type ZipDesignAnalysis } from './zipDesignPackage'
import { sanitizeStorageFileName } from './bodegaOrdenes'
import {
  assertBodegaProyectosStorageZipAllowed,
  uploadBodegaProyectosBinary,
} from './bodegaStorageUpload'
import { getSupabase } from './supabaseClient'
import { isXtDesignFile, parseXtFile } from './xtParasolidPieces'
import { notifyProgrammersDesignXtUploaded } from './notifyBodegaDesignXt'

/** Campos mínimos del proyecto para registrar una versión de diseño. */
export type BodegaDesignUploadProject = {
  id: string
  folio: string
  status: string
}

/**
 * Sube un ZIP de diseño (nueva versión), registra actividad y opcionalmente mueve el estado a «revisión diseño»
 * solo en fases tempranas de diseño (misma regla que en Bodega).
 */
export async function runDesignZipUpload(args: {
  project: BodegaDesignUploadProject
  file: File
  comment: string | null
  existingDesignVersions: Pick<ProjectDesignVersionRow, 'status' | 'version' | 'package_category'>[]
  uploaderRole: AppRole
  onPhase?: (phase: string) => void
  /** p. ej. `bodega_entregas` | `archivos_supervisor` (historial / depuración). */
  uploadOrigin?: string
  /** Referencia del supervisor (no es entrega formal ni pasa por revisión de diseño). */
  packageCategory?: DesignPackageCategory
  /** Evita re-analizar el ZIP en subidas masivas por OC. */
  precomputedAnalysis?: ZipDesignAnalysis
}): Promise<void> {
  const { project, file, comment, existingDesignVersions, uploaderRole, onPhase, uploadOrigin, packageCategory } = args
  const cat: DesignPackageCategory = packageCategory ?? 'entrega_diseno'
  const phase = (p: string) => {
    onPhase?.(p)
  }

  assertBodegaProyectosStorageZipAllowed(file)

  const asXt = isXtDesignFile(file)
  let analysis: ZipDesignAnalysis
  if (asXt) {
    phase('Leyendo ensamble .x_t…')
    const parsed = await parseXtFile(file)
    if (parsed.format !== 'text') {
      throw new Error(
        `El archivo es FORMAT=${parsed.format}. Solo se puede entregar Parasolid en texto (.x_t), no .x_b binario.`,
      )
    }
    if (parsed.pieces.length === 0) {
      throw new Error('No se detectaron piezas en el .x_t. Revisa que el ensamble sea FORMAT=text.')
    }
    analysis = {
      entryHtmlPath: null,
      manifest: {
        fileCount: 1,
        totalBytes: file.size,
        extensionCounts: { x_t: 1 },
        topLevelFolders: [],
        hasHtml: false,
        hasPdf: false,
        hasSolidworks: false,
        entryPaths: parsed.pieces.map((p) => p.name),
        kind: 'xt',
        assemblyKey: parsed.assemblyKey,
        exportedBy: parsed.exportedBy,
        pieceNames: parsed.pieces.map((p) => p.name),
      },
    }
  } else {
    phase('Analizando ZIP…')
    analysis = args.precomputedAnalysis ?? (await analyzeDesignZip(file))
  }

  phase('Preparando subida…')
  const nextV = await fetchNextDesignVersionNumber(project.id, cat)

  const sb = getSupabase()
  const ext = asXt ? (file.name.match(/\.x_t$/i) ? '.x_t' : '.xt') : '.zip'
  const safeName = sanitizeStorageFileName(file.name.replace(/\.(zip|x_t|xt)$/i, '') + ext)
  const folderSeg = cat === 'info_cliente' ? 'info_cliente' : 'diseno'
  const path = `${project.folio}/${folderSeg}/v${nextV}/${crypto.randomUUID()}-${safeName}`
  await uploadBodegaProyectosBinary(
    sb,
    BODEGA_PROYECTOS_BUCKET,
    path,
    file,
    asXt ? 'application/octet-stream' : 'application/zip',
  )

  phase('Guardando versión…')
  await registerDesignZipVersionForProject({
    project,
    analysis,
    storagePath: path,
    zipFilename: file.name,
    version: nextV,
    comment,
    packageCategory: cat,
    uploaderRole,
    uploadOrigin,
    existingDesignVersions,
  })
}

async function registerDesignZipVersionForProject(args: {
  project: BodegaDesignUploadProject
  analysis: ZipDesignAnalysis
  storagePath: string
  zipFilename: string
  version?: number
  comment: string | null
  packageCategory: DesignPackageCategory
  uploaderRole: AppRole
  uploadOrigin?: string
  existingDesignVersions: Pick<ProjectDesignVersionRow, 'status' | 'version' | 'package_category'>[]
}): Promise<void> {
  const { project, analysis, storagePath, zipFilename, comment, packageCategory: cat, uploaderRole, uploadOrigin, existingDesignVersions } =
    args
  const nextV = args.version ?? (await fetchNextDesignVersionNumber(project.id, cat))
  const rowStatus = cat === 'info_cliente' ? 'aprobada' : 'en_revision'
  await insertDesignVersion({
    projectId: project.id,
    version: nextV,
    packageCategory: cat,
    zipStoragePath: storagePath,
    zipFilename,
    status: rowStatus,
    entryHtmlPath: analysis.entryHtmlPath,
    manifest: analysis.manifest as unknown as Record<string, unknown>,
    comentarios: comment,
  })

  if (cat === 'entrega_diseno' && rowStatus === 'en_revision') {
    await supersedeOlderPendingDesignVersions(project.id, nextV)
  }

  const entregaRows = existingDesignVersions.filter(
    (x) => (x.package_category ?? 'entrega_diseno') === 'entrega_diseno',
  )
  const esCorreccion =
    cat === 'entrega_diseno' &&
    (project.status === 'modificacion_diseno' ||
      project.status === 'diseno_parcial' ||
      entregaRows.some((x) => x.status === 'requiere_cambios'))

  await insertProjectActivity({
    projectId: project.id,
    type: 'design_uploaded',
    payload: {
      version: nextV,
      zip: zipFilename,
      entry_html_path: analysis.entryHtmlPath,
      es_correccion: esCorreccion,
      uploader_role: uploaderRole,
      package_category: cat,
      comment: comment,
      ...(uploadOrigin ? { origen: uploadOrigin } : {}),
      ...(analysis.manifest.kind === 'xt'
        ? { kind: 'xt', piece_count: analysis.manifest.pieceNames?.length ?? analysis.manifest.entryPaths?.length ?? 0 }
        : {}),
    },
  })

  if (cat === 'entrega_diseno' && analysis.manifest.kind === 'xt') {
    await notifyProgrammersDesignXtUploaded({
      projectId: project.id,
      filename: zipFilename,
      pieceCount: analysis.manifest.pieceNames?.length ?? analysis.manifest.entryPaths?.length ?? 0,
    })
  }

  const st = project.status
  // Nueva entrega formal aunque el proyecto ya estuviera en diseno_aprobado / programación.
  const shouldMoveToRevisionDiseno =
    cat === 'entrega_diseno' &&
    st !== 'revision_diseno' &&
    st !== 'terminado' &&
    (st === 'pendiente' ||
      st === 'en_diseno' ||
      st === 'modificacion_diseno' ||
      st === 'diseno_parcial' ||
      st === 'diseno_aprobado' ||
      st === 'en_programacion' ||
      st === 'revision_programacion')

  if (shouldMoveToRevisionDiseno) {
    await supervisorSetProjectStatus({
      projectId: project.id,
      status: 'revision_diseno',
      comment: 'En revisión (entrega de diseño subida)',
    })
  }
}

export type OcDesignZipBulkUploadResult = {
  okFolios: string[]
  failed: { folio: string; error: string }[]
}

const OC_BULK_REGISTER_CONCURRENCY = 4

function ocSharedInfoClientePath(ocNumero: string, fileName: string): string {
  const oc = sanitizeStorageFileName(ocNumero.trim() || 'sin-oc')
  const safeName = sanitizeStorageFileName(fileName.replace(/\.zip$/i, '') + '.zip')
  return `${oc}/info_cliente/compartido/${crypto.randomUUID()}/${safeName}`
}

/** Mismo ZIP de referencia en todos los proyectos de una orden de compra (una subida a Storage). */
export async function runDesignZipUploadForOcProjects(args: {
  projects: BodegaDesignUploadProject[]
  ocNumero: string
  file: File
  comment: string | null
  uploaderRole: AppRole
  onPhase?: (phase: string) => void
  uploadOrigin?: string
  packageCategory?: DesignPackageCategory
  loadExistingVersions: (
    projectId: string,
  ) => Promise<Pick<ProjectDesignVersionRow, 'status' | 'version' | 'package_category'>[]>
}): Promise<OcDesignZipBulkUploadResult> {
  const list = args.projects.filter((p) => p.id && p.folio)
  if (list.length === 0) {
    throw new Error('No hay proyectos vinculados a esta orden de compra.')
  }
  const cat: DesignPackageCategory = args.packageCategory ?? 'info_cliente'
  assertBodegaProyectosStorageZipAllowed(args.file)
  args.onPhase?.('Analizando ZIP…')
  const analysis = await analyzeDesignZip(args.file)

  const sb = getSupabase()
  const sharedPath = ocSharedInfoClientePath(args.ocNumero, args.file.name)
  args.onPhase?.('Subiendo archivo (una sola vez)…')
  await uploadBodegaProyectosBinary(sb, BODEGA_PROYECTOS_BUCKET, sharedPath, args.file, 'application/zip')

  const okFolios: string[] = []
  const failed: { folio: string; error: string }[] = []
  const total = list.length

  for (let i = 0; i < list.length; i += OC_BULK_REGISTER_CONCURRENCY) {
    const chunk = list.slice(i, i + OC_BULK_REGISTER_CONCURRENCY)
    const from = i + 1
    const to = Math.min(i + chunk.length, total)
    args.onPhase?.(`Vinculando proyectos ${from}–${to} de ${total}…`)
    const settled = await Promise.allSettled(
      chunk.map(async (project) => {
        const existingDesignVersions = await args.loadExistingVersions(project.id)
        await registerDesignZipVersionForProject({
          project,
          analysis,
          storagePath: sharedPath,
          zipFilename: args.file.name,
          comment: args.comment,
          packageCategory: cat,
          uploaderRole: args.uploaderRole,
          uploadOrigin: args.uploadOrigin,
          existingDesignVersions,
        })
        return project.folio
      }),
    )
    for (let j = 0; j < settled.length; j++) {
      const project = chunk[j]!
      const r = settled[j]!
      if (r.status === 'fulfilled') okFolios.push(r.value)
      else {
        failed.push({
          folio: project.folio,
          error: r.reason instanceof Error ? r.reason.message : 'Error al vincular',
        })
      }
    }
  }

  if (okFolios.length === 0) {
    throw new Error(failed[0]?.error ?? 'No se pudo vincular a ningún proyecto.')
  }

  return { okFolios, failed }
}
