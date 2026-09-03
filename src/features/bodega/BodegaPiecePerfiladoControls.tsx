import { pieceLaneElapsedSeconds, type BodegaPieceIntervalRow } from '../../lib/bodegaPieceIntervalsRepo'
import { BodegaLiveClock } from './BodegaLiveClock.tsx'
import { useLiveClockTick } from './useLiveClockTick.ts'
import type { BodegaProjectPieceRow, PerfiladoCompletionOutcome } from '../../lib/bodegaPiecesRepo'
import { BodegaPieceProgrammingFileDownload } from './BodegaPieceProgrammingFileDownload.tsx'

export function pieceHasOpenPerfiladoInterval(
  intervals: BodegaPieceIntervalRow[],
  pieceId: string,
): boolean {
  return intervals.some((r) => r.piece_id === pieceId && r.lane === 'perfilado_operador' && r.ended_at == null)
}

type Props = {
  piece: BodegaProjectPieceRow
  originLabel: string
  minutes: number
  intervals: BodegaPieceIntervalRow[]
  canWork: boolean
  busy: boolean
  pdfLabel?: string | null
  pdfPreviewUrl?: string | null
  pdfLoading?: boolean
  pdfError?: string | null
  onViewPdf?: () => void | Promise<void>
  onStart: () => void | Promise<void>
  onFinishPerfilado: (outcome: PerfiladoCompletionOutcome) => void | Promise<void>
}

const LANE = 'perfilado_operador' as const

export function BodegaPiecePerfiladoControls(props: Props) {
  const active = pieceHasOpenPerfiladoInterval(props.intervals, props.piece.id)
  const clockNow = useLiveClockTick(active)
  const elapsedSec = pieceLaneElapsedSeconds(props.intervals, props.piece.id, LANE, clockNow)
  const btn = 'min-h-[52px] rounded-xl px-5 py-3 text-[15px] font-bold'

  return (
    <div className="max-h-[min(720px,calc(100dvh-10rem))] overflow-y-auto overscroll-contain rounded-2xl border border-teal-200/80 bg-gradient-to-br from-teal-50/90 to-white px-5 py-5 shadow-sm ring-1 ring-teal-900/[0.05] sm:px-6 sm:py-6">
      <p className="text-[11px] font-bold uppercase tracking-wide text-teal-900">Perfilado</p>
      <p className="mt-1 text-[14px] font-semibold text-slate-900">{props.piece.label}</p>
      <p className="mt-0.5 text-[12px] text-slate-600">
        Origen: <span className="font-semibold text-slate-800">{props.originLabel}</span>
      </p>

      <div className="mt-3 space-y-3">
        <div>
          <p className="text-[11px] font-bold uppercase text-teal-900">Plano PDF (diseño)</p>
          {props.pdfError ? (
            <p className="mt-1 text-[12px] text-amber-900">{props.pdfError}</p>
          ) : props.pdfLabel ? (
            <p className="mt-1 truncate font-mono text-[12px] text-slate-600" title={props.pdfLabel}>
              {props.pdfLabel}
            </p>
          ) : props.pdfLoading ? (
            <p className="mt-1 text-[12px] text-slate-500">Buscando PDF en el diseño…</p>
          ) : null}
          {props.onViewPdf && props.pdfLabel && !props.pdfError ? (
            <button
              type="button"
              disabled={props.busy || props.pdfLoading}
              className="mt-2 inline-flex min-h-[40px] items-center rounded-lg border border-teal-400 bg-white px-4 py-2 text-[13px] font-semibold text-teal-900 hover:bg-teal-50 disabled:opacity-50"
              onClick={() => void props.onViewPdf?.()}
            >
              {props.pdfPreviewUrl ? 'Actualizar PDF' : 'Ver PDF'}
            </button>
          ) : null}
          {props.pdfPreviewUrl ? (
            <div className="mt-3 overflow-hidden rounded-xl border border-teal-200 bg-slate-100 shadow-inner">
              <iframe
                title={`PDF ${props.piece.label}`}
                src={props.pdfPreviewUrl}
                className="block h-[min(360px,45vh)] w-full bg-white"
              />
            </div>
          ) : null}
        </div>

        {props.piece.programming_file_storage_path && props.piece.programming_file_name ? (
          <div>
            <p className="text-[11px] font-bold uppercase text-teal-900">Programa (programación)</p>
            <BodegaPieceProgrammingFileDownload
              storagePath={props.piece.programming_file_storage_path}
              fileName={props.piece.programming_file_name}
              className="mt-1 inline-flex min-h-[40px] items-center rounded-lg border border-teal-300 bg-white px-4 py-2 text-[12px] font-semibold text-teal-900 hover:bg-teal-50"
            />
          </div>
        ) : null}
      </div>

      <div className="mt-4">
        <BodegaLiveClock
          seconds={elapsedSec}
          active={active}
          label="Tiempo — Perfilado"
          hint={
            active
              ? 'El reloj corre desde Inicio. Al terminar elige Detallado o reprogramación CNC/Torno.'
              : 'Pulsa Inicio cuando comiences a perfilar esta pieza.'
          }
          businessMinutes={props.minutes}
          businessMinutesLabel="Min. hábiles"
          tone="teal"
        />
      </div>

      {props.canWork ? (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {!active ? (
            <button
              type="button"
              disabled={props.busy}
              className={`${btn} bg-teal-700 text-white shadow-md disabled:opacity-50`}
              onClick={() => void props.onStart()}
            >
              Inicio
            </button>
          ) : (
            <div className="flex flex-col gap-3">
              <button
                type="button"
                disabled={props.busy}
                className={`${btn} bg-emerald-700 text-white shadow-md disabled:opacity-50`}
                onClick={() => void props.onFinishPerfilado('detallado')}
              >
                Terminación → Detallado
              </button>
              <div className="rounded-xl border border-amber-200/90 bg-amber-50/80 px-4 py-3">
                <p className="text-[11px] font-bold uppercase text-amber-950">Solo si hace falta</p>
                <p className="mt-1 text-[12px] leading-relaxed text-amber-900/90">
                  Otra pasada de programación en oficina antes de maquinado:
                </p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <button
                    type="button"
                    disabled={props.busy}
                    className={`${btn} bg-programacion-700 text-white shadow-sm hover:bg-programacion-800 disabled:opacity-50`}
                    onClick={() => void props.onFinishPerfilado('cnc')}
                  >
                    Terminación → CNC
                  </button>
                  <button
                    type="button"
                    disabled={props.busy}
                    className={`${btn} bg-programacion-800 text-white shadow-sm hover:bg-programacion-900 disabled:opacity-50`}
                    onClick={() => void props.onFinishPerfilado('torno')}
                  >
                    Terminación → Torno
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {active ? (
        <p className="mt-3 text-[12px] leading-relaxed text-teal-900/85">
          Lo habitual: <strong>Terminación → Detallado</strong>. Si la pieza necesita programarse otra vez, elige{' '}
          <strong>CNC</strong> o <strong>Torno</strong>; aparecerá en esa pestaña de programación.
        </p>
      ) : (
        <p className="mt-3 text-[12px] leading-relaxed text-slate-600">
          Presiona <strong>Inicio</strong> cuando comiences a perfilar esta pieza. Usa <strong>Ver PDF</strong> para el
          plano del diseño (CNC, Torno o carpeta perfilado).
        </p>
      )}
    </div>
  )
}
