import { useRef, useState } from 'react'
import type { BodegaPieceIntervalRow, BodegaPieceLane } from '../../lib/bodegaPieceIntervalsRepo'
import type { BodegaProjectPieceRow, ProgrammingExitKind } from '../../lib/bodegaPiecesRepo'
import {
  batchFinishPieceProgramming,
  batchReplacePieceProgrammingFile,
  batchStartPieceProgramming,
  pieceCanBatchFinishProgramming,
  pieceCanBatchFinishWithActiveClock,
  pieceCanBatchReplaceProgrammingFile,
  pieceCanBatchStartProgramming,
} from '../../lib/bodegaPieceProgrammingBatch'
import { pieceProgrammingAfterPerfiladoInProgress } from '../../lib/bodegaPostPerfiladoProgramming'
import { progWorkspacePalette } from './bodegaProgramacionUi.ts'

type Props = {
  pieces: BodegaProjectPieceRow[]
  intervals: BodegaPieceIntervalRow[]
  lane: BodegaPieceLane
  moduleLabel: string
  projectFolio: string
  canWork: boolean
  busy: boolean
  spacious?: boolean
  /** Vista compacta bajo la lista de piezas. */
  compact?: boolean
  onDone: () => void | Promise<void>
}

export function BodegaPieceProgrammingBatchControls(props: Props) {
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [replaceFile, setReplaceFile] = useState<File | null>(null)
  const [localBusy, setLocalBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const finishFileRef = useRef<HTMLInputElement>(null)
  const replaceFileRef = useRef<HTMLInputElement>(null)

  const moduleKind = props.lane === 'programacion_torno' ? 'torno' : 'programacion'
  const palette = progWorkspacePalette(moduleKind)
  const compact = props.compact ?? false
  const btn = compact
    ? 'min-h-[40px] rounded-lg px-3 py-2 text-[12px]'
    : props.spacious
      ? 'min-h-[48px] rounded-xl px-4 py-2.5 text-[13px]'
      : 'min-h-[40px] rounded-lg px-3 py-2 text-[12px]'

  const startEligible = props.pieces.filter((p) =>
    pieceCanBatchStartProgramming(p, props.intervals, props.lane),
  )
  const finishEligible = props.pieces.filter((p) => pieceCanBatchFinishProgramming(p))
  const clockActiveEligible = props.pieces.filter((p) =>
    pieceCanBatchFinishWithActiveClock(p, props.intervals, props.lane),
  )
  const replaceEligible = props.pieces.filter((p) => pieceCanBatchReplaceProgrammingFile(p))
  const anyAfterPerfilado = props.pieces.some((p) => pieceProgrammingAfterPerfiladoInProgress(p))
  const disabled = props.busy || localBusy || !props.canWork

  async function onBatchStart() {
    if (startEligible.length === 0) return
    setLocalBusy(true)
    setNotice(null)
    try {
      const { started, skipped } = await batchStartPieceProgramming({
        pieces: props.pieces,
        intervals: props.intervals,
        lane: props.lane,
      })
      setNotice(
        started > 0
          ? `Inicio en ${started} pieza${started === 1 ? '' : 's'}.${skipped > 0 ? ` (${skipped} omitidas)` : ''}`
          : 'Ninguna pieza pudo iniciar (ya en curso o terminadas).',
      )
      await props.onDone()
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'No se inició en lote')
    } finally {
      setLocalBusy(false)
    }
  }

  async function onBatchFinish(kind: ProgrammingExitKind) {
    if (!pendingFile || finishEligible.length === 0) return
    setLocalBusy(true)
    setNotice(null)
    try {
      const { finished, skipped, errors } = await batchFinishPieceProgramming({
        projectFolio: props.projectFolio,
        pieces: props.pieces,
        intervals: props.intervals,
        lane: props.lane,
        exitKind: kind,
        file: pendingFile,
        autoStartIfNeeded: true,
      })
      let msg = `Archivo aplicado y programación cerrada en ${finished} pieza${finished === 1 ? '' : 's'}.`
      if (skipped > 0) msg += ` ${skipped} omitida${skipped === 1 ? '' : 's'}.`
      if (errors.length > 0) {
        msg += ` Errores: ${errors.slice(0, 3).join(' · ')}${errors.length > 3 ? '…' : ''}`
      }
      setNotice(msg)
      setPendingFile(null)
      if (finishFileRef.current) finishFileRef.current.value = ''
      await props.onDone()
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'No se terminó en lote')
    } finally {
      setLocalBusy(false)
    }
  }

  async function onBatchReplace() {
    if (!replaceFile || replaceEligible.length === 0) return
    setLocalBusy(true)
    setNotice(null)
    try {
      const { updated, skipped, errors } = await batchReplacePieceProgrammingFile({
        projectFolio: props.projectFolio,
        pieces: props.pieces,
        file: replaceFile,
      })
      let msg = `Mismo archivo guardado en ${updated} pieza${updated === 1 ? '' : 's'}.`
      if (skipped > 0) msg += ` ${skipped} omitida${skipped === 1 ? '' : 's'} (aún no terminadas).`
      if (errors.length > 0) {
        msg += ` Errores: ${errors.slice(0, 3).join(' · ')}${errors.length > 3 ? '…' : ''}`
      }
      setNotice(msg)
      setReplaceFile(null)
      if (replaceFileRef.current) replaceFileRef.current.value = ''
      await props.onDone()
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'No se actualizó el archivo')
    } finally {
      setLocalBusy(false)
    }
  }

  if (props.pieces.length === 0) return null

  return (
    <div
      className={[
        compact ? 'mt-3' : 'mt-3',
        'rounded-xl border-2 border-dashed',
        compact ? 'p-2.5' : 'p-3 sm:p-4',
        palette.innerCard,
      ].join(' ')}
    >
      <p className={['font-bold uppercase', compact ? 'text-[10px]' : 'text-[11px]', palette.panelTitle].join(' ')}>
        Mismo archivo — {props.pieces.length} pieza{props.pieces.length === 1 ? '' : 's'}
      </p>
      <p className={['mt-1 leading-snug text-slate-600', compact ? 'text-[10px]' : 'text-[11px]'].join(' ')}>
        Sube el NC/TAP/ZIP una vez; se copia a cada pieza marcada. Al terminar el tiempo, usa{' '}
        <strong>Fin masivo</strong> (no hace falta pieza por pieza).
        {clockActiveEligible.length > 0 ? (
          <span className="mt-1 block text-programacion-900">
            {clockActiveEligible.length} con reloj en curso.
          </span>
        ) : null}
      </p>

      {notice ? (
        <p
          className={[
            'mt-2 rounded-lg border border-programacion-200 bg-white text-slate-800',
            compact ? 'px-2 py-1.5 text-[11px]' : 'px-3 py-2 text-[12px]',
          ].join(' ')}
        >
          {notice}
        </p>
      ) : null}

      {!compact ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={disabled || startEligible.length === 0}
            className={`${btn} font-bold text-white shadow-sm disabled:opacity-50 ${palette.btnPrimary}`}
            onClick={() => void onBatchStart()}
          >
            Inicio masivo ({startEligible.length})
          </button>
        </div>
      ) : null}

      <div
        className={[
          'rounded-lg border bg-white',
          compact ? 'mt-2 p-2' : 'mt-3 p-3',
          palette.innerCard,
        ].join(' ')}
      >
        <p className={['font-bold uppercase', compact ? 'text-[10px]' : 'text-[11px]', palette.panelTitle].join(' ')}>
          Terminar programación ({finishEligible.length})
        </p>
        <p className={['mt-0.5 text-slate-600', compact ? 'text-[10px]' : 'text-[11px]'].join(' ')}>
          Un archivo para todas: cierra el tiempo y guarda la programación en cada pieza.
        </p>
        <label
          className={[
            'mt-2 inline-flex w-full cursor-pointer items-center justify-center rounded-lg border-2 border-dashed font-semibold sm:w-auto',
            compact ? 'min-h-[40px] px-3 py-1.5 text-[12px]' : 'min-h-[44px] px-4 py-2 text-[13px]',
            palette.dashed,
          ].join(' ')}
        >
          {pendingFile ? pendingFile.name : 'Elegir archivo de programación'}
          <input
            ref={finishFileRef}
            type="file"
            className="hidden"
            disabled={disabled}
            onChange={(e) => setPendingFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <div className={['mt-2 flex flex-col gap-2', compact ? '' : 'sm:flex-row sm:flex-wrap'].join(' ')}>
          {!anyAfterPerfilado ? (
            <button
              type="button"
              disabled={disabled || !pendingFile || finishEligible.length === 0}
              className={`${btn} font-bold bg-programacion-700 text-white shadow-sm hover:bg-programacion-800 disabled:opacity-50`}
              onClick={() => void onBatchFinish('a_perfilado')}
            >
              Fin masivo → Perfilado
            </button>
          ) : null}
          <button
            type="button"
            disabled={disabled || !pendingFile || finishEligible.length === 0}
            className={`${btn} font-bold bg-programacion-800 text-white shadow-sm hover:bg-programacion-900 disabled:opacity-50`}
            onClick={() => void onBatchFinish('archivo_adjunto')}
          >
            {anyAfterPerfilado ? 'Fin masivo' : 'Fin masivo — sin perfilado'}
          </button>
        </div>
      </div>

      {replaceEligible.length > 0 ? (
        <div
          className={[
            'rounded-lg border bg-white',
            compact ? 'mt-2 p-2' : 'mt-3 p-3',
            palette.innerCard,
          ].join(' ')}
        >
          <p
            className={['font-bold uppercase', compact ? 'text-[10px]' : 'text-[11px]', palette.panelTitle].join(' ')}
          >
            Solo actualizar archivo ({replaceEligible.length} ya terminadas)
          </p>
          <p className={['mt-0.5 text-slate-600', compact ? 'text-[10px]' : 'text-[11px]'].join(' ')}>
            Piezas iguales que ya cerraste: mismo NC sin volver a registrar el tiempo.
          </p>
          <label
            className={[
              'mt-2 inline-flex w-full cursor-pointer items-center justify-center rounded-lg border-2 border-dashed font-semibold sm:w-auto',
              compact ? 'min-h-[40px] px-3 py-1.5 text-[12px]' : 'min-h-[44px] px-4 py-2 text-[13px]',
              palette.dashed,
            ].join(' ')}
          >
            {replaceFile ? replaceFile.name : 'Elegir archivo'}
            <input
              ref={replaceFileRef}
              type="file"
              className="hidden"
              disabled={disabled}
              onChange={(e) => setReplaceFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <button
            type="button"
            disabled={disabled || !replaceFile || replaceEligible.length === 0}
            className={`${btn} mt-2 w-full font-bold border-2 border-programacion-400 bg-white text-programacion-900 hover:bg-programacion-50 disabled:opacity-50`}
            onClick={() => void onBatchReplace()}
          >
            Aplicar mismo archivo a terminadas
          </button>
        </div>
      ) : null}
    </div>
  )
}
