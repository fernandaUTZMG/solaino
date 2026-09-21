import { useRef, useState } from 'react'
import type { BodegaPieceIntervalRow } from '../../lib/bodegaPieceIntervalsRepo'
import { batchFinishMaquinado, batchStartMaquinado } from '../../lib/bodegaPieceMaquinadoBatch'
import type { BodegaProjectPieceWithProject, PostMaquinadoRoute } from '../../lib/bodegaPiecesRepo'
import { pieceHasOpenMaquinadoInterval } from './BodegaPieceMaquinadoControls'
import { maquinadoUi } from './bodegaMaquinadoUi.ts'

type Props = {
  pieces: BodegaProjectPieceWithProject[]
  intervalsByPiece: Map<string, BodegaPieceIntervalRow[]>
  canWork: boolean
  busy: boolean
  compact?: boolean
  onDone: () => void | Promise<void>
}

export function BodegaPieceMaquinadoBatchControls(props: Props) {
  const [batchVarianceNotes, setBatchVarianceNotes] = useState('')
  const [localBusy, setLocalBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const compact = props.compact ?? false
  const disabled = props.busy || localBusy || !props.canWork
  const btn = compact
    ? 'min-h-[40px] rounded-lg px-3 py-2 text-[12px] font-bold'
    : 'min-h-[48px] rounded-xl px-4 py-2.5 text-[13px] font-bold'

  const startEligible = props.pieces.filter((p) => {
    const iv = props.intervalsByPiece.get(p.id) ?? []
    return !pieceHasOpenMaquinadoInterval(iv, p.id)
  })
  const finishEligible = props.pieces.filter((p) => {
    const iv = props.intervalsByPiece.get(p.id) ?? []
    return pieceHasOpenMaquinadoInterval(iv, p.id)
  })

  async function onBatchStart() {
    if (startEligible.length === 0) return
    setLocalBusy(true)
    setNotice(null)
    try {
      const { started, skipped } = await batchStartMaquinado({
        pieces: props.pieces,
        intervalsByPiece: props.intervalsByPiece,
      })
      setNotice(
        started > 0
          ? `Maquinado iniciado en ${started} pieza${started === 1 ? '' : 's'}.${skipped > 0 ? ` (${skipped} omitidas)` : ''}`
          : 'Ninguna pieza pudo iniciar (ya en curso).',
      )
      await props.onDone()
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'No se inició en lote')
    } finally {
      setLocalBusy(false)
    }
  }

  async function onBatchFinish(route: PostMaquinadoRoute) {
    if (finishEligible.length === 0) return
    setLocalBusy(true)
    setNotice(null)
    try {
      const { finished, skipped, errors } = await batchFinishMaquinado({
        pieces: props.pieces,
        intervalsByPiece: props.intervalsByPiece,
        route,
        varianceNotes: batchVarianceNotes.trim() || null,
      })
      let msg = `Maquinado terminado en ${finished} pieza${finished === 1 ? '' : 's'} → ${route === 'armado' ? 'Armado' : 'Detallado'}.`
      if (skipped > 0) msg += ` ${skipped} omitida${skipped === 1 ? '' : 's'} (sin reloj activo).`
      if (errors.length > 0) {
        msg += ` Errores: ${errors.slice(0, 3).join(' · ')}${errors.length > 3 ? '…' : ''}`
      }
      setNotice(msg)
      await props.onDone()
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'No se terminó en lote')
    } finally {
      setLocalBusy(false)
    }
  }

  if (props.pieces.length === 0) return null

  return (
    <div
      className={[
        'rounded-xl border border-dashed border-slate-300 bg-slate-50',
        compact ? 'mt-3 p-2.5' : 'mt-3 p-3 sm:p-4',
      ].join(' ')}
    >
      <p className={['font-bold uppercase text-section-navy', compact ? 'text-[10px]' : 'text-[11px]'].join(' ')}>
        Mismo maquinado — {props.pieces.length} pieza{props.pieces.length === 1 ? '' : 's'}
      </p>
      <p className={['mt-1 leading-snug text-slate-600', compact ? 'text-[10px]' : 'text-[11px]'].join(' ')}>
        Inicia el tiempo en lote y termina a Armado o Detallado.
      </p>

      {notice ? (
        <p
          className={[
            'mt-2 rounded-lg border border-slate-200 bg-white text-slate-800',
            compact ? 'px-2 py-1.5 text-[11px]' : 'px-3 py-2 text-[12px]',
          ].join(' ')}
        >
          {notice}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled || startEligible.length === 0}
          className={`${btn} text-white shadow-sm disabled:opacity-50 ${maquinadoUi.btnStart}`}
          onClick={() => void onBatchStart()}
        >
          Inicio masivo ({startEligible.length})
        </button>
      </div>

      <div className={['mt-3 rounded-lg border border-slate-200 bg-white p-3', compact ? 'p-2' : ''].join(' ')}>
        <p className={['font-bold uppercase text-slate-500', compact ? 'text-[10px]' : 'text-[11px]'].join(' ')}>
          Fin de maquinado ({finishEligible.length} con reloj activo)
        </p>
        <label className="mt-2 block">
          <span className="text-[10px] font-bold uppercase text-slate-500">
            Notas (opcional, todas las piezas)
          </span>
          <textarea
            value={batchVarianceNotes}
            onChange={(e) => setBatchVarianceNotes(e.target.value)}
            rows={2}
            disabled={disabled}
            placeholder="Ej. material duro, retrabajo…"
            className="mt-1 w-full resize-y rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[12px] outline-none focus:ring-2 focus:ring-section-navy/20"
          />
        </label>
        <div className="mt-2 flex flex-col gap-2">
          <button
            type="button"
            disabled={disabled || finishEligible.length === 0}
            className={`${btn} w-full text-white disabled:opacity-50 ${maquinadoUi.btnArmado}`}
            onClick={() => void onBatchFinish('armado')}
          >
            Fin masivo → Armado
          </button>
          <button
            type="button"
            disabled={disabled || finishEligible.length === 0}
            className={`${btn} w-full disabled:opacity-50 ${maquinadoUi.btnDetallado}`}
            onClick={() => void onBatchFinish('detallado')}
          >
            Fin masivo → Detallado
          </button>
        </div>
        <p className="mt-2 text-[10px] text-slate-500">
          Solo piezas con reloj iniciado. Primero <strong>Inicio masivo</strong> o inicia cada una.
        </p>
      </div>
    </div>
  )
}
