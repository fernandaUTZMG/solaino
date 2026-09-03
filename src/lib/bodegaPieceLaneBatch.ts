import type { BodegaPieceIntervalRow, BodegaPieceLane } from './bodegaPieceIntervalsRepo'
import { endPieceInterval, pieceHasOpenInterval, startPieceInterval } from './bodegaPieceIntervalsRepo'
import type { BodegaProjectPieceWithProject, PerfiladoCompletionOutcome, PieceStageMarker } from './bodegaPiecesRepo'
import { completePerfiladoWithOutcome, markPieceStageCompleted } from './bodegaPiecesRepo'

export function pieceCanBatchStartLane(
  intervals: BodegaPieceIntervalRow[],
  pieceId: string,
  lane: BodegaPieceLane,
): boolean {
  return !pieceHasOpenInterval(intervals, pieceId, lane)
}

export function pieceCanBatchFinishLane(
  intervals: BodegaPieceIntervalRow[],
  pieceId: string,
  lane: BodegaPieceLane,
): boolean {
  return pieceHasOpenInterval(intervals, pieceId, lane)
}

export async function batchStartPieceLane(args: {
  pieces: BodegaProjectPieceWithProject[]
  intervalsByPiece: Map<string, BodegaPieceIntervalRow[]>
  lane: BodegaPieceLane
}): Promise<{ started: number; skipped: number }> {
  let started = 0
  let skipped = 0
  for (const p of args.pieces) {
    const iv = args.intervalsByPiece.get(p.id) ?? []
    if (!pieceCanBatchStartLane(iv, p.id, args.lane)) {
      skipped += 1
      continue
    }
    await startPieceInterval(p.id, args.lane)
    started += 1
  }
  return { started, skipped }
}

async function batchFinishPieceLaneCore(args: {
  pieces: BodegaProjectPieceWithProject[]
  intervalsByPiece: Map<string, BodegaPieceIntervalRow[]>
  lane: BodegaPieceLane
  onPiece: (pieceId: string) => Promise<void>
}): Promise<{ finished: number; skipped: number; errors: string[] }> {
  let finished = 0
  let skipped = 0
  const errors: string[] = []

  for (const p of args.pieces) {
    const iv = args.intervalsByPiece.get(p.id) ?? []
    if (!pieceCanBatchFinishLane(iv, p.id, args.lane)) {
      skipped += 1
      continue
    }
    try {
      await endPieceInterval(p.id, args.lane)
      await args.onPiece(p.id)
      finished += 1
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al terminar'
      errors.push(`${p.label}: ${msg}`)
    }
  }

  return { finished, skipped, errors }
}

export async function batchFinishPerfilado(args: {
  pieces: BodegaProjectPieceWithProject[]
  intervalsByPiece: Map<string, BodegaPieceIntervalRow[]>
  outcome: PerfiladoCompletionOutcome
}): Promise<{ finished: number; skipped: number; errors: string[] }> {
  return batchFinishPieceLaneCore({
    pieces: args.pieces,
    intervalsByPiece: args.intervalsByPiece,
    lane: 'perfilado_operador',
    onPiece: (pieceId) => completePerfiladoWithOutcome({ pieceId, outcome: args.outcome }),
  })
}

export async function batchFinishTallerStage(args: {
  pieces: BodegaProjectPieceWithProject[]
  intervalsByPiece: Map<string, BodegaPieceIntervalRow[]>
  lane: BodegaPieceLane
  stage: PieceStageMarker
}): Promise<{ finished: number; skipped: number; errors: string[] }> {
  return batchFinishPieceLaneCore({
    pieces: args.pieces,
    intervalsByPiece: args.intervalsByPiece,
    lane: args.lane,
    onPiece: (pieceId) => markPieceStageCompleted({ pieceId, stage: args.stage }),
  })
}
