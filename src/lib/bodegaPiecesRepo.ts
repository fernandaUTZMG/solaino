import type { PieceDesignStatus } from './bodegaDesignPieceReview'
import { closeAllOpenPieceIntervals } from './bodegaPieceIntervalsRepo'
import { getSupabase } from './supabaseClient'
import {
  BODEGA_POST_MAQUINADO_ROUTE_PATCH,
  bodegaPiecesSupportsAssemblyXtPath,
  bodegaPiecesSupportsPostMaquinadoRoute,
  pieceInsertMissingColumnMessage,
} from './bodegaPiecesSchema'
import {
  pieceAwaitingPostPerfiladoProgramming,
  piecePerfiladoGoesDirectToDetallado,
} from './bodegaPostPerfiladoProgramming'
import {
  findMatchingPdfPathForPart,
  isRedundantPairedPdfPiece,
  orphanPerfiladoPdfPaths,
} from './designZipPiecePairs'
import { archiveAccesorioFromDesignZip } from './bodegaAccesorioArchive'
import { designZipEntriesMatch, displayLabelFromDesignPath } from './designZipScope'
import { isCadLikeZipPath, isPerfiladoPdfZipPath, isSwPartZipPath } from './zipDesignPackage'
import { parseHmsToSeconds } from './maquinadoEstimatedTime'

export type ProgrammerBucket = 'cnc' | 'torno' | 'perfilado' | 'accesorios'

export const PROGRAMMER_ASSIGNMENT_BUCKETS: ProgrammerBucket[] = [
  'cnc',
  'torno',
  'perfilado',
  'accesorios',
]

export function isProgrammerAssignmentBucket(
  bucket: ProgrammerBucket | null | undefined,
): bucket is ProgrammerBucket {
  return bucket != null && PROGRAMMER_ASSIGNMENT_BUCKETS.includes(bucket)
}

export type PieceFinishSpec = 'anodizado' | 'pavonado' | 'otro' | 'sin_tratamiento'

export const PIECE_FINISH_SPEC_LABELS: Record<PieceFinishSpec, string> = {
  anodizado: 'Anodizado',
  pavonado: 'Pavonado',
  otro: 'Otro',
  sin_tratamiento: 'Sin tratamiento',
}

export type ProgrammingExitKind = 'archivo_adjunto' | 'a_perfilado'

export type PostMaquinadoRoute = 'armado' | 'detallado'

export type BodegaProjectPieceRow = {
  id: string
  project_id: string
  label: string
  source_path: string | null
  assembly_xt_path: string | null
  sort_order: number
  programmer_bucket: ProgrammerBucket | null
  finish_spec: PieceFinishSpec | null
  programming_finished_at: string | null
  programming_exit_kind: ProgrammingExitKind | null
  programming_file_storage_path: string | null
  programming_file_name: string | null
  programming_file_uploaded_at: string | null
  post_maquinado_route: PostMaquinadoRoute | null
  supervisor_design_feedback: string | null
  design_status: PieceDesignStatus | null
  design_approved_at: string | null
  design_approved_from_version: number | null
  design_correction_round: number
  perfilado_completed_at: string | null
  maquinado_completed_at: string | null
  armado_completed_at: string | null
  detallado_completed_at: string | null
  design_drawing_storage_path: string | null
  design_drawing_name: string | null
  design_drawing_uploaded_at: string | null
  post_perfilado_programming_bucket: ProgrammerBucket | null
  maquinado_estimated_seconds: number | null
  maquinado_estimated_label: string | null
  maquinado_time_sheet_storage_path: string | null
  maquinado_time_sheet_name: string | null
  maquinado_time_sheet_uploaded_at: string | null
  maquinado_time_variance_notes: string | null
  maquinado_real_seconds: number | null
  maquinado_real_label: string | null
  maquinado_real_sheet_storage_path: string | null
  maquinado_real_sheet_name: string | null
  maquinado_real_sheet_uploaded_at: string | null
  accesorio_storage_path: string | null
  accesorio_storage_name: string | null
  accesorio_archived_at: string | null
  created_at: string
  updated_at: string
}

export const BODEGA_PROGRAMMER_BUCKET_ACCESORIOS_PATCH =
  'supabase/patch_programmer_bucket_accesorios.sql'

function programmerBucketConstraintError(err: unknown): Error | null {
  if (!err || typeof err !== 'object') return null
  const e = err as { message?: string; details?: string; code?: string }
  const msg = [e.message, e.details, e.code].filter(Boolean).join(' ')
  if (/programmer_bucket|check constraint|23514|violates check/i.test(msg)) {
    return new Error(
      `No se guardó el destino. Ejecuta ${BODEGA_PROGRAMMER_BUCKET_ACCESORIOS_PATCH} en el SQL Editor de Supabase y recarga el esquema API (Settings → API → Reload schema).`,
    )
  }
  return null
}

function accesorioArchiveColumnError(err: unknown): Error | null {
  if (!err || typeof err !== 'object') return null
  const e = err as { message?: string; details?: string; code?: string }
  const msg = [e.message, e.details, e.code].filter(Boolean).join(' ')
  if (/accesorio_storage|accesorio_archived|PGRST204|42703|schema cache|Could not find/i.test(msg)) {
    return new Error(
      `Faltan columnas de accesorios en la nube. Ejecuta ${BODEGA_PROGRAMMER_BUCKET_ACCESORIOS_PATCH} en Supabase y recarga el esquema API.`,
    )
  }
  return null
}

export type ProjectSnippetForPiece = {
  folio: string
  nombre: string
  status: string
  programming_routes_confirmed_at: string | null
}

export type BodegaProjectPieceWithProject = BodegaProjectPieceRow & {
  bodega_projects: ProjectSnippetForPiece | null
}

function normalizePieceRow(r: Record<string, unknown>): BodegaProjectPieceRow {
  const row = r as BodegaProjectPieceRow
  return {
    ...row,
    perfilado_completed_at: row.perfilado_completed_at ?? null,
    maquinado_completed_at: row.maquinado_completed_at ?? null,
    armado_completed_at: row.armado_completed_at ?? null,
    detallado_completed_at: row.detallado_completed_at ?? null,
    assembly_xt_path: row.assembly_xt_path ?? null,
    programming_file_storage_path: row.programming_file_storage_path ?? null,
    programming_file_name: row.programming_file_name ?? null,
    programming_file_uploaded_at: row.programming_file_uploaded_at ?? null,
    post_maquinado_route: (row.post_maquinado_route as PostMaquinadoRoute | null) ?? null,
    design_status:
      row.design_status === 'en_revision' ||
      row.design_status === 'aprobada' ||
      row.design_status === 'requiere_cambios'
        ? row.design_status
        : null,
    design_approved_at: (row.design_approved_at as string | null) ?? null,
    design_approved_from_version:
      typeof row.design_approved_from_version === 'number' ? row.design_approved_from_version : null,
    design_correction_round:
      typeof row.design_correction_round === 'number' && Number.isFinite(row.design_correction_round)
        ? row.design_correction_round
        : 0,
    design_drawing_storage_path: row.design_drawing_storage_path ?? null,
    design_drawing_name: row.design_drawing_name ?? null,
    design_drawing_uploaded_at: row.design_drawing_uploaded_at ?? null,
    post_perfilado_programming_bucket:
      row.post_perfilado_programming_bucket === 'cnc' || row.post_perfilado_programming_bucket === 'torno'
        ? row.post_perfilado_programming_bucket
        : null,
    maquinado_estimated_seconds:
      typeof row.maquinado_estimated_seconds === 'number' ? row.maquinado_estimated_seconds : null,
    maquinado_estimated_label: (row.maquinado_estimated_label as string | null) ?? null,
    maquinado_time_sheet_storage_path: (row.maquinado_time_sheet_storage_path as string | null) ?? null,
    maquinado_time_sheet_name: (row.maquinado_time_sheet_name as string | null) ?? null,
    maquinado_time_sheet_uploaded_at: (row.maquinado_time_sheet_uploaded_at as string | null) ?? null,
    maquinado_time_variance_notes: (row.maquinado_time_variance_notes as string | null) ?? null,
    maquinado_real_seconds:
      typeof row.maquinado_real_seconds === 'number' ? row.maquinado_real_seconds : null,
    maquinado_real_label: (row.maquinado_real_label as string | null) ?? null,
    maquinado_real_sheet_storage_path: (row.maquinado_real_sheet_storage_path as string | null) ?? null,
    maquinado_real_sheet_name: (row.maquinado_real_sheet_name as string | null) ?? null,
    maquinado_real_sheet_uploaded_at: (row.maquinado_real_sheet_uploaded_at as string | null) ?? null,
    accesorio_storage_path: (row.accesorio_storage_path as string | null) ?? null,
    accesorio_storage_name: (row.accesorio_storage_name as string | null) ?? null,
    accesorio_archived_at: (row.accesorio_archived_at as string | null) ?? null,
  }
}

function mergePerfiladoQueueRows(
  fromProgramming: Record<string, unknown>[] | null,
  fromAssignment: Record<string, unknown>[] | null,
): BodegaProjectPieceWithProject[] {
  const byId = new Map<string, BodegaProjectPieceWithProject>()
  for (const row of [...(fromProgramming ?? []), ...(fromAssignment ?? [])]) {
    const id = String(row.id)
    if (byId.has(id)) continue
    const proj = row.bodega_projects as ProjectSnippetForPiece | null
    if (row.programmer_bucket === 'perfilado' && !proj?.programming_routes_confirmed_at) continue
    byId.set(id, {
      ...normalizePieceRow(row),
      bodega_projects: proj,
    })
  }
  return [...byId.values()]
}

/** Piezas en cola de taller perfilado: CNC/Torno «Terminar → Perfilado» o asignación columna Perfilado. */
export async function fetchPiecesQueuePerfilado(): Promise<BodegaProjectPieceWithProject[]> {
  const sb = getSupabase()
  const sel = '*, bodega_projects(folio, nombre, status, programming_routes_confirmed_at)'

  const { data: fromProgramming, error: e1 } = await sb
    .from('bodega_project_pieces')
    .select(sel)
    .eq('programming_exit_kind', 'a_perfilado')
    .not('programming_finished_at', 'is', null)
    .is('perfilado_completed_at', null)

  const { data: fromAssignment, error: e2 } = await sb
    .from('bodega_project_pieces')
    .select(sel)
    .eq('programmer_bucket', 'perfilado')
    .is('perfilado_completed_at', null)

  if (e1 && !/does not exist|PGRST205/i.test([e1.message, e1.details].join(' '))) throw e1
  if (e2 && !/does not exist|PGRST205/i.test([e2.message, e2.details].join(' '))) throw e2

  return mergePerfiladoQueueRows(
    fromProgramming as Record<string, unknown>[] | null,
    fromAssignment as Record<string, unknown>[] | null,
  )
}

function mapMaquinadoQueueRows(rows: Record<string, unknown>[] | null): BodegaProjectPieceWithProject[] {
  return (
    rows?.map((row) => ({
      ...normalizePieceRow(row),
      bodega_projects: row.bodega_projects as ProjectSnippetForPiece | null,
    })) ?? []
  )
}

/** Solo CNC/Torno cerrados con archivo (sin perfilado en programación). */
export async function fetchPiecesQueueMaquinado(): Promise<BodegaProjectPieceWithProject[]> {
  const sb = getSupabase()
  const sel = '*, bodega_projects(folio, nombre, status, programming_routes_confirmed_at)'

  const { data, error } = await sb
    .from('bodega_project_pieces')
    .select(sel)
    .in('programmer_bucket', ['cnc', 'torno'])
    .eq('programming_exit_kind', 'archivo_adjunto')
    .not('programming_finished_at', 'is', null)
    .is('maquinado_completed_at', null)

  if (error && !/does not exist|PGRST205/i.test([error.message, error.details].join(' '))) throw error

  return mapMaquinadoQueueRows(data as Record<string, unknown>[] | null)
}

/** Maquinado del proyecto (programadora en pestaña CNC). */
export async function fetchProjectMaquinadoQueue(projectId: string): Promise<BodegaProjectPieceWithProject[]> {
  const sb = getSupabase()
  const sel = '*, bodega_projects(folio, nombre, status, programming_routes_confirmed_at)'

  const { data, error } = await sb
    .from('bodega_project_pieces')
    .select(sel)
    .eq('project_id', projectId)
    .in('programmer_bucket', ['cnc', 'torno'])
    .eq('programming_exit_kind', 'archivo_adjunto')
    .not('programming_finished_at', 'is', null)
    .is('maquinado_completed_at', null)

  if (error && !/does not exist|PGRST205/i.test([error.message, error.details].join(' '))) throw error

  return mapMaquinadoQueueRows(data as Record<string, unknown>[] | null)
}

export async function fetchProjectPiecesQueuePerfilado(projectId: string): Promise<BodegaProjectPieceWithProject[]> {
  return (await fetchPiecesQueuePerfilado()).filter((p) => p.project_id === projectId)
}

export async function fetchProjectPiecesQueueArmado(projectId: string): Promise<BodegaProjectPieceWithProject[]> {
  return (await fetchPiecesQueueArmado()).filter((p) => p.project_id === projectId)
}

export async function fetchProjectPiecesQueueDetallado(projectId: string): Promise<BodegaProjectPieceWithProject[]> {
  return (await fetchPiecesQueueDetallado()).filter((p) => p.project_id === projectId)
}

/** Listas para armado (maquinado→armado o detallado→armado según ruta). */
export async function fetchPiecesQueueArmado(): Promise<BodegaProjectPieceWithProject[]> {
  const sb = getSupabase()
  const sel = '*, bodega_projects(folio, nombre, status, programming_routes_confirmed_at)'
  const { data, error } = await sb.from('bodega_project_pieces').select(sel).is('armado_completed_at', null)

  if (error) {
    const msg = [error.message, error.details].join(' ')
    if (/does not exist|PGRST205/i.test(msg)) return []
    throw error
  }

  const rows =
    (data as Record<string, unknown>[] | null)?.map((row) => ({
      ...normalizePieceRow(row),
      bodega_projects: row.bodega_projects as ProjectSnippetForPiece | null,
    })) ?? []

  return rows.filter((p) => pieceEligibleForArmado(p))
}

/** Detallado pendiente: tras perfilado, maquinado→detallado, o armado previo (CNC→armado→detallado). */
export async function fetchPiecesQueueDetallado(): Promise<BodegaProjectPieceWithProject[]> {
  const sb = getSupabase()
  const sel = '*, bodega_projects(folio, nombre, status, programming_routes_confirmed_at)'
  const { data, error } = await sb.from('bodega_project_pieces').select(sel).is('detallado_completed_at', null)

  if (error) {
    const msg = [error.message, error.details].join(' ')
    if (/does not exist|PGRST205/i.test(msg)) return []
    throw error
  }

  const rows =
    (data as Record<string, unknown>[] | null)?.map((row) => ({
      ...normalizePieceRow(row),
      bodega_projects: row.bodega_projects as ProjectSnippetForPiece | null,
    })) ?? []

  return rows.filter((p) => pieceEligibleForDetallado(p))
}

/** Perfilado en taller terminado y ruta clásica a detallado (sin 2ª programación CNC/Torno). */
export function pieceFinishedPerfilado(p: BodegaProjectPieceRow): boolean {
  return piecePerfiladoGoesDirectToDetallado(p)
}

export function pieceEligibleForDetallado(p: BodegaProjectPieceRow): boolean {
  if (p.detallado_completed_at != null) return false

  if (pieceAwaitingPostPerfiladoProgramming(p)) return false

  if (pieceFinishedPerfilado(p)) return true

  if (
    p.maquinado_completed_at != null &&
    p.post_maquinado_route === 'detallado' &&
    p.armado_completed_at == null
  ) {
    return true
  }

  if (p.armado_completed_at != null) return true

  return false
}

export function pieceEligibleForArmado(p: BodegaProjectPieceRow): boolean {
  if (p.armado_completed_at != null) return false

  const maquinadoToArmado =
    p.maquinado_completed_at != null &&
    (p.post_maquinado_route === 'armado' || p.post_maquinado_route == null) &&
    p.detallado_completed_at == null &&
    (p.programmer_bucket === 'cnc' || p.programmer_bucket === 'torno') &&
    p.programming_exit_kind === 'archivo_adjunto'

  const afterDetallado =
    p.detallado_completed_at != null &&
    (pieceFinishedPerfilado(p) ||
      (p.maquinado_completed_at != null && p.post_maquinado_route === 'detallado'))

  return maquinadoToArmado || afterDetallado
}

export async function updatePieceSupervisorFeedback(args: {
  pieceId: string
  feedback: string | null
}): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb
    .from('bodega_project_pieces')
    .update({ supervisor_design_feedback: args.feedback })
    .eq('id', args.pieceId)
  if (error) throw error
}

export async function updateProgrammingFinish(args: {
  pieceId: string
  exitKind: ProgrammingExitKind
  fileStoragePath: string
  fileName: string
}): Promise<void> {
  const sb = getSupabase()
  const now = new Date().toISOString()
  const { data: existing, error: readErr } = await sb
    .from('bodega_project_pieces')
    .select('post_perfilado_programming_bucket')
    .eq('id', args.pieceId)
    .maybeSingle()
  if (readErr && !/post_perfilado_programming_bucket/i.test([readErr.message, readErr.details].join(' '))) {
    throw readErr
  }

  const clearPostPerfilado =
    existing &&
    typeof existing === 'object' &&
    (existing as { post_perfilado_programming_bucket?: string | null }).post_perfilado_programming_bucket != null

  const { error } = await sb
    .from('bodega_project_pieces')
    .update({
      programming_finished_at: now,
      programming_exit_kind: args.exitKind,
      programming_file_storage_path: args.fileStoragePath,
      programming_file_name: args.fileName,
      programming_file_uploaded_at: now,
      ...(clearPostPerfilado ? { post_perfilado_programming_bucket: null } : {}),
    })
    .eq('id', args.pieceId)
  if (error) {
    if (/programming_file_/i.test([error.message, error.details].join(' '))) {
      throw new Error(
        'Faltan columnas de archivo por pieza. Ejecuta supabase/patch_bodega_piece_programming_file.sql en Supabase.',
      )
    }
    throw error
  }
}

export const BODEGA_PIECE_DESIGN_DRAWING_MIGRATION =
  'supabase/patch_bodega_piece_design_drawing.sql'

export async function updatePieceDesignDrawing(args: {
  pieceId: string
  fileStoragePath: string
  fileName: string
}): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb
    .from('bodega_project_pieces')
    .update({
      design_drawing_storage_path: args.fileStoragePath,
      design_drawing_name: args.fileName,
      design_drawing_uploaded_at: new Date().toISOString(),
    })
    .eq('id', args.pieceId)
  if (error) {
    if (/design_drawing_/i.test([error.message, error.details].join(' '))) {
      throw new Error(
        `Faltan columnas de plano por pieza. Ejecuta ${BODEGA_PIECE_DESIGN_DRAWING_MIGRATION} en Supabase.`,
      )
    }
    throw error
  }
}

export async function clearPieceDesignDrawing(pieceId: string): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb
    .from('bodega_project_pieces')
    .update({
      design_drawing_storage_path: null,
      design_drawing_name: null,
      design_drawing_uploaded_at: null,
    })
    .eq('id', pieceId)
  if (error) throw error
}

export async function updateProgrammingPieceFile(args: {
  pieceId: string
  fileStoragePath: string
  fileName: string
}): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb
    .from('bodega_project_pieces')
    .update({
      programming_file_storage_path: args.fileStoragePath,
      programming_file_name: args.fileName,
      programming_file_uploaded_at: new Date().toISOString(),
    })
    .eq('id', args.pieceId)
  if (error) {
    if (/programming_file_/i.test([error.message, error.details].join(' '))) {
      throw new Error(
        'Faltan columnas de archivo por pieza. Ejecuta supabase/patch_bodega_piece_programming_file.sql en Supabase.',
      )
    }
    throw error
  }
}

export type PieceStageMarker = 'perfilado' | 'maquinado' | 'armado' | 'detallado'

export async function markPieceStageCompleted(args: { pieceId: string; stage: PieceStageMarker }): Promise<void> {
  const col =
    args.stage === 'perfilado'
      ? 'perfilado_completed_at'
      : args.stage === 'maquinado'
        ? 'maquinado_completed_at'
        : args.stage === 'armado'
          ? 'armado_completed_at'
          : 'detallado_completed_at'
  const sb = getSupabase()
  const { error } = await sb.from('bodega_project_pieces').update({ [col]: new Date().toISOString() }).eq('id', args.pieceId)
  if (error) throw error
}

export type PerfiladoCompletionOutcome = 'detallado' | 'cnc' | 'torno'

/**
 * Cierra perfilado en taller. Por defecto sigue a detallado (comportamiento actual).
 * Si `sendToProgramming` es cnc/torno, reabre programación en ese módulo.
 */
export async function completePerfiladoWithOutcome(args: {
  pieceId: string
  outcome: PerfiladoCompletionOutcome
}): Promise<void> {
  const sb = getSupabase()
  const now = new Date().toISOString()

  if (args.outcome === 'detallado') {
    const { error } = await sb
      .from('bodega_project_pieces')
      .update({ perfilado_completed_at: now })
      .eq('id', args.pieceId)
    if (error) throw error
    return
  }

  const bucket = args.outcome
  const { error } = await sb
    .from('bodega_project_pieces')
    .update({
      perfilado_completed_at: now,
      post_perfilado_programming_bucket: bucket,
      programmer_bucket: bucket,
      programming_finished_at: null,
      programming_exit_kind: null,
    })
    .eq('id', args.pieceId)

  if (error) {
    const msg = [error.message, error.details].join(' ')
    if (/post_perfilado_programming_bucket/i.test(msg)) {
      throw new Error(
        'Falta la columna post_perfilado_programming_bucket. Ejecuta supabase/patch_bodega_post_perfilado_programming.sql en Supabase y recarga el esquema API.',
      )
    }
    throw error
  }
}

export const BODEGA_COMPLETE_MAQUINADO_PATCH = BODEGA_POST_MAQUINADO_ROUTE_PATCH

const MAQUINADO_DB_SETUP_MSG =
  'En Supabase → SQL Editor, ejecuta el archivo supabase/patch_bodega_complete_maquinado.sql (todo el contenido). Luego en Settings → API pulsa "Reload schema" o espera 1 minuto y recarga la app.'

function isPostgrestMissingColumn(err: { message?: string; details?: string; code?: string }): boolean {
  const msg = [err.message, err.details, err.code].filter(Boolean).join(' ')
  return /post_maquinado_route|schema cache|Could not find|PGRST204|column/i.test(msg)
}

function isPostgrestRpcNotFound(err: { message?: string; details?: string; code?: string }): boolean {
  const msg = [err.message, err.details, err.code].filter(Boolean).join(' ')
  return (
    err.code === 'PGRST202' ||
    /function.*does not exist|could not find.*bodega_complete_maquinado|404|not found/i.test(msg)
  )
}

function maquinadoFinishErrorMessage(err: { message?: string; details?: string; hint?: string; code?: string }): string {
  const msg = [err.message, err.details, err.hint].filter(Boolean).join(' ')
  if (isPostgrestMissingColumn(err) || isPostgrestRpcNotFound(err)) {
    return MAQUINADO_DB_SETUP_MSG
  }
  return msg || 'No se pudo terminar el maquinado'
}

async function patchMaquinadoFinish(args: {
  pieceId: string
  route: PostMaquinadoRoute
  includeRoute: boolean
  varianceNotes?: string | null
}): Promise<void> {
  const sb = getSupabase()
  const now = new Date().toISOString()
  const payload: Record<string, string | null> = { maquinado_completed_at: now }
  if (args.includeRoute) payload.post_maquinado_route = args.route
  if (args.varianceNotes !== undefined) payload.maquinado_time_variance_notes = args.varianceNotes

  const { error } = await sb.from('bodega_project_pieces').update(payload).eq('id', args.pieceId)
  if (error) throw error
}

export const BODEGA_PIECE_MAQUINADO_ESTIMATE_PATCH = 'supabase/patch_bodega_piece_maquinado_estimate.sql'

export async function updatePieceMaquinadoEstimate(args: {
  pieceId: string
  estimatedSeconds: number
  estimatedLabel: string
  timeSheetStoragePath?: string
  timeSheetName?: string
  varianceNotes?: string | null
}): Promise<void> {
  const sb = getSupabase()
  const payload: Record<string, unknown> = {
    maquinado_estimated_seconds: args.estimatedSeconds,
    maquinado_estimated_label: args.estimatedLabel,
  }
  if (args.timeSheetStoragePath && args.timeSheetName) {
    payload.maquinado_time_sheet_storage_path = args.timeSheetStoragePath
    payload.maquinado_time_sheet_name = args.timeSheetName
    payload.maquinado_time_sheet_uploaded_at = new Date().toISOString()
  }
  if (args.varianceNotes !== undefined) {
    payload.maquinado_time_variance_notes = args.varianceNotes
  }

  const { error } = await sb.from('bodega_project_pieces').update(payload).eq('id', args.pieceId)
  if (error) {
    if (/maquinado_estimated|maquinado_time_sheet|maquinado_time_variance/i.test([error.message, error.details].join(' '))) {
      throw new Error(
        `Faltan columnas de tiempo estimado de maquinado. Ejecuta ${BODEGA_PIECE_MAQUINADO_ESTIMATE_PATCH} en Supabase y recarga el esquema API.`,
      )
    }
    throw error
  }
}

export const BODEGA_PIECE_MAQUINADO_REAL_CAPTURE_PATCH =
  'supabase/patch_bodega_piece_maquinado_real_capture.sql'

export async function updatePieceMaquinadoRealCapture(args: {
  pieceId: string
  realLabel: string
  realSheetStoragePath?: string
  realSheetName?: string
}): Promise<void> {
  const parsed = parseHmsToSeconds(args.realLabel)
  if (parsed == null) {
    throw new Error('Tiempo inválido. Usa formato H:M:S (ej. 1:21:4).')
  }

  const sb = getSupabase()
  const payload: Record<string, unknown> = {
    maquinado_real_seconds: parsed,
    maquinado_real_label: args.realLabel.trim(),
  }
  if (args.realSheetStoragePath && args.realSheetName) {
    payload.maquinado_real_sheet_storage_path = args.realSheetStoragePath
    payload.maquinado_real_sheet_name = args.realSheetName
    payload.maquinado_real_sheet_uploaded_at = new Date().toISOString()
  }

  const { error } = await sb.from('bodega_project_pieces').update(payload).eq('id', args.pieceId)
  if (error) {
    if (/maquinado_real/i.test([error.message, error.details].join(' '))) {
      throw new Error(
        `Faltan columnas de tiempo real de maquinado. Ejecuta ${BODEGA_PIECE_MAQUINADO_REAL_CAPTURE_PATCH} en Supabase y recarga el esquema API.`,
      )
    }
    throw error
  }
}

export async function updatePieceMaquinadoVarianceNotes(args: {
  pieceId: string
  notes: string | null
}): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb
    .from('bodega_project_pieces')
    .update({ maquinado_time_variance_notes: args.notes })
    .eq('id', args.pieceId)
  if (error) throw error
}

export async function completeMaquinadoPiece(args: {
  pieceId: string
  route: PostMaquinadoRoute
  varianceNotes?: string | null
}): Promise<void> {
  const sb = getSupabase()

  const { error: rpcError } = await sb.rpc('bodega_complete_maquinado_piece', {
    p_piece_id: args.pieceId,
    p_route: args.route,
  })

  if (!rpcError) {
    if (args.varianceNotes !== undefined && args.varianceNotes !== null) {
      await updatePieceMaquinadoVarianceNotes({ pieceId: args.pieceId, notes: args.varianceNotes })
    }
    await closeAllOpenPieceIntervals(args.pieceId, 'maquinado')
    return
  }

  if (!isPostgrestRpcNotFound(rpcError)) {
    throw new Error(maquinadoFinishErrorMessage(rpcError))
  }

  const hasRouteCol = await bodegaPiecesSupportsPostMaquinadoRoute()

  if (hasRouteCol) {
    try {
      await patchMaquinadoFinish({
        pieceId: args.pieceId,
        route: args.route,
        includeRoute: true,
        varianceNotes: args.varianceNotes,
      })
      await closeAllOpenPieceIntervals(args.pieceId, 'maquinado')
      return
    } catch (e) {
      if (!isPostgrestMissingColumn(e as { message?: string; details?: string; code?: string })) {
        throw new Error(maquinadoFinishErrorMessage(e as { message?: string; details?: string }))
      }
    }
  }

  if (args.route === 'detallado') {
    throw new Error(
      `${MAQUINADO_DB_SETUP_MSG} (Obligatorio para enviar a Detallado: falta la columna post_maquinado_route.)`,
    )
  }

  try {
    await patchMaquinadoFinish({
      pieceId: args.pieceId,
      route: args.route,
      includeRoute: false,
      varianceNotes: args.varianceNotes,
    })
    await closeAllOpenPieceIntervals(args.pieceId, 'maquinado')
  } catch (e) {
    throw new Error(maquinadoFinishErrorMessage(e as { message?: string; details?: string; code?: string }))
  }
}

export async function fetchProjectPieces(projectId: string): Promise<BodegaProjectPieceRow[]> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('bodega_project_pieces')
    .select('*')
    .eq('project_id', projectId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) {
    const msg = [error.message, error.details].filter(Boolean).join(' ')
    if (/does not exist|could not find|404|PGRST205/i.test(msg)) return []
    throw error
  }
  const raw = (data as Record<string, unknown>[] | null) ?? []
  return raw.map((row) => normalizePieceRow(row))
}

export async function fetchProjectPieceFlowMeta(projectId: string): Promise<{
  design_contratiempo_notes: string | null
  programming_routes_confirmed_at: string | null
  project_finalized_at: string | null
} | null> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('bodega_projects')
    .select('design_contratiempo_notes, programming_routes_confirmed_at, project_finalized_at')
    .eq('id', projectId)
    .maybeSingle()
  if (error) {
    const msg = [error.message, error.details].join(' ')
    if (/does not exist|does not exist|404|PGRST205/i.test(msg)) return null
    throw error
  }
  if (!data) return null
  const row = data as Record<string, unknown>
  return {
    design_contratiempo_notes: (row.design_contratiempo_notes as string | null) ?? null,
    programming_routes_confirmed_at: (row.programming_routes_confirmed_at as string | null) ?? null,
    project_finalized_at: (row.project_finalized_at as string | null) ?? null,
  }
}

function pieceHasWorkflowProgress(p: BodegaProjectPieceRow): boolean {
  return Boolean(
    p.programming_finished_at ||
      p.perfilado_completed_at ||
      p.maquinado_completed_at ||
      p.armado_completed_at ||
      p.detallado_completed_at ||
      p.programmer_bucket,
  )
}

/** Se puede quitar del proyecto si aún no avanzó en taller/programación con archivo. */
export function pieceCanBeRemovedFromProject(p: BodegaProjectPieceRow): boolean {
  return !(
    p.programming_finished_at ||
    p.perfilado_completed_at ||
    p.maquinado_completed_at ||
    p.armado_completed_at ||
    p.detallado_completed_at
  )
}

export type DeleteProjectPiecesResult = {
  deleted: number
  blocked: { id: string; label: string; reason: string }[]
}

export async function deleteProjectPieces(pieceIds: string[]): Promise<DeleteProjectPiecesResult> {
  if (pieceIds.length === 0) return { deleted: 0, blocked: [] }
  const sb = getSupabase()
  const blocked: DeleteProjectPiecesResult['blocked'] = []
  let deleted = 0
  for (const pieceId of pieceIds) {
    const { data, error: fetchErr } = await sb.from('bodega_project_pieces').select('*').eq('id', pieceId).maybeSingle()
    if (fetchErr) throw fetchErr
    if (!data) continue
    const piece = normalizePieceRow(data as Record<string, unknown>)
    if (!pieceCanBeRemovedFromProject(piece)) {
      blocked.push({
        id: piece.id,
        label: piece.label,
        reason: 'Ya tiene programación, maquinado o taller registrado.',
      })
      continue
    }
    const { error } = await sb.from('bodega_project_pieces').delete().eq('id', pieceId)
    if (error) throw error
    deleted += 1
  }
  return { deleted, blocked }
}

/** Elimina filas «solo PDF» duplicadas cuando ya existe la pieza .PRT/.SLDPRT con el mismo nombre. */
export async function removeRedundantPairedPdfPieces(
  projectId: string,
  designPaths: string[],
): Promise<number> {
  const pieces = await fetchProjectPieces(projectId)
  let removed = 0
  for (const p of pieces) {
    if (!isRedundantPairedPdfPiece(p, pieces, designPaths)) continue
    if (pieceHasWorkflowProgress(p)) continue
    const sb = getSupabase()
    const { error } = await sb.from('bodega_project_pieces').delete().eq('id', p.id)
    if (error) throw error
    removed += 1
  }
  return removed
}

export type SyncDesignPiecesResult = { added: number; removedRedundantPdf: number }

/** Crea piezas por cada archivo del ZIP de diseño que aún no exista (misma `source_path`). */
export async function syncProjectPiecesFromDesignPaths(
  projectId: string,
  paths: string[],
  opts?: { cadOnly?: boolean; swPartOnly?: boolean; pdfOnly?: boolean },
): Promise<number> {
  const r = await syncProjectPiecesFromDesignPathsDetailed(projectId, paths, opts)
  return r.added
}

/**
 * Importa piezas del ZIP: modelos SW (.PRT/.SLCPRT/.SLDPRT) y, si aplica, PDF huérfanos
 * (sin pieza del mismo nombre). Los PDF emparejados no generan fila aparte.
 */
export async function syncProjectPiecesFromDesignPathsDetailed(
  projectId: string,
  paths: string[],
  opts?: { cadOnly?: boolean; swPartOnly?: boolean; pdfOnly?: boolean },
): Promise<SyncDesignPiecesResult> {
  let filtered = paths
  if (opts?.swPartOnly) {
    filtered = paths.filter((p) => isSwPartZipPath(p))
  } else if (opts?.pdfOnly) {
    filtered = orphanPerfiladoPdfPaths(paths)
  } else if (opts?.cadOnly !== false) {
    filtered = paths.filter((p) => isCadLikeZipPath(p))
  } else {
    filtered = [
      ...paths.filter((p) => isSwPartZipPath(p)),
      ...orphanPerfiladoPdfPaths(paths),
    ]
  }
  if (filtered.length === 0) {
    const removedOnly = await removeRedundantPairedPdfPieces(projectId, paths)
    return { added: 0, removedRedundantPdf: removedOnly }
  }

  const existing = await fetchProjectPieces(projectId)
  const importedPaths = existing.map((p) => p.source_path).filter(Boolean) as string[]
  let added = 0
  for (const path of filtered) {
    const norm = path.trim().replaceAll('\\', '/')
    if (!norm) continue
    if (importedPaths.some((p) => p === norm || designZipEntriesMatch(p, norm))) continue
    await insertProjectPiece({
      projectId,
      label: displayLabelFromDesignPath(norm),
      sourcePath: norm,
    })
    importedPaths.push(norm)
    added += 1
  }
  const removedRedundantPdf = await removeRedundantPairedPdfPieces(projectId, paths)
  return { added, removedRedundantPdf }
}

/** PDF de plano emparejado con la pieza (misma base de nombre en el ZIP de diseño). */
export function designDrawingPdfPathForPiece(
  piece: Pick<
    BodegaProjectPieceRow,
    'source_path' | 'design_drawing_storage_path' | 'design_drawing_name'
  >,
  designPaths: string[],
): string | null {
  if (piece.design_drawing_storage_path && piece.design_drawing_name) return null
  if (!piece.source_path || isPerfiladoPdfZipPath(piece.source_path)) return null
  return findMatchingPdfPathForPart(piece.source_path, designPaths)
}

/** Asigna un archivo del ZIP a una ruta CNC/Torno/Perfilado (crea o actualiza la pieza). */
export async function upsertPieceFromDesignPath(args: {
  projectId: string
  sourcePath: string
  programmerBucket: ProgrammerBucket
  assemblyXtPath?: string | null
}): Promise<string> {
  const norm = args.sourcePath.trim().replaceAll('\\', '/')
  if (!norm) throw new Error('Ruta de archivo vacía')

  const existing = await fetchProjectPieces(args.projectId)
  const found = existing.find((p) => p.source_path && designZipEntriesMatch(p.source_path, norm))
  if (found) {
    await updatePieceProgrammerBucket({ pieceId: found.id, programmerBucket: args.programmerBucket })
    return found.id
  }
  return insertProjectPiece({
    projectId: args.projectId,
    label: displayLabelFromDesignPath(norm),
    sourcePath: norm,
    assemblyXtPath: args.assemblyXtPath ?? null,
    programmerBucket: args.programmerBucket,
  })
}

/** Marca pieza como accesorio: copia el archivo a {folio}/accesorios/ en la nube (sin CNC/Torno/Perfilado). */
export async function assignDesignPathToAccesorios(args: {
  projectId: string
  projectFolio: string
  sourcePath: string
}): Promise<string> {
  const norm = args.sourcePath.trim().replaceAll('\\', '/')
  if (!norm) throw new Error('Ruta de archivo vacía')

  const existing = await fetchProjectPieces(args.projectId)
  let piece = existing.find((p) => p.source_path && designZipEntriesMatch(p.source_path, norm))
  let pieceId: string

  if (piece) {
    pieceId = piece.id
    if (piece.programmer_bucket === 'accesorios' && piece.accesorio_storage_path) {
      await updatePieceProgrammerBucket({ pieceId, programmerBucket: 'accesorios' })
      return pieceId
    }
  } else {
    pieceId = await insertProjectPiece({
      projectId: args.projectId,
      label: displayLabelFromDesignPath(norm),
      sourcePath: norm,
    })
    const refreshed = await fetchProjectPieces(args.projectId)
    piece = refreshed.find((p) => p.id === pieceId)
  }

  const archived = await archiveAccesorioFromDesignZip({
    projectId: args.projectId,
    projectFolio: args.projectFolio,
    pieceId,
    sourcePath: norm,
  })

  await updatePieceAccesorioArchive({
    pieceId,
    storagePath: archived.storagePath,
    storageName: archived.fileName,
  })
  return pieceId
}

export async function updatePieceAccesorioArchive(args: {
  pieceId: string
  storagePath: string
  storageName: string
}): Promise<void> {
  const sb = getSupabase()
  const now = new Date().toISOString()
  const { error } = await sb
    .from('bodega_project_pieces')
    .update({
      programmer_bucket: 'accesorios',
      accesorio_storage_path: args.storagePath,
      accesorio_storage_name: args.storageName,
      accesorio_archived_at: now,
    })
    .eq('id', args.pieceId)
  if (error) {
    const colErr = accesorioArchiveColumnError(error) ?? programmerBucketConstraintError(error)
    if (colErr) throw colErr
    throw error
  }
}

/** Registra una pieza dentro de un ensamblaje .x_T (contenido que abre la programadora en CAD). */
export async function insertPieceUnderAssembly(args: {
  projectId: string
  assemblyXtPath: string
  label: string
  sourcePath?: string | null
}): Promise<string> {
  const assembly = args.assemblyXtPath.trim().replaceAll('\\', '/')
  if (!assembly) throw new Error('Ruta de ensamblaje vacía')
  const label = args.label.trim()
  if (!label) throw new Error('Nombre de pieza vacío')
  return insertProjectPiece({
    projectId: args.projectId,
    label,
    sourcePath: args.sourcePath ?? null,
    assemblyXtPath: assembly,
  })
}

export async function insertProjectPiece(payload: {
  projectId: string
  label: string
  sourcePath?: string | null
  assemblyXtPath?: string | null
  sortOrder?: number
  programmerBucket?: ProgrammerBucket | null
}): Promise<string> {
  const sb = getSupabase()
  const baseRow = {
    project_id: payload.projectId,
    label: payload.label,
    source_path: payload.sourcePath ?? null,
    sort_order: payload.sortOrder ?? 0,
    programmer_bucket: payload.programmerBucket ?? null,
  }

  const useAssemblyCol =
    payload.assemblyXtPath != null && (await bodegaPiecesSupportsAssemblyXtPath())

  if (useAssemblyCol) {
    const { data, error } = await sb
      .from('bodega_project_pieces')
      .insert({ ...baseRow, assembly_xt_path: payload.assemblyXtPath })
      .select('id')
      .single()
    if (!error) return String((data as { id: string }).id)
    const bucketErr = programmerBucketConstraintError(error)
    if (bucketErr) throw bucketErr
    const hint = pieceInsertMissingColumnMessage(error)
    if (hint) throw new Error(hint)
    throw error
  }

  const { data, error } = await sb.from('bodega_project_pieces').insert(baseRow).select('id').single()
  if (error) {
    const bucketErr = programmerBucketConstraintError(error)
    if (bucketErr) throw bucketErr
    const hint = pieceInsertMissingColumnMessage(error)
    if (hint) throw new Error(hint)
    throw error
  }
  return String((data as { id: string }).id)
}

export async function updatePieceProgrammerBucket(args: {
  pieceId: string
  programmerBucket: ProgrammerBucket | null
}): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb
    .from('bodega_project_pieces')
    .update({ programmer_bucket: args.programmerBucket })
    .eq('id', args.pieceId)
  if (error) {
    const bucketErr = programmerBucketConstraintError(error)
    if (bucketErr) throw bucketErr
    throw error
  }
}

export async function updatePieceSourcePath(args: { pieceId: string; sourcePath: string | null }): Promise<void> {
  const sb = getSupabase()
  const v = args.sourcePath != null ? String(args.sourcePath).trim() : ''
  const { error } = await sb
    .from('bodega_project_pieces')
    .update({ source_path: v.length ? v : null })
    .eq('id', args.pieceId)
  if (error) throw error
}

export async function updatePieceFinishSpec(args: {
  pieceId: string
  finishSpec: PieceFinishSpec
}): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb
    .from('bodega_project_pieces')
    .update({ finish_spec: args.finishSpec })
    .eq('id', args.pieceId)
  if (error) throw error
}

export async function updatePieceFinishSpecsBatch(
  updates: { pieceId: string; finishSpec: PieceFinishSpec }[],
): Promise<void> {
  if (updates.length === 0) return
  await Promise.all(updates.map((u) => updatePieceFinishSpec(u)))
}

export async function updateProgrammingRoutesConfirmed(projectId: string): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb.rpc('bodega_confirm_programming_routes', { p_project_id: projectId })
  if (error) throw error
  const meta = await fetchProjectPieceFlowMeta(projectId)
  if (!meta?.programming_routes_confirmed_at) {
    throw new Error(
      'No se guardó la confirmación. Aplica en Supabase la migración bodega_confirm_programming_routes.',
    )
  }
}

export async function updateDesignContratiempoNotes(projectId: string, notes: string | null): Promise<void> {
  const sb = getSupabase()
  const { error: rpcErr } = await sb.rpc('bodega_update_design_contratiempo_notes', {
    p_project_id: projectId,
    p_notes: notes ?? '',
  })
  if (!rpcErr) return
  const msg = [rpcErr.message, rpcErr.details].join(' ')
  if (/could not find|PGRST202|schema cache/i.test(msg)) {
    const { error } = await sb
      .from('bodega_projects')
      .update({ design_contratiempo_notes: notes })
      .eq('id', projectId)
    if (error) {
      throw new Error(
        'No se guardó la nota. Ejecuta supabase/patch_bodega_design_notes_and_version_queue.sql en Supabase.',
      )
    }
    return
  }
  throw rpcErr
}

export async function finalizeProjectBySupervisor(projectId: string): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb.rpc('bodega_supervisor_finalize_project', { p_project_id: projectId })
  if (error) throw error
}
