import { pieceLaneElapsedSeconds, type BodegaPieceIntervalRow } from '../../lib/bodegaPieceIntervalsRepo'
import { formatWorkMinutesShort } from '../../lib/bodegaWorkIntervalsRepo'
import { BodegaLiveClock } from './BodegaLiveClock.tsx'
import { useLiveClockTick } from './useLiveClockTick.ts'
import type { BodegaProjectPieceRow, PostMaquinadoRoute } from '../../lib/bodegaPiecesRepo'
import {
  maquinadoPieceStatusLabel,
  maquinadoPieceStatusTone,
  maquinadoPieceUiStatus,
} from '../../lib/bodegaMaquinadoFlow'
import { maquinadoUi } from './bodegaMaquinadoUi.ts'
import { BodegaPieceProgrammingFileDownload } from './BodegaPieceProgrammingFileDownload.tsx'

export function pieceHasOpenMaquinadoInterval(
  intervals: BodegaPieceIntervalRow[],
  pieceId: string,
): boolean {
  return intervals.some((r) => r.piece_id === pieceId && r.lane === 'maquinado' && r.ended_at == null)
}

type Props = {
  piece: BodegaProjectPieceRow
  originLabel: string
  projectFolio?: string | null
  projectNombre?: string | null
  minutes: number
  intervals: BodegaPieceIntervalRow[]
  varianceNotes: string
  onVarianceNotesChange: (notes: string) => void
  canWork: boolean
  busy: boolean
  pdfLabel?: string | null
  pdfPreviewUrl?: string | null
  pdfLoading?: boolean
  pdfError?: string | null
  onViewPdf?: () => void | Promise<void>
  onStart: () => void | Promise<void>
  onFinishMaquinado: (route: PostMaquinadoRoute) => void | Promise<void>
}

const STEPS = [
  { n: 1, title: 'Revisar documentos', hint: 'Plano PDF del diseño y archivo de programación.' },
  { n: 2, title: 'Iniciar maquinado', hint: 'Pulsa Inicio cuando la pieza entra a la máquina CNC.' },
  {
    n: 3,
    title: 'Terminar maquinado',
    hint: 'Pulsa Fin y envía la pieza a Armado o Detallado.',
  },
] as const

function StepBadge(props: { n: number; done: boolean; current: boolean }) {
  return (
    <span
      className={[
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold',
        props.done
          ? maquinadoUi.stepBadgeDone
          : props.current
            ? maquinadoUi.stepBadgeCurrent
            : 'bg-slate-200 text-slate-600',
      ].join(' ')}
      aria-hidden
    >
      {props.done ? '✓' : props.n}
    </span>
  )
}

export function BodegaPieceMaquinadoControls(props: Props) {
  const active = pieceHasOpenMaquinadoInterval(props.intervals, props.piece.id)
  const clockNow = useLiveClockTick(active)
  const elapsedSec = pieceLaneElapsedSeconds(props.intervals, props.piece.id, 'maquinado', clockNow)
  const uiStatus = maquinadoPieceUiStatus(active)
  const btn = 'min-h-[52px] rounded-xl px-5 py-3 text-[14px] font-bold transition disabled:opacity-50'
  const hasPdf = Boolean(props.pdfLabel && !props.pdfError)
  const hasProgram = Boolean(props.piece.programming_file_storage_path && props.piece.programming_file_name)
  const step1Done = hasPdf || hasProgram || Boolean(props.pdfPreviewUrl)
  const currentStep = active ? 3 : step1Done ? 2 : 1

  return (
    <div className={maquinadoUi.panel}>
      <div className={maquinadoUi.panelHeader}>
        <p className={maquinadoUi.panelKicker}>Pieza seleccionada</p>
        <p className={maquinadoUi.panelTitle}>{props.piece.label}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {props.projectFolio ? (
            <span className="rounded-md bg-white/15 px-2 py-0.5 font-mono text-[11px] text-sky-100">
              {props.projectFolio}
            </span>
          ) : null}
          <span className="rounded-md border border-white/25 bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
            {props.originLabel}
          </span>
          <span
            className={[
              'rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
              maquinadoPieceStatusTone(uiStatus),
            ].join(' ')}
          >
            {maquinadoPieceStatusLabel(uiStatus)}
          </span>
        </div>
        {props.projectNombre ? (
          <p className="mt-2 line-clamp-2 text-[12px] text-sky-100/90">{props.projectNombre}</p>
        ) : null}
      </div>

      <div className="space-y-5 px-5 py-5 sm:px-6 sm:py-6">
        <ol className="space-y-2" aria-label="Pasos de maquinado">
          {STEPS.map((s) => {
            const done = s.n < currentStep || (s.n === 1 && step1Done && currentStep > 1)
            const current = s.n === currentStep
            return (
              <li
                key={s.n}
                className={[
                  'flex gap-3 rounded-xl border px-3 py-2.5',
                  current ? maquinadoUi.stepCurrent : 'border-transparent',
                ].join(' ')}
              >
                <StepBadge n={s.n} done={done} current={current} />
                <div className="min-w-0">
                  <p className="text-[13px] font-bold text-slate-900">
                    Paso {s.n}: {s.title}
                    {current ? (
                      <span className="ml-2 text-[10px] font-bold uppercase text-section-navy">Ahora</span>
                    ) : null}
                  </p>
                  <p className="text-[12px] leading-relaxed text-slate-600">{s.hint}</p>
                </div>
              </li>
            )
          })}
        </ol>

        <section className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
          <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Documentos</h4>
          <div className="mt-3 space-y-4">
            <div>
              <p className="text-[12px] font-semibold text-slate-900">Plano PDF (diseño)</p>
              {props.pdfError ? (
                <p className="mt-1 rounded-lg bg-amber-50 px-2 py-1.5 text-[12px] text-amber-950">{props.pdfError}</p>
              ) : props.pdfLabel ? (
                <p className="mt-1 truncate font-mono text-[11px] text-slate-500" title={props.pdfLabel}>
                  {props.pdfLabel}
                </p>
              ) : props.pdfLoading ? (
                <p className="mt-1 text-[12px] text-slate-500">Buscando PDF…</p>
              ) : (
                <p className="mt-1 text-[12px] text-slate-500">Sin PDF para esta pieza.</p>
              )}
              {props.onViewPdf && hasPdf ? (
                <button
                  type="button"
                  disabled={props.busy || props.pdfLoading}
                  className={`mt-2 inline-flex min-h-[40px] items-center rounded-lg border px-4 py-2 text-[13px] font-semibold disabled:opacity-50 ${maquinadoUi.docBtn}`}
                  onClick={() => void props.onViewPdf?.()}
                >
                  {props.pdfPreviewUrl ? 'Actualizar PDF' : 'Abrir plano PDF'}
                </button>
              ) : null}
              {props.pdfPreviewUrl ? (
                <iframe
                  title={`PDF ${props.piece.label}`}
                  src={props.pdfPreviewUrl}
                  className="mt-3 h-[min(360px,45vh)] w-full rounded-xl border border-slate-200 bg-white shadow-inner"
                />
              ) : null}
            </div>

            {hasProgram ? (
              <div>
                <p className="text-[12px] font-semibold text-slate-900">Programa CNC</p>
                <p className="mt-0.5 text-[11px] text-slate-500">Archivo adjunto al terminar programación.</p>
                <BodegaPieceProgrammingFileDownload
                  storagePath={props.piece.programming_file_storage_path!}
                  fileName={props.piece.programming_file_name!}
                  className={`mt-2 inline-flex min-h-[40px] items-center rounded-lg border px-4 py-2 text-[12px] font-semibold ${maquinadoUi.docBtn}`}
                />
              </div>
            ) : (
              <p className="text-[12px] text-slate-500">Sin archivo de programación en esta pieza.</p>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
            Tiempo de maquinado
          </h4>
          <p className="mt-1 truncate text-[13px] font-semibold text-slate-900" title={props.piece.label}>
            {props.piece.label}
          </p>
          <p className="mt-2 text-[12px] leading-relaxed text-slate-600">
            {active
              ? 'Cronómetro activo — al terminar elige Armado o Detallado.'
              : 'Pulsa Inicio cuando empieces a maquinar esta pieza. El tiempo se detiene al pulsar Fin.'}
          </p>
          {props.minutes > 0 ? (
            <p className="mt-2 font-mono text-[11px] text-slate-500">
              Acumulado: {formatWorkMinutesShort(props.minutes)}
            </p>
          ) : null}
        </section>

        <BodegaLiveClock
          seconds={elapsedSec}
          active={active}
          label="Tiempo — Maquinado"
          hint={
            active
              ? 'El reloj corre desde Inicio. Al terminar elige Armado o Detallado.'
              : 'Pulsa Inicio cuando la pieza entre a la máquina CNC.'
          }
          businessMinutes={props.minutes}
          businessMinutesLabel="Min. hábiles"
          tone="navy"
        />

        {props.canWork ? (
          <section className="space-y-3">
            <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Acción</h4>
            {!active ? (
              <button
                type="button"
                disabled={props.busy}
                className={`${btn} w-full ${maquinadoUi.btnStart}`}
                onClick={() => void props.onStart()}
              >
                Inicio
              </button>
            ) : (
              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-[14px] font-bold text-slate-900">Fin de maquinado</p>
                <p className="text-[13px] leading-relaxed text-slate-600">
                  ¿A dónde envías la pieza después de maquinarla?
                </p>
                <label className="block">
                  <span className="text-[11px] font-bold uppercase text-slate-500">
                    Comentarios / contratiempo (opcional)
                  </span>
                  <textarea
                    value={props.varianceNotes}
                    onChange={(e) => props.onVarianceNotesChange(e.target.value)}
                    rows={2}
                    disabled={props.busy}
                    placeholder="Ej. material duro, retrabajo…"
                    className="mt-1 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-900 outline-none focus:ring-2 focus:ring-section-navy/20"
                  />
                </label>
                <button
                  type="button"
                  disabled={props.busy}
                  className={`${btn} w-full ${maquinadoUi.btnArmado}`}
                  onClick={() => void props.onFinishMaquinado('armado')}
                >
                  Fin → Armado
                </button>
                <p className="-mt-1 text-[11px] leading-relaxed text-slate-500">
                  La pieza pasa a la cola de <strong>ensamble</strong> en taller.
                </p>
                <button
                  type="button"
                  disabled={props.busy}
                  className={`${btn} w-full ${maquinadoUi.btnDetallado}`}
                  onClick={() => void props.onFinishMaquinado('detallado')}
                >
                  Fin → Detallado
                </button>
                <p className="-mt-1 text-[11px] leading-relaxed text-slate-500">
                  Salta armado: va <strong>directo a detallado</strong>.
                </p>
              </div>
            )}
          </section>
        ) : null}
      </div>
    </div>
  )
}
