import { getSupabase } from './supabaseClient'

export type PieceDesignReviewStatus = 'aprobada' | 'requiere_cambios'

export type PieceDesignReviewInput = {
  sourcePath: string
  status: PieceDesignReviewStatus
  feedback?: string | null
}

export type ResolveDesignPieceReviewResult = {
  approvedCount: number
  rejectedCount: number
  versionStatus: string
  projectStatus: string
}

export const BODEGA_PARTIAL_DESIGN_REVIEW_PATCH = 'supabase/patch_bodega_partial_design_review.sql'
export const BODEGA_DESIGN_CORRECTION_NOTIFICATIONS_PATCH =
  'supabase/patch_bodega_design_correction_notifications.sql'

export type PieceDesignStatus = 'en_revision' | 'aprobada' | 'requiere_cambios'

export type DesignVersionPieceReviewRow = {
  id: string
  design_version_id: string
  project_id: string
  source_path: string
  piece_id: string | null
  status: PieceDesignReviewStatus
  feedback: string | null
  reviewed_at: string
  correction_round: number
}

export function pieceDesignApproved(
  piece: { design_status?: PieceDesignStatus | null },
): boolean {
  const s = piece.design_status
  return s == null || s === 'aprobada'
}

export function pieceDesignPendingCorrection(
  piece: { design_status?: PieceDesignStatus | null },
): boolean {
  return piece.design_status === 'requiere_cambios'
}

export async function resolveDesignPieceReview(args: {
  designVersionId: string
  reviews: PieceDesignReviewInput[]
  comment?: string | null
}): Promise<ResolveDesignPieceReviewResult> {
  const sb = getSupabase()
  const payload = args.reviews.map((r) => ({
    source_path: r.sourcePath.trim().replaceAll('\\', '/'),
    status: r.status,
    feedback: r.feedback?.trim() || null,
  }))

  const { data, error } = await sb.rpc('bodega_resolve_design_piece_review', {
    p_design_version_id: args.designVersionId,
    p_reviews: payload,
    p_comment: args.comment ?? null,
  })

  if (error) {
    const msg = [error.message, error.details].filter(Boolean).join(' ')
    if (/bodega_resolve_design_piece_review|function.*does not exist|could not find/i.test(msg)) {
      throw new Error(
        `Falta la migración de revisión por pieza. Ejecuta ${BODEGA_PARTIAL_DESIGN_REVIEW_PATCH} en Supabase.`,
      )
    }
    throw new Error(msg)
  }

  const o = (data ?? {}) as Record<string, unknown>
  return {
    approvedCount: Number(o.approved_count) || 0,
    rejectedCount: Number(o.rejected_count) || 0,
    versionStatus: String(o.version_status ?? ''),
    projectStatus: String(o.project_status ?? ''),
  }
}

export async function fetchDesignVersionPieceReviews(
  designVersionId: string,
): Promise<DesignVersionPieceReviewRow[]> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('design_version_piece_reviews')
    .select('id, design_version_id, project_id, source_path, piece_id, status, feedback, reviewed_at, correction_round')
    .eq('design_version_id', designVersionId)
    .order('reviewed_at', { ascending: true })

  if (error) {
    const msg = [error.message, error.details].filter(Boolean).join(' ')
    if (/does not exist|could not find|PGRST205/i.test(msg)) return []
    throw error
  }
  return (data as DesignVersionPieceReviewRow[] | null) ?? []
}

export async function fetchPendingCorrectionPathsForProject(projectId: string): Promise<string[]> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('bodega_project_pieces')
    .select('source_path')
    .eq('project_id', projectId)
    .eq('design_status', 'requiere_cambios')

  if (error) {
    const msg = [error.message, error.details].filter(Boolean).join(' ')
    if (/design_status|does not exist/i.test(msg)) return []
    throw error
  }

  return (
    (data as Array<{ source_path: string | null }> | null)
      ?.map((r) => r.source_path)
      .filter((p): p is string => Boolean(p?.trim())) ?? []
  )
}
