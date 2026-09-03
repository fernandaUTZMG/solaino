import { useRef, useState } from 'react'
import {
  pieceHasOpenInterval,
  pieceLaneElapsedSeconds,
  type BodegaPieceIntervalRow,
  type BodegaPieceLane,
} from '../../lib/bodegaPieceIntervalsRepo'
import { BodegaLiveClock } from './BodegaLiveClock.tsx'
import { useLiveClockTick } from './useLiveClockTick.ts'
import {
  pieceNeedsSecondProgrammingSession,
  pieceProgrammingAfterPerfiladoInProgress,
} from '../../lib/bodegaPostPerfiladoProgramming'
import type { BodegaProjectPieceRow, ProgrammingExitKind } from '../../lib/bodegaPiecesRepo'
import { progWorkspacePalette } from './bodegaProgramacionUi.ts'
import { BodegaPieceProgrammingFileDownload } from './BodegaPieceProgrammingFileDownload.tsx'

/** @deprecated Use pieceHasOpenInterval from bodegaPieceIntervalsRepo */
export function pieceHasOpenProgrammingInterval(
  intervals: BodegaPieceIntervalRow[],
  pieceId: string,
  lane: BodegaPieceLane,
): boolean {
  return pieceHasOpenInterval(intervals, pieceId, lane)
}

export function programmingExitLabelEs(kind: ProgrammingExitKind | null | undefined): string {
  if (kind === 'a_perfilado') return 'Terminé → Perfilado'
  if (kind === 'archivo_adjunto') return 'Terminé (sin perfilado)'
  return '—'
}

type Props = {
  piece: BodegaProjectPieceRow
  lane: 'programacion_cnc' | 'programacion_torno'
  moduleLabel: string
  minutes: number
  intervals: BodegaPieceIntervalRow[]
  canWork: boolean
  busy: boolean
  spacious?: boolean
  onStart: () => void | Promise<void>
  onFinish: (exitKind: ProgrammingExitKind, file: File) => void | Promise<void>
  onReplaceFile?: (file: File) => void | Promise<void>
}

export function BodegaPieceProgrammingControls(props: Props) {
  const finished = Boolean(props.piece.programming_finished_at)
  const secondSession = pieceNeedsSecondProgrammingSession(props.piece)
  const afterPerfiladoRound = pieceProgrammingAfterPerfiladoInProgress(props.piece)
  const showFinishedState = finished && !secondSession
  const showWorkflow = props.canWork && !showFinishedState
  const programmingActive = pieceHasOpenInterval(props.intervals, props.piece.id, props.lane)
  const clockNow = useLiveClockTick(programmingActive)
  const elapsedSec = pieceLaneElapsedSeconds(props.intervals, props.piece.id, props.lane, clockNow)
  const hasFile = Boolean(props.piece.programming_file_storage_path && props.piece.programming_file_name)
  const palette = progWorkspacePalette(props.lane === 'programacion_torno' ? 'torno' : 'programacion')
  const finishBtnLabel = afterPerfiladoRound ? 'Terminar' : 'Terminar (sin perfilado)'

  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const btn = props.spacious
    ? 'min-h-[52px] rounded-xl px-5 py-3 text-[14px]'
    : 'min-h-[44px] rounded-lg px-4 py-2.5 text-[13px]'

  function onFilePicked(file: File | undefined) {
    if (!file) return
    setPendingFile(file)
  }

  async function finishWith(kind: ProgrammingExitKind) {
    if (!pendingFile) return
    await props.onFinish(kind, pendingFile)
    setPendingFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function replaceWith(file: File | undefined) {
    if (!file || !props.onReplaceFile) return
    await props.onReplaceFile(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div
      className={[
        palette.panel,
        props.spacious ? 'px-4 py-4 sm:px-5 sm:py-5' : 'px-3 py-3',
      ].join(' ')}
    >
      <p className={['text-[11px] font-bold uppercase', palette.panelTitle].join(' ')}>
        Programación {props.moduleLabel}
      </p>
      <div className="mt-3">
        <BodegaLiveClock
          seconds={elapsedSec}
          active={programmingActive}
          label={`Tiempo — ${props.moduleLabel}`}
          hint={
            programmingActive
              ? 'El reloj corre desde que pulsaste Inicio. Sube el archivo y termina cuando acabes.'
              : 'Pulsa Inicio para comenzar a contar el tiempo de esta pieza.'
          }
          businessMinutes={props.minutes}
          businessMinutesLabel="Min. hábiles"
          tone="programacion"
        />
      </div>

      {hasFile ? (
        <div className="mt-3 space-y-2">
          <BodegaPieceProgrammingFileDownload
            storagePath={props.piece.programming_file_storage_path!}
            fileName={props.piece.programming_file_name!}
            className={palette.download}
          />
        </div>
      ) : null}

      {finished && props.canWork && props.onReplaceFile ? (
        <label
          className={[
            'mt-3 inline-flex min-h-[40px] cursor-pointer items-center rounded-lg border bg-white px-4 py-2 text-[12px] font-semibold',
            palette.fileBorder,
            palette.fileText,
            palette.fileBg,
          ].join(' ')}
        >
          {hasFile ? 'Cambiar archivo' : 'Subir archivo de la pieza'}
          <input
            type="file"
            className="hidden"
            disabled={props.busy}
            onChange={(e) => void replaceWith(e.target.files?.[0])}
          />
        </label>
      ) : null}

      {showFinishedState ? (
        <p className="mt-3 text-[12px] font-semibold text-emerald-800">
          Programación terminada — {programmingExitLabelEs(props.piece.programming_exit_kind)}
        </p>
      ) : showWorkflow ? (
        <div className="mt-3 space-y-3">
          {!programmingActive ? (
            <button
              type="button"
              disabled={props.busy}
              className={`${btn} font-bold text-white shadow-sm disabled:opacity-50 ${palette.btnPrimary}`}
              onClick={() => void props.onStart()}
            >
              Inicio
            </button>
          ) : (
            <>
              <div className={['rounded-lg border bg-white p-3', palette.innerCard].join(' ')}>
                <p className={['text-[11px] font-bold uppercase', palette.panelTitle].join(' ')}>
                  Archivo de esta pieza
                </p>
                <p className="mt-1 text-[11px] text-slate-600">
                  {afterPerfiladoRound
                    ? 'Obligatorio al terminar (archivo de la 2ª programación).'
                    : 'Obligatorio al terminar (NC, TAP, ZIP, PDF, etc.). Vale para perfilado o sin perfilado.'}
                </p>
                <label
                  className={[
                    'mt-2 inline-flex min-h-[44px] w-full cursor-pointer items-center justify-center rounded-lg border-2 border-dashed px-4 py-2 text-[13px] font-semibold sm:w-auto',
                    palette.dashed,
                  ].join(' ')}
                >
                  {pendingFile ? `Seleccionado: ${pendingFile.name}` : 'Elegir archivo'}
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    disabled={props.busy}
                    onChange={(e) => onFilePicked(e.target.files?.[0])}
                  />
                </label>
              </div>
              <div className={['flex gap-2', props.spacious ? 'flex-col sm:flex-row sm:flex-wrap' : 'flex-wrap'].join(' ')}>
                {!afterPerfiladoRound ? (
                  <button
                    type="button"
                    disabled={props.busy || !pendingFile}
                    className={`${btn} font-bold bg-programacion-700 text-white shadow-sm hover:bg-programacion-800 disabled:opacity-50`}
                    onClick={() => void finishWith('a_perfilado')}
                  >
                    Terminar → Perfilado
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={props.busy || !pendingFile}
                  className={`${btn} font-bold bg-programacion-800 text-white shadow-sm hover:bg-programacion-900 disabled:opacity-50 ${props.spacious ? 'sm:flex-1' : ''}`}
                  onClick={() => void finishWith('archivo_adjunto')}
                >
                  {finishBtnLabel}
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}
