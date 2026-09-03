import { pieceLaneElapsedSeconds, type BodegaPieceIntervalRow, type BodegaPieceLane } from '../../lib/bodegaPieceIntervalsRepo'
import { BodegaLiveClock } from './BodegaLiveClock.tsx'
import { useLiveClockTick } from './useLiveClockTick.ts'
import type { BodegaProjectPieceRow } from '../../lib/bodegaPiecesRepo'
import {
  pieceStageWorkStatusLabel,
  pieceStageWorkStatusTone,
  type PieceStageWorkStatus,
} from '../../lib/bodegaPieceStageFlow'
import { tallerStageFinishLabel, tallerStageUi, type TallerStageKind } from './bodegaTallerStageUi.ts'
import { BodegaPieceProgrammingFileDownload } from './BodegaPieceProgrammingFileDownload.tsx'

export function pieceHasOpenLaneInterval(
  intervals: BodegaPieceIntervalRow[],
  pieceId: string,
  lane: BodegaPieceLane,
): boolean {
  return intervals.some((r) => r.piece_id === pieceId && r.lane === lane && r.ended_at == null)
}

type Props = {
  stage: TallerStageKind
  lane: BodegaPieceLane
  piece: BodegaProjectPieceRow
  originLabel: string
  projectFolio?: string | null
  projectNombre?: string | null
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
  onFinish: () => void | Promise<void>
}

const STEPS = [
  { n: 1, title: 'Revisar documentos', hint: 'Plano PDF y programa si aplica (CNC/Torno).' },
  { n: 2, title: 'Iniciar trabajo', hint: 'Registra el inicio en esta pieza.' },
  { n: 3, title: 'Cerrar etapa', hint: 'Al terminar, pulsa el botón de fin de etapa.' },
] as const

function StepBadge(props: { n: number; done: boolean; current: boolean; ui: ReturnType<typeof tallerStageUi> }) {
  return (
    <span
      className={[
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold',
        props.done
          ? props.ui.stepBadgeDone
          : props.current
            ? props.ui.stepBadgeCurrent
            : 'bg-slate-200 text-slate-600',
      ].join(' ')}
      aria-hidden
    >
      {props.done ? '✓' : props.n}
    </span>
  )
}

export function BodegaPieceTallerStageControls(props: Props) {
  const ui = tallerStageUi(props.stage)
  const finishLabel = tallerStageFinishLabel(props.stage)
  const active = pieceHasOpenLaneInterval(props.intervals, props.piece.id, props.lane)
  const clockNow = useLiveClockTick(active)
  const elapsedSec = pieceLaneElapsedSeconds(props.intervals, props.piece.id, props.lane, clockNow)
  const workStatus: PieceStageWorkStatus = active ? 'en_curso' : 'pendiente'
  const btn = 'min-h-[52px] rounded-xl px-5 py-3 text-[14px] font-bold transition disabled:opacity-50'
  const hasPdf = Boolean(props.pdfLabel && !props.pdfError)
  const hasProgram = Boolean(props.piece.programming_file_storage_path && props.piece.programming_file_name)
  const step1Done = hasPdf || hasProgram || Boolean(props.pdfPreviewUrl)
  const currentStep = active ? 3 : step1Done ? 2 : 1

  return (
    <div className={ui.panel}>
      <div className={ui.panelHeader}>
        <p className={ui.panelKicker}>Pieza seleccionada</p>
        <p className={ui.panelTitle}>{props.piece.label}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {props.projectFolio ? (
            <span className="rounded-md bg-white/15 px-2 py-0.5 font-mono text-[11px] text-white/90">
              {props.projectFolio}
            </span>
          ) : null}
          <span className="rounded-md border border-white/25 bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
            {props.originLabel}
          </span>
          <span
            className={[
              'rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
              pieceStageWorkStatusTone(workStatus),
            ].join(' ')}
          >
            {pieceStageWorkStatusLabel(workStatus)}
          </span>
        </div>
        {props.projectNombre ? (
          <p className="mt-2 line-clamp-2 text-[12px] text-white/85">{props.projectNombre}</p>
        ) : null}
      </div>

      <div className="max-h-[min(720px,calc(100dvh-10rem))] space-y-5 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6 sm:py-6">
        <ol className="space-y-2" aria-label={`Pasos de ${props.stage}`}>
          {STEPS.map((s) => {
            const done = s.n < currentStep || (s.n === 1 && step1Done && currentStep > 1)
            const current = s.n === currentStep
            return (
              <li
                key={s.n}
                className={[
                  'flex gap-3 rounded-xl border px-3 py-2.5',
                  current ? ui.stepCurrent : 'border-transparent',
                ].join(' ')}
              >
                <StepBadge n={s.n} done={done} current={current} ui={ui} />
                <div className="min-w-0">
                  <p className="text-[13px] font-bold text-slate-900">
                    Paso {s.n}: {s.title}
                    {current ? (
                      <span className="ml-2 text-[10px] font-bold uppercase opacity-80">Ahora</span>
                    ) : null}
                  </p>
                  <p className="text-[12px] leading-relaxed text-slate-600">{s.hint}</p>
                </div>
              </li>
            )
          })}
        </ol>

        <section className="rounded-xl border border-slate-200/90 bg-white p-4">
          <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Documentos</h4>
          <div className="mt-3 space-y-4">
            <div>
              <p className="text-[12px] font-semibold text-slate-800">Plano PDF</p>
              {props.pdfError ? (
                <p className="mt-1 rounded-lg bg-amber-50 px-2 py-1.5 text-[12px] text-amber-950">{props.pdfError}</p>
              ) : props.pdfLabel ? (
                <p className="mt-1 truncate font-mono text-[11px] text-slate-500" title={props.pdfLabel}>
                  {props.pdfLabel}
                </p>
              ) : props.pdfLoading ? (
                <p className="mt-1 text-[12px] text-slate-500">Buscando PDF…</p>
              ) : (
                <p className="mt-1 text-[12px] text-slate-500">Sin PDF identificado.</p>
              )}
              {props.onViewPdf && hasPdf ? (
                <button
                  type="button"
                  disabled={props.busy || props.pdfLoading}
                  className={`mt-2 inline-flex min-h-[40px] items-center rounded-lg border px-4 py-2 text-[13px] font-semibold ${ui.docBtn}`}
                  onClick={() => void props.onViewPdf?.()}
                >
                  {props.pdfPreviewUrl ? 'Actualizar PDF' : 'Abrir plano PDF'}
                </button>
              ) : null}
              {props.pdfPreviewUrl ? (
                <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-inner">
                  <iframe
                    title={`PDF ${props.piece.label}`}
                    src={props.pdfPreviewUrl}
                    className="block h-[min(320px,40vh)] w-full bg-white"
                  />
                </div>
              ) : null}
            </div>
            {hasProgram ? (
              <div>
                <p className="text-[12px] font-semibold text-slate-800">Programa (si aplica)</p>
                <BodegaPieceProgrammingFileDownload
                  storagePath={props.piece.programming_file_storage_path!}
                  fileName={props.piece.programming_file_name!}
                  className={`mt-2 inline-flex min-h-[40px] items-center rounded-lg border px-4 py-2 text-[12px] font-semibold ${ui.docBtn}`}
                />
              </div>
            ) : null}
          </div>
        </section>

        <BodegaLiveClock
          seconds={elapsedSec}
          active={active}
          label={props.stage === 'armado' ? 'Tiempo — Armado' : 'Tiempo — Detallado'}
          hint={
            active
              ? `Cronómetro activo — al terminar pulsa «${finishLabel}».`
              : `Pulsa Inicio cuando empieces ${props.stage === 'armado' ? 'el armado' : 'el detallado'} de esta pieza.`
          }
          businessMinutes={props.minutes}
          businessMinutesLabel="Min. hábiles"
          tone="slate"
        />

        {props.canWork ? (
          <section className="space-y-3">
            <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Acción</h4>
            {!active ? (
              <button
                type="button"
                disabled={props.busy}
                className={`${btn} w-full ${ui.btnStart}`}
                onClick={() => void props.onStart()}
              >
                Inicio
              </button>
            ) : (
              <button
                type="button"
                disabled={props.busy}
                className={`${btn} w-full ${ui.btnFinish}`}
                onClick={() => void props.onFinish()}
              >
                {finishLabel}
              </button>
            )}
          </section>
        ) : null}
      </div>
    </div>
  )
}
