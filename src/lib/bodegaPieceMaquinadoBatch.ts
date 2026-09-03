import type { BodegaPieceIntervalRow } from './bodegaPieceIntervalsRepo'
import {
  closeAllOpenPieceIntervals,
  pieceHasOpenInterval,
  startPieceInterval,
} from './bodegaPieceIntervalsRepo'
import { batchSaveMaquinadoRealFromCapture } from './bodegaPieceMaquinadoRealCapture'
import type { BodegaProjectPieceWithProject, PostMaquinadoRoute } from './bodegaPiecesRepo'
import { completeMaquinadoPiece } from './bodegaPiecesRepo'

const LANE = 'maquinado' as const

export function pieceCanBatchStartMaquinado(
  intervals: BodegaPieceIntervalRow[],
  pieceId: string,
): boolean {
  return !pieceHasOpenInterval(intervals, pieceId, LANE)
}

export function pieceCanBatchFinishMaquinado(
  intervals: BodegaPieceIntervalRow[],
  pieceId: string,
): boolean {
  return pieceHasOpenInterval(intervals, pieceId, LANE)
}

export async function batchStartMaquinado(args: {
  pieces: BodegaProjectPieceWithProject[]
  intervalsByPiece: Map<string, BodegaPieceIntervalRow[]>
}): Promise<{ started: number; skipped: number }> {
  let started = 0
  let skipped = 0
  for (const p of args.pieces) {
    const iv = args.intervalsByPiece.get(p.id) ?? []
    if (!pieceCanBatchStartMaquinado(iv, p.id)) {
      skipped += 1
      continue
    }
    await startPieceInterval(p.id, LANE)
    started += 1
  }
  return { started, skipped }
}

export async function batchFinishMaquinado(args: {
  pieces: BodegaProjectPieceWithProject[]
  intervalsByPiece: Map<string, BodegaPieceIntervalRow[]>
  route: PostMaquinadoRoute
  varianceNotes?: string | null
}): Promise<{ finished: number; skipped: number; errors: string[] }> {
  const notes = args.varianceNotes?.trim() || null
  let finished = 0
  let skipped = 0
  const errors: string[] = []

  for (const p of args.pieces) {
    const iv = args.intervalsByPiece.get(p.id) ?? []
    if (!pieceCanBatchFinishMaquinado(iv, p.id)) {
      skipped += 1
      continue
    }
    try {
      await closeAllOpenPieceIntervals(p.id, LANE)
      await completeMaquinadoPiece({
        pieceId: p.id,
        route: args.route,
        varianceNotes: notes,
      })
      finished += 1
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al terminar'
      errors.push(`${p.label}: ${msg}`)
    }
  }

  return { finished, skipped, errors }
}

export async function batchUploadMaquinadoRealCapture(args: {
  pieces: BodegaProjectPieceWithProject[]
  file: File
  manualLabel?: string | null
}): Promise<{ updated: number; skipped: number; errors: string[]; realLabel: string }> {
  return batchSaveMaquinadoRealFromCapture({
    pieces: args.pieces,
    file: args.file,
    manualLabel: args.manualLabel,
  })
}
