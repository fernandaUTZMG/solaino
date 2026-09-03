import { useState } from 'react'
import type { BodegaPieceIntervalRow, BodegaPieceLane } from '../../lib/bodegaPieceIntervalsRepo'
import {
  batchFinishPerfilado,
  batchFinishTallerStage,
  batchStartPieceLane,
  pieceCanBatchFinishLane,
  pieceCanBatchStartLane,
} from '../../lib/bodegaPieceLaneBatch'
import type { BodegaProjectPieceWithProject, PerfiladoCompletionOutcome } from '../../lib/bodegaPiecesRepo'
import { tallerStageFinishLabel, tallerStageUi, type TallerStageKind } from './bodegaTallerStageUi.ts'

export type LaneBatchVariant = 'perfilado' | TallerStageKind

type Props = {
  variant: LaneBatchVariant
  lane: BodegaPieceLane
  pieces: BodegaProjectPieceWithProject[]
  intervalsByPiece: Map<string, BodegaPieceIntervalRow[]>
  canWork: boolean
  busy: boolean
  compact?: boolean
  onDone: () => void | Promise<void>
}

const PERF_STYLES = {
  wrap: 'border-teal-300 bg-teal-50/80',
  title: 'text-teal-900',
  btnStart: 'bg-teal-700 text-white shadow-sm hover:bg-teal-800',
  btnFinishMain: 'bg-emerald-700 text-white shadow-sm hover:bg-emerald-800',
  btnFinishAlt: 'bg-programacion-700 text-white shadow-sm hover:bg-programacion-800',
  btnFinishAlt2: 'bg-programacion-800 text-white shadow-sm hover:bg-programacion-900',
}

export function BodegaPieceLaneBatchControls(props: Props) {
  const [localBusy, setLocalBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const compact = props.compact ?? false
  const disabled = props.busy || localBusy || !props.canWork
  const btn = compact
    ? 'min-h-[40px] rounded-lg px-3 py-2 text-[12px] font-bold'
    : 'min-h-[48px] rounded-xl px-4 py-2.5 text-[13px] font-bold'

  const startEligible = props.pieces.filter((p) => {
    const iv = props.intervalsByPiece.get(p.id) ?? []
    return pieceCanBatchStartLane(iv, p.id, props.lane)
  })
  const finishEligible = props.pieces.filter((p) => {
    const iv = props.intervalsByPiece.get(p.id) ?? []
    return pieceCanBatchFinishLane(iv, p.id, props.lane)
  })

  const tallerUi = props.variant !== 'perfilado' ? tallerStageUi(props.variant) : null
  const finishLabel =
    props.variant !== 'perfilado' ? tallerStageFinishLabel(props.variant) : 'Terminación'

  async function onBatchStart() {
    if (startEligible.length === 0) return
    setLocalBusy(true)
    setNotice(null)
    try {
      const { started, skipped } = await batchStartPieceLane({
        pieces: props.pieces,
        intervalsByPiece: props.intervalsByPiece,
        lane: props.lane,
      })
      setNotice(
        started > 0
          ? `Inicio en ${started} pieza${started === 1 ? '' : 's'}.${skipped > 0 ? ` (${skipped} omitidas)` : ''}`
          : 'Ninguna pieza pudo iniciar (ya en curso).',
      )
      await props.onDone()
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'No se inició en lote')
    } finally {
      setLocalBusy(false)
    }
  }

  async function onBatchFinishPerfilado(outcome: PerfiladoCompletionOutcome) {
    if (finishEligible.length === 0) return
    setLocalBusy(true)
    setNotice(null)
    try {
      const { finished, skipped, errors } = await batchFinishPerfilado({
        pieces: props.pieces,
        intervalsByPiece: props.intervalsByPiece,
        outcome,
      })
      let msg = `Perfilado cerrado en ${finished} pieza${finished === 1 ? '' : 's'}.`
      if (skipped > 0) msg += ` ${skipped} omitida${skipped === 1 ? '' : 's'}.`
      if (errors.length > 0) msg += ` Errores: ${errors.slice(0, 3).join(' · ')}`
      setNotice(msg)
      await props.onDone()
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'No se terminó en lote')
    } finally {
      setLocalBusy(false)
    }
  }

  async function onBatchFinishTaller() {
    if (finishEligible.length === 0 || props.variant === 'perfilado') return
    setLocalBusy(true)
    setNotice(null)
    try {
      const { finished, skipped, errors } = await batchFinishTallerStage({
        pieces: props.pieces,
        intervalsByPiece: props.intervalsByPiece,
        lane: props.lane,
        stage: props.variant,
      })
      let msg = `${finishLabel} registrado en ${finished} pieza${finished === 1 ? '' : 's'}.`
      if (skipped > 0) msg += ` ${skipped} omitida${skipped === 1 ? '' : 's'}.`
      if (errors.length > 0) msg += ` Errores: ${errors.slice(0, 3).join(' · ')}`
      setNotice(msg)
      await props.onDone()
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'No se terminó en lote')
    } finally {
      setLocalBusy(false)
    }
  }

  if (props.pieces.length === 0) return null

  const wrapClass =
    props.variant === 'perfilado'
      ? PERF_STYLES.wrap
      : props.variant === 'armado'
        ? 'border-emerald-300 bg-emerald-50/80'
        : 'border-sky-300 bg-sky-50/80'

  return (
    <div
      className={[
        'rounded-xl border-2 border-dashed',
        compact ? 'p-2.5' : 'p-3 sm:p-4',
        wrapClass,
      ].join(' ')}
    >
      <p
        className={[
          'font-bold uppercase',
          compact ? 'text-[10px]' : 'text-[11px]',
          props.variant === 'perfilado' ? PERF_STYLES.title : 'text-slate-800',
        ].join(' ')}
      >
        Lote — {props.pieces.length} pieza{props.pieces.length === 1 ? '' : 's'}
      </p>
      <p className={['mt-1 leading-snug text-slate-700', compact ? 'text-[10px]' : 'text-[11px]'].join(' ')}>
        Inicio y fin masivos para piezas iguales o del mismo grupo.
      </p>

      {notice ? (
        <p
          className={[
            'mt-2 rounded-lg border bg-white text-slate-800',
            compact ? 'px-2 py-1.5 text-[11px]' : 'px-3 py-2 text-[12px]',
          ].join(' ')}
        >
          {notice}
        </p>
      ) : null}

      <button
        type="button"
        disabled={disabled || startEligible.length === 0}
        className={[
          btn,
          'mt-3 text-white shadow-sm disabled:opacity-50',
          props.variant === 'perfilado' ? PERF_STYLES.btnStart : tallerUi!.btnStart,
        ].join(' ')}
        onClick={() => void onBatchStart()}
      >
        Inicio masivo ({startEligible.length})
      </button>

      <div className={['mt-3 rounded-lg border bg-white p-3', compact ? 'p-2' : ''].join(' ')}>
        <p className={['font-bold uppercase text-slate-600', compact ? 'text-[10px]' : 'text-[11px]'].join(' ')}>
          Fin masivo ({finishEligible.length} con reloj activo)
        </p>
        {props.variant === 'perfilado' ? (
          <div className="mt-2 flex flex-col gap-2">
            <button
              type="button"
              disabled={disabled || finishEligible.length === 0}
              className={`${btn} w-full disabled:opacity-50 ${PERF_STYLES.btnFinishMain}`}
              onClick={() => void onBatchFinishPerfilado('detallado')}
            >
              Fin masivo → Detallado
            </button>
            <button
              type="button"
              disabled={disabled || finishEligible.length === 0}
              className={`${btn} w-full disabled:opacity-50 ${PERF_STYLES.btnFinishAlt}`}
              onClick={() => void onBatchFinishPerfilado('cnc')}
            >
              Fin masivo → CNC
            </button>
            <button
              type="button"
              disabled={disabled || finishEligible.length === 0}
              className={`${btn} w-full disabled:opacity-50 ${PERF_STYLES.btnFinishAlt2}`}
              onClick={() => void onBatchFinishPerfilado('torno')}
            >
              Fin masivo → Torno
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={disabled || finishEligible.length === 0}
            className={`${btn} mt-2 w-full text-white disabled:opacity-50 ${tallerUi!.btnFinish}`}
            onClick={() => void onBatchFinishTaller()}
          >
            Fin masivo — {finishLabel}
          </button>
        )}
        <p className="mt-2 text-[10px] text-slate-500">
          Solo piezas con reloj iniciado. Usa <strong>Inicio masivo</strong> primero si hace falta.
        </p>
      </div>
    </div>
  )
}
