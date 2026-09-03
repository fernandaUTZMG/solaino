import type { BodegaProjectPieceRow, ProgrammerBucket } from './bodegaPiecesRepo'

export const BODEGA_POST_PERFILADO_PROGRAMMING_PATCH =
  'supabase/patch_bodega_post_perfilado_programming.sql'

export type PostPerfiladoProgrammingBucket = 'cnc' | 'torno'

/** Tras perfilado en taller, pendiente de programación en CNC o Torno. */
export function pieceAwaitingPostPerfiladoProgramming(p: BodegaProjectPieceRow): boolean {
  return (
    p.perfilado_completed_at != null &&
    (p.post_perfilado_programming_bucket === 'cnc' || p.post_perfilado_programming_bucket === 'torno') &&
    p.programming_finished_at == null
  )
}

/** Perfilado en taller terminado y sigue a detallado (sin 2ª programación CNC/Torno). */
export function piecePerfiladoGoesDirectToDetallado(p: BodegaProjectPieceRow): boolean {
  if (pieceAwaitingPostPerfiladoProgramming(p)) return false
  if (p.perfilado_completed_at == null) return false
  if (p.post_perfilado_programming_bucket != null) return false

  if (p.programmer_bucket === 'perfilado') return true

  return p.programming_exit_kind === 'a_perfilado'
}

/** En 2ª programación tras perfilado: solo «Terminar sin perfilado» → maquinado. */
export function pieceProgrammingAfterPerfiladoInProgress(p: BodegaProjectPieceRow): boolean {
  return pieceNeedsSecondProgrammingSession(p)
}

/**
 * Pieza enviada a CNC/Torno desde taller perfilado y aún debe cerrar la 2ª programación.
 * Incluye datos viejos donde programming_finished_at no se limpió al reabrir.
 */
export function pieceNeedsSecondProgrammingSession(p: BodegaProjectPieceRow): boolean {
  if (!p.post_perfilado_programming_bucket || !p.perfilado_completed_at) return false
  if (p.programming_finished_at == null) return true
  return p.programming_exit_kind === 'a_perfilado'
}

export function postPerfiladoProgrammingLabel(bucket: PostPerfiladoProgrammingBucket | null | undefined): string {
  if (bucket === 'cnc') return 'CNC (tras perfilado)'
  if (bucket === 'torno') return 'Torno (tras perfilado)'
  return '—'
}

export function postPerfiladoTargetModule(bucket: PostPerfiladoProgrammingBucket): 'programacion' | 'torno' {
  return bucket === 'cnc' ? 'programacion' : 'torno'
}

export function programmerBucketFromPostPerfilado(bucket: PostPerfiladoProgrammingBucket): ProgrammerBucket {
  return bucket
}
