import type { BodegaPieceIntervalRow, BodegaPieceLane } from './bodegaPieceIntervalsRepo'
import { startPieceInterval } from './bodegaPieceIntervalsRepo'
import { pieceHasOpenInterval } from './bodegaPieceIntervalsRepo'
import {
  pieceNeedsSecondProgrammingSession,
} from './bodegaPostPerfiladoProgramming'
import type { BodegaProjectPieceRow, ProgrammingExitKind } from './bodegaPiecesRepo'
import { finishPieceProgramming, replacePieceProgrammingFile } from './bodegaPieceProgrammingFile'

export function pieceProgrammingWorkflowOpen(
  p: BodegaProjectPieceRow,
): boolean {
  const finished = Boolean(p.programming_finished_at)
  const secondSession = pieceNeedsSecondProgrammingSession(p)
  return !finished || secondSession
}

export function pieceCanBatchStartProgramming(
  p: BodegaProjectPieceRow,
  intervals: BodegaPieceIntervalRow[],
  lane: BodegaPieceLane,
): boolean {
  if (!pieceProgrammingWorkflowOpen(p)) return false
  return !pieceHasOpenInterval(intervals, p.id, lane)
}

export function pieceCanBatchFinishProgramming(
  p: BodegaProjectPieceRow,
): boolean {
  return pieceProgrammingWorkflowOpen(p)
}

/** Pieza ya terminó programación: solo cambiar el archivo (mismo NC en piezas iguales). */
export function pieceCanBatchReplaceProgrammingFile(p: BodegaProjectPieceRow): boolean {
  if (!p.programming_finished_at) return false
  if (pieceNeedsSecondProgrammingSession(p)) return false
  return true
}

export function pieceCanBatchFinishWithActiveClock(
  p: BodegaProjectPieceRow,
  intervals: BodegaPieceIntervalRow[],
  lane: BodegaPieceLane,
): boolean {
  return pieceCanBatchFinishProgramming(p) && pieceHasOpenInterval(intervals, p.id, lane)
}

export async function batchStartPieceProgramming(args: {
  pieces: BodegaProjectPieceRow[]
  intervals: BodegaPieceIntervalRow[]
  lane: BodegaPieceLane
}): Promise<{ started: number; skipped: number }> {
  let started = 0
  let skipped = 0
  for (const p of args.pieces) {
    if (!pieceCanBatchStartProgramming(p, args.intervals, args.lane)) {
      skipped += 1
      continue
    }
    await startPieceInterval(p.id, args.lane)
    started += 1
  }
  return { started, skipped }
}

export async function batchFinishPieceProgramming(args: {
  projectFolio: string
  pieces: BodegaProjectPieceRow[]
  intervals: BodegaPieceIntervalRow[]
  lane: BodegaPieceLane
  exitKind: ProgrammingExitKind
  file: File
  /** Inicia el reloj antes de terminar si la pieza aún no lo tenía activo. */
  autoStartIfNeeded?: boolean
}): Promise<{ finished: number; skipped: number; errors: string[] }> {
  const autoStart = args.autoStartIfNeeded !== false
  let finished = 0
  let skipped = 0
  const errors: string[] = []

  for (const p of args.pieces) {
    if (!pieceCanBatchFinishProgramming(p)) {
      skipped += 1
      continue
    }
    try {
      await finishPieceProgramming({
        projectFolio: args.projectFolio,
        pieceId: p.id,
        lane: args.lane,
        exitKind: args.exitKind,
        file: args.file,
        startIfNeeded: autoStart,
        intervals: args.intervals,
      })
      finished += 1
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al terminar'
      errors.push(`${p.label}: ${msg}`)
    }
  }

  return { finished, skipped, errors }
}

export async function batchReplacePieceProgrammingFile(args: {
  projectFolio: string
  pieces: BodegaProjectPieceRow[]
  file: File
}): Promise<{ updated: number; skipped: number; errors: string[] }> {
  let updated = 0
  let skipped = 0
  const errors: string[] = []

  for (const p of args.pieces) {
    if (!pieceCanBatchReplaceProgrammingFile(p)) {
      skipped += 1
      continue
    }
    try {
      await replacePieceProgrammingFile({
        projectFolio: args.projectFolio,
        pieceId: p.id,
        file: args.file,
      })
      updated += 1
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al subir'
      errors.push(`${p.label}: ${msg}`)
    }
  }

  return { updated, skipped, errors }
}
