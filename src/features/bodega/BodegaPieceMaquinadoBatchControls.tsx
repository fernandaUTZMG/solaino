import { useRef, useState } from 'react'
import type { BodegaPieceIntervalRow } from '../../lib/bodegaPieceIntervalsRepo'
import {
  batchFinishMaquinado,
  batchStartMaquinado,
  batchUploadMaquinadoRealCapture,
} from '../../lib/bodegaPieceMaquinadoBatch'
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
  const [captureFile, setCaptureFile] = useState<File | null>(null)
  const [manualRealLabel, setManualRealLabel] = useState('')
  const [batchVarianceNotes, setBatchVarianceNotes] = useState('')
  const [localBusy, setLocalBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [captureErr, setCaptureErr] = useState<string | null>(null)
  const captureRef = useRef<HTMLInputElement>(null)

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

  async function onBatchCapture() {
    if (!captureFile) return
    setLocalBusy(true)
    setNotice(null)
    setCaptureErr(null)
    try {
      const { updated, skipped, errors, realLabel } = await batchUploadMaquinadoRealCapture({
        pieces: props.pieces,
        file: captureFile,
        manualLabel: manualRealLabel.trim() || null,
      })
      let msg = `Captura aplicada a ${updated} pieza${updated === 1 ? '' : 's'} (tiempo ${realLabel}).`
      if (skipped > 0) msg += ` ${skipped} omitida${skipped === 1 ? '' : 's'}.`
      if (errors.length > 0) {
        msg += ` Errores: ${errors.slice(0, 3).join(' · ')}${errors.length > 3 ? '…' : ''}`
      }
      setNotice(msg)
      setCaptureFile(null)
      setManualRealLabel('')
      if (captureRef.current) captureRef.current.value = ''
      await props.onDone()
    } catch (e) {
      setCaptureErr(e instanceof Error ? e.message : 'No se leyó la captura')
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
        'rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/80',
        compact ? 'mt-3 p-2.5' : 'mt-3 p-3 sm:p-4',
      ].join(' ')}
    >
      <p className={['font-bold uppercase text-amber-900', compact ? 'text-[10px]' : 'text-[11px]'].join(' ')}>
        Mismo maquinado — {props.pieces.length} pieza{props.pieces.length === 1 ? '' : 's'}
      </p>
      <p className={['mt-1 leading-snug text-amber-950/80', compact ? 'text-[10px]' : 'text-[11px]'].join(' ')}>
        Inicia el tiempo, sube <strong>una captura SURFCAM</strong> para todas (piezas iguales) y termina el lote a
        Armado o Detallado.
      </p>

      {notice ? (
        <p
          className={[
            'mt-2 rounded-lg border border-amber-200 bg-white text-amber-950',
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

      <div className={['mt-3 rounded-lg border border-amber-200 bg-white p-3', compact ? 'p-2' : ''].join(' ')}>
        <p className={['font-bold uppercase text-amber-900/70', compact ? 'text-[10px]' : 'text-[11px]'].join(' ')}>
          Captura tiempo real — todas ({props.pieces.length})
        </p>
        <label
          className={[
            'mt-2 inline-flex w-full cursor-pointer items-center justify-center rounded-lg border-2 border-dashed font-semibold',
            compact ? 'min-h-[40px] px-3 py-1.5 text-[12px]' : 'min-h-[44px] px-4 py-2 text-[13px]',
            maquinadoUi.docBtn,
          ].join(' ')}
        >
          {captureFile ? captureFile.name : 'Elegir imagen o PDF (SURFCAM)'}
          <input
            ref={captureRef}
            type="file"
            accept="image/*,.pdf"
            className="hidden"
            disabled={disabled}
            onChange={(e) => {
              setCaptureFile(e.target.files?.[0] ?? null)
              setCaptureErr(null)
            }}
          />
        </label>
        {captureErr ? (
          <>
            <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1.5 text-[11px] text-rose-950">
              {captureErr}
            </p>
            <label className="mt-2 block">
              <span className="text-[10px] font-bold uppercase text-amber-900/60">Tiempo a mano (H:M:S)</span>
              <input
                type="text"
                value={manualRealLabel}
                onChange={(e) => setManualRealLabel(e.target.value)}
                placeholder="1:21:4"
                className="mt-1 w-full rounded-lg border border-amber-200 px-2 py-1.5 font-mono text-[13px]"
              />
            </label>
          </>
        ) : null}
        <button
          type="button"
          disabled={disabled || !captureFile}
          className={`${btn} mt-2 w-full border-2 border-amber-400 bg-white text-amber-950 hover:bg-amber-50 disabled:opacity-50`}
          onClick={() => void onBatchCapture()}
        >
          Aplicar captura a seleccionadas
        </button>
      </div>

      <div className={['mt-3 rounded-lg border border-orange-200 bg-orange-50/50 p-3', compact ? 'p-2' : ''].join(' ')}>
        <p className={['font-bold uppercase text-amber-900/70', compact ? 'text-[10px]' : 'text-[11px]'].join(' ')}>
          Terminar maquinado ({finishEligible.length} con reloj activo)
        </p>
        <label className="mt-2 block">
          <span className="text-[10px] font-bold uppercase text-amber-900/60">
            Notas (opcional, todas las piezas)
          </span>
          <textarea
            value={batchVarianceNotes}
            onChange={(e) => setBatchVarianceNotes(e.target.value)}
            rows={2}
            disabled={disabled}
            placeholder="Ej. material duro, retrabajo…"
            className="mt-1 w-full resize-y rounded-lg border border-amber-200 bg-white px-2 py-1.5 text-[12px]"
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
            className={`${btn} w-full text-white disabled:opacity-50 ${maquinadoUi.btnDetallado}`}
            onClick={() => void onBatchFinish('detallado')}
          >
            Fin masivo → Detallado
          </button>
        </div>
        <p className="mt-2 text-[10px] text-amber-900/65">
          Solo piezas con reloj iniciado. Primero <strong>Inicio masivo</strong> o inicia cada una.
        </p>
      </div>
    </div>
  )
}
