import type { BodegaProjectPieceRow, BodegaProjectPieceWithProject } from './bodegaPiecesRepo'

export function filterPieceRowsBySearch(
  pieces: BodegaProjectPieceRow[],
  query: string,
): BodegaProjectPieceRow[] {
  const q = query.trim().toLowerCase()
  if (!q) return pieces
  return pieces.filter((p) => {
    const label = p.label.toLowerCase()
    const path = (p.source_path ?? '').toLowerCase()
    return label.includes(q) || path.includes(q)
  })
}

export function filterPiecesByQueueSearch(
  pieces: BodegaProjectPieceWithProject[],
  query: string,
): BodegaProjectPieceWithProject[] {
  const q = query.trim().toLowerCase()
  if (!q) return pieces
  return pieces.filter((p) => {
    const label = p.label.toLowerCase()
    const path = (p.source_path ?? '').toLowerCase()
    const folio = (p.bodega_projects?.folio ?? '').toLowerCase()
    const nombre = (p.bodega_projects?.nombre ?? '').toLowerCase()
    return label.includes(q) || path.includes(q) || folio.includes(q) || nombre.includes(q)
  })
}
