import { useEffect, useState } from 'react'
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
import {
  formatSecondsAsHms,
  formatVarianceLabel,
  maquinadoTimeVarianceSeconds,
  pieceMaquinadoEstimatedLabel,
  pieceMaquinadoEstimatedSeconds,
  pieceMaquinadoRealLabel,
  pieceMaquinadoRealSeconds,
} from '../../lib/maquinadoEstimatedTime'
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
  elapsedSeconds: number
  intervals: BodegaPieceIntervalRow[]
  realSheetPreviewUrl?: string | null
  captureBusy?: boolean
  captureErr?: string | null
  onUploadRealCapture?: (file: File, manualLabel?: string) => void | Promise<void>
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
  { n: 1, title: 'Revisar documentos', hint: 'Plano PDF del diseño y archivo de programación (NC/ZIP).' },
  { n: 2, title: 'Iniciar maquinado', hint: 'Pulsa Inicio cuando la pieza entra a la máquina.' },
  {
    n: 3,
    title: 'Terminar maquinado',
    hint: 'Sube la captura SURFCAM de esta pieza (tiempo Overall) y cierra enviando a Armado o Detallado.',
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
  const [manualRealLabel, setManualRealLabel] = useState('')
  const [pendingCaptureFile, setPendingCaptureFile] = useState<File | null>(null)

  const active = pieceHasOpenMaquinadoInterval(props.intervals, props.piece.id)
  const clockNow = useLiveClockTick(active)
  const elapsedSec = pieceLaneElapsedSeconds(props.intervals, props.piece.id, 'maquinado', clockNow)
  const uiStatus = maquinadoPieceUiStatus(active)
  const btn = 'min-h-[52px] rounded-xl px-5 py-3 text-[14px] font-bold transition disabled:opacity-50'
  const hasPdf = Boolean(props.pdfLabel && !props.pdfError)
  const hasProgram = Boolean(props.piece.programming_file_storage_path && props.piece.programming_file_name)
  const step1Done = hasPdf || hasProgram || Boolean(props.pdfPreviewUrl)
  const currentStep = active ? 3 : step1Done ? 2 : 1
  const estimatedSec = pieceMaquinadoEstimatedSeconds(props.piece)
  const estimatedLabel = pieceMaquinadoEstimatedLabel(props.piece)
  const realLabel = pieceMaquinadoRealLabel(props.piece)
  const realSec = pieceMaquinadoRealSeconds(props.piece)
  const actualForVariance = realSec ?? (props.elapsedSeconds > 0 ? props.elapsedSeconds : null)
  const varianceSec =
    actualForVariance != null ? maquinadoTimeVarianceSeconds(estimatedSec, actualForVariance) : null
  const overEstimate = varianceSec != null && varianceSec > 60
  const hasRealSheet = Boolean(props.realSheetPreviewUrl || props.piece.maquinado_real_sheet_name)
  const displayRealLabel =
    realLabel ?? (props.elapsedSeconds > 0 ? formatSecondsAsHms(props.elapsedSeconds) : null)

  useEffect(() => {
    setManualRealLabel('')
    setPendingCaptureFile(null)
  }, [props.piece.id])

  return (
    <div className={maquinadoUi.panel}>
      <div className={maquinadoUi.panelHeader}>
        <p className={maquinadoUi.panelKicker}>Pieza seleccionada</p>
        <p className={maquinadoUi.panelTitle}>{props.piece.label}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {props.projectFolio ? (
            <span className="rounded-md bg-white/15 px-2 py-0.5 font-mono text-[11px] text-amber-100">
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
          <p className="mt-2 line-clamp-2 text-[12px] text-amber-100/90">{props.projectNombre}</p>
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
                  <p className="text-[13px] font-bold text-amber-950">
                    Paso {s.n}: {s.title}
                    {current ? (
                      <span className="ml-2 text-[10px] font-bold uppercase text-orange-700">Ahora</span>
                    ) : null}
                  </p>
                  <p className="text-[12px] leading-relaxed text-amber-950/75">{s.hint}</p>
                </div>
              </li>
            )
          })}
        </ol>

        <section className="rounded-xl border border-amber-200/90 bg-white p-4">
          <h4 className="text-[11px] font-bold uppercase tracking-wide text-amber-900/70">Documentos</h4>
          <div className="mt-3 space-y-4">
            <div>
              <p className="text-[12px] font-semibold text-amber-950">Plano PDF (diseño)</p>
              {props.pdfError ? (
                <p className="mt-1 rounded-lg bg-orange-50 px-2 py-1.5 text-[12px] text-orange-950">{props.pdfError}</p>
              ) : props.pdfLabel ? (
                <p className="mt-1 truncate font-mono text-[11px] text-amber-900/60" title={props.pdfLabel}>
                  {props.pdfLabel}
                </p>
              ) : props.pdfLoading ? (
                <p className="mt-1 text-[12px] text-amber-900/60">Buscando PDF…</p>
              ) : (
                <p className="mt-1 text-[12px] text-amber-900/60">Sin PDF para esta pieza.</p>
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
                  className="mt-3 h-[min(360px,45vh)] w-full rounded-xl border border-amber-200 bg-white shadow-inner"
                />
              ) : null}
            </div>

            {hasProgram ? (
              <div>
                <p className="text-[12px] font-semibold text-amber-950">Programa CNC/Torno</p>
                <p className="mt-0.5 text-[11px] text-amber-900/65">Archivo adjunto al terminar programación.</p>
                <BodegaPieceProgrammingFileDownload
                  storagePath={props.piece.programming_file_storage_path!}
                  fileName={props.piece.programming_file_name!}
                  className={`mt-2 inline-flex min-h-[40px] items-center rounded-lg border px-4 py-2 text-[12px] font-semibold ${maquinadoUi.docBtn}`}
                />
              </div>
            ) : (
              <p className="text-[12px] text-amber-900/65">Sin archivo de programación en esta pieza.</p>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-amber-200/90 bg-amber-50/60 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h4 className="text-[11px] font-bold uppercase tracking-wide text-amber-900/70">
                Tiempo de maquinado — esta pieza
              </h4>
              <p className="mt-1 truncate text-[13px] font-semibold text-amber-950" title={props.piece.label}>
                {props.piece.label}
              </p>
            </div>
            <span className="rounded-md border border-amber-300/80 bg-white/80 px-2 py-1 text-[10px] font-bold uppercase text-amber-900">
              1 captura por pieza
            </span>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-amber-900/75">
            Cada pieza del proyecto guarda su propia imagen y tiempo. Si cambias de pieza en la lista, verás y subirás
            la captura de esa pieza.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-amber-200/80 bg-white px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase text-amber-900/60">Estimado (CAM)</p>
              <p className="mt-1 font-mono text-[22px] font-bold tabular-nums text-amber-950">
                {estimatedLabel ?? '—'}
              </p>
              {!estimatedLabel ? (
                <p className="mt-1 text-[11px] leading-relaxed text-amber-900/70">
                  La programación debe registrar el tiempo estimado (H:M:S) de esta pieza.
                </p>
              ) : null}
            </div>
            <div className="rounded-lg border border-amber-200/80 bg-white px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase text-amber-900/60">Real en máquina (esta pieza)</p>
              <p className="mt-1 font-mono text-[22px] font-bold tabular-nums text-amber-950">
                {displayRealLabel ?? '—'}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-amber-900/65">
                {realLabel
                  ? 'Leído de captura (Overall / pantalla).'
                  : props.elapsedSeconds > 0
                    ? 'Cronómetro en curso.'
                    : 'Sube captura del tiempo o pulsa Inicio.'}
              </p>
              {props.elapsedSeconds > 0 ? (
                <p className="mt-1 font-mono text-[11px] text-amber-900/65">
                  Cronómetro: {formatSecondsAsHms(props.elapsedSeconds)} · Acumulado:{' '}
                  {formatWorkMinutesShort(props.minutes)}
                </p>
              ) : props.minutes > 0 ? (
                <p className="mt-1 font-mono text-[11px] text-amber-900/65">
                  Acumulado: {formatWorkMinutesShort(props.minutes)}
                </p>
              ) : null}
              {props.canWork && props.onUploadRealCapture ? (
                <div className="mt-3 space-y-2">
                  <label
                    className={[
                      'inline-flex min-h-[40px] w-full cursor-pointer items-center justify-center rounded-lg border-2 border-dashed px-3 py-2 text-[12px] font-semibold transition',
                      props.captureBusy ? 'pointer-events-none opacity-60' : maquinadoUi.docBtn,
                    ].join(' ')}
                  >
                    {props.captureBusy
                      ? 'Leyendo imagen (OCR)…'
                      : pendingCaptureFile
                        ? `Guardar: ${pendingCaptureFile.name}`
                        : hasRealSheet
                          ? 'Cambiar captura de esta pieza'
                          : 'Subir captura de esta pieza'}
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      className="hidden"
                      disabled={props.busy || props.captureBusy}
                      onChange={(e) => {
                        const f = e.target.files?.[0] ?? null
                        setPendingCaptureFile(f)
                        setManualRealLabel('')
                        e.target.value = ''
                        if (f) void props.onUploadRealCapture?.(f)
                      }}
                    />
                  </label>
                  {props.captureErr ? (
                    <>
                      <p className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1.5 text-[11px] text-rose-950">
                        {props.captureErr}
                      </p>
                      <label className="block">
                        <span className="text-[10px] font-bold uppercase text-amber-900/60">
                          Tiempo a mano (H:M:S)
                        </span>
                        <div className="mt-1 flex gap-2">
                          <input
                            type="text"
                            value={manualRealLabel}
                            onChange={(ev) => setManualRealLabel(ev.target.value)}
                            placeholder="1:21:4"
                            className="min-w-0 flex-1 rounded-lg border border-amber-200 px-2 py-1.5 font-mono text-[13px]"
                          />
                          <button
                            type="button"
                            disabled={!pendingCaptureFile || !manualRealLabel.trim() || props.captureBusy}
                            className={`shrink-0 rounded-lg px-3 py-1.5 text-[12px] font-bold disabled:opacity-50 ${maquinadoUi.docBtn}`}
                            onClick={() => {
                              if (!pendingCaptureFile) return
                              void props.onUploadRealCapture?.(pendingCaptureFile, manualRealLabel.trim())
                            }}
                          >
                            Guardar
                          </button>
                        </div>
                      </label>
                    </>
                  ) : null}
                  <p className="text-[10px] leading-relaxed text-amber-900/60">
                    Captura SURFCAM solo de <strong>{props.piece.label}</strong>: fila <strong>Overall</strong> (ej.{' '}
                    <span className="font-mono">1:21:4</span>). Otra pieza = otra imagen.
                  </p>
                </div>
              ) : null}
              {hasRealSheet && props.realSheetPreviewUrl ? (
                <div className="mt-3 overflow-hidden rounded-lg border border-amber-100">
                  <p
                    className="border-b border-amber-100 bg-amber-50/90 px-2 py-1.5 text-[10px] font-bold uppercase text-amber-900/80"
                    title={props.piece.maquinado_real_sheet_name ?? undefined}
                  >
                    Captura — {props.piece.label}
                    {props.piece.maquinado_real_sheet_name ? (
                      <span className="mt-0.5 block truncate font-mono font-normal normal-case text-amber-800/70">
                        {props.piece.maquinado_real_sheet_name}
                      </span>
                    ) : null}
                  </p>
                  {props.piece.maquinado_real_sheet_name?.toLowerCase().endsWith('.pdf') ? (
                    <iframe
                      title="Captura tiempo real"
                      src={props.realSheetPreviewUrl}
                      className="h-[min(160px,28vh)] w-full"
                    />
                  ) : (
                    <img
                      src={props.realSheetPreviewUrl}
                      alt="Tiempo en máquina"
                      className="max-h-[min(200px,32vh)] w-full object-contain"
                    />
                  )}
                </div>
              ) : null}
            </div>
          </div>
          {varianceSec != null && actualForVariance != null && actualForVariance > 0 ? (
            <p
              className={[
                'mt-3 rounded-lg border px-3 py-2 text-[13px] font-semibold',
                overEstimate
                  ? 'border-rose-200 bg-rose-50 text-rose-950'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-950',
              ].join(' ')}
            >
              Diferencia vs estimado:{' '}
              <span className="font-mono">{formatVarianceLabel(varianceSec)}</span>
              {overEstimate ? ' — tardó más de lo previsto en CAM.' : ''}
            </p>
          ) : null}
          <p className="mt-2 text-[12px] text-amber-950/75">
            {active
              ? 'Cronómetro activo — al terminar elige Armado o Detallado.'
              : 'Pulsa Inicio cuando empieces a maquinar esta pieza.'}
          </p>
        </section>

        <BodegaLiveClock
          seconds={elapsedSec}
          active={active}
          label="Tiempo — Maquinado"
          hint={
            active
              ? 'El reloj corre desde Inicio. Al terminar sube la captura SURFCAM y elige destino.'
              : 'Pulsa Inicio cuando la pieza entre a la máquina.'
          }
          businessMinutes={props.minutes}
          businessMinutesLabel="Min. hábiles"
          tone="amber"
        />

        {props.canWork ? (
          <section className="space-y-3">
            <h4 className="text-[11px] font-bold uppercase tracking-wide text-amber-900/70">Acción</h4>
            {!active ? (
              <button
                type="button"
                disabled={props.busy}
                className={`${btn} w-full ${maquinadoUi.btnStart}`}
                onClick={() => void props.onStart()}
              >
                Iniciar tiempo de maquinado
              </button>
            ) : (
              <div className="space-y-3 rounded-xl border border-orange-200/90 bg-orange-50/40 p-4">
                <p className="text-[14px] font-bold text-amber-950">Terminación de maquinado</p>
                <p className="text-[13px] leading-relaxed text-amber-950/80">
                  ¿A dónde envías la pieza después de maquinarla?
                </p>
                {overEstimate || props.piece.maquinado_time_variance_notes ? (
                  <label className="block">
                    <span className="text-[11px] font-bold uppercase text-amber-900/70">
                      Notas si tardó más que el estimado
                    </span>
                    <textarea
                      value={props.varianceNotes}
                      onChange={(e) => props.onVarianceNotesChange(e.target.value)}
                      rows={3}
                      disabled={props.busy}
                      placeholder="Ej. material duro, retrabajo, cambio de herramienta…"
                      className="mt-1 w-full resize-y rounded-lg border border-amber-200 bg-white px-3 py-2 text-[13px] text-slate-900"
                    />
                    {props.piece.maquinado_time_variance_notes && !props.varianceNotes.trim() ? (
                      <p className="mt-1 text-[11px] text-amber-900/70">
                        Programación dejó notas: {props.piece.maquinado_time_variance_notes}
                      </p>
                    ) : null}
                  </label>
                ) : null}
                <button
                  type="button"
                  disabled={props.busy}
                  className={`${btn} w-full ${maquinadoUi.btnArmado}`}
                  onClick={() => void props.onFinishMaquinado('armado')}
                >
                  Terminación de maquinado → Armado
                </button>
                <p className="-mt-1 text-[11px] leading-relaxed text-amber-900/70">
                  La pieza pasa a la cola de <strong>ensamble</strong> en taller.
                </p>
                <button
                  type="button"
                  disabled={props.busy}
                  className={`${btn} w-full ${maquinadoUi.btnDetallado}`}
                  onClick={() => void props.onFinishMaquinado('detallado')}
                >
                  Terminación de maquinado → Detallado
                </button>
                <p className="-mt-1 text-[11px] leading-relaxed text-amber-900/70">
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
