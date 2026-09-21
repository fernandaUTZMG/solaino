import { useEffect, useMemo, useState } from 'react'
import type { AppRole } from '../../lib/roles'
import {
  aggregateBusinessMinutesByLane,
  workLaneElapsedSeconds,
  type BodegaWorkIntervalRow,
} from '../../lib/bodegaWorkIntervalsRepo'
import { BodegaLiveClock } from './BodegaLiveClock.tsx'
import { useLiveClockTick } from './useLiveClockTick.ts'
import { updateDesignContratiempoNotes } from '../../lib/bodegaPiecesRepo'
import {
  computeDesignTimeRounds,
  designClockPausedForReview,
  designClockShouldBeActive,
  formatDesignTimeSummary,
  totalDesignBusinessMinutes,
} from '../../lib/bodegaDesignTimeBreakdown'
import { formatWorkMinutesShort } from '../../lib/bodegaWorkIntervalsRepo'
import { disenoSeccion, disenoTitulo } from './bodegaDisenoUi.ts'

type Props = {
  embedded?: boolean
  role: AppRole
  projectId: string
  projectStatus: string
  ordenCompraNumero: string | null
  sinOrdenCompra: boolean
  onLinkOrdenCompra?: () => void
  workIntervals: BodegaWorkIntervalRow[]
  designContratiempoNotes: string | null
  onReloadMeta: () => Promise<void>
  onSaved?: () => void
  hideOrdenClock?: boolean
  idleClockHint?: string
}

export function BodegaProjectClockPanel(props: Props) {
  const [contratiempoDraft, setContratiempoDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    setContratiempoDraft(props.designContratiempoNotes ?? '')
  }, [props.designContratiempoNotes])

  const minsByLane = useMemo(
    () => aggregateBusinessMinutesByLane(props.workIntervals, new Date()),
    [props.workIntervals],
  )

  const designRows = useMemo(
    () => props.workIntervals.filter((r) => r.lane === 'diseno'),
    [props.workIntervals],
  )

  const designRounds = useMemo(() => computeDesignTimeRounds(props.workIntervals), [props.workIntervals])

  const designOpen = designRows.some((r) => !r.ended_at)
  const ordenOpen = props.workIntervals.some((r) => r.lane === 'orden' && !r.ended_at)
  const clockTicking = designOpen || ordenOpen
  const clockNow = useLiveClockTick(clockTicking)
  const designElapsedSec = workLaneElapsedSeconds(props.workIntervals, 'diseno', clockNow)
  const ordenElapsedSec = workLaneElapsedSeconds(props.workIntervals, 'orden', clockNow)

  const designPhaseActive = designClockShouldBeActive(props.projectStatus)
  const designPausedReview = designClockPausedForReview(props.projectStatus)

  const designEstado = designOpen
    ? designPausedReview
      ? 'Pausado (revisión)'
      : 'Activo'
    : designRows.length > 0
      ? designPhaseActive
        ? 'Listo para corrección'
        : 'Cerrado'
      : 'Sin iniciar'

  const designHint = designOpen
    ? designPausedReview
      ? 'Reloj pausado mientras el supervisor revisa la entrega.'
      : 'Reloj activo — tiempo de diseño o corrección en curso.'
    : designEstado === 'Listo para corrección'
      ? 'Abre la pestaña Diseño para registrar la corrección.'
      : designEstado === 'Cerrado'
        ? 'Tiempo de diseño cerrado (entrega en revisión o proyecto aprobado).'
        : (props.idleClockHint ?? 'Se inicia al entrar al proyecto.')

  async function saveContratiempo() {
    if (props.role !== 'disenadora') return
    setBusy(true)
    setErr(null)
    try {
      await updateDesignContratiempoNotes(props.projectId, contratiempoDraft.trim() || null)
      await props.onReloadMeta()
      setErr(null)
      props.onSaved?.()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se guardaron las notas')
    } finally {
      setBusy(false)
    }
  }

  const showContratiempoEdit =
    props.role === 'disenadora' && designPhaseActive && !designPausedReview

  const savedContratiempo = props.designContratiempoNotes?.trim() ?? ''

  const inner = (
    <>
      {props.sinOrdenCompra && props.onLinkOrdenCompra ? (
        <div className="mb-3">
          <button
            type="button"
            className="w-full rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-[12px] font-semibold text-sky-900 hover:bg-sky-100"
            onClick={props.onLinkOrdenCompra}
          >
            Vincular o adjuntar orden de compra
          </button>
        </div>
      ) : null}
      <div className={props.hideOrdenClock ? '' : 'grid gap-4 sm:grid-cols-2'}>
        {props.hideOrdenClock ? null : (
          <BodegaLiveClock
            seconds={ordenElapsedSec}
            active={ordenOpen}
            label="Orden de compra"
            hint={props.sinOrdenCompra ? 'Sin OC vinculada' : props.ordenCompraNumero ?? '—'}
            businessMinutes={minsByLane.get('orden') ?? 0}
            businessMinutesLabel="Min. hábiles"
            tone="slate"
          />
        )}
        <BodegaLiveClock
          seconds={designRows.length > 0 ? designElapsedSec : 0}
          active={designOpen}
          label="Diseño"
          hint={designHint}
          idleLabel={props.idleClockHint ?? 'Se inicia al abrir esta pestaña'}
          businessMinutes={designRows.length > 0 ? totalDesignBusinessMinutes(designRounds) : undefined}
          businessMinutesLabel="Total min. hábiles"
          tone="navy"
        />
      </div>

      {designRounds.length > 0 ? (
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-300 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-100 px-4 py-2.5">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-700">
              Desglose de tiempos de diseño
            </p>
            <span className="rounded-lg bg-section-navy px-2.5 py-1 text-[12px] font-bold text-white">
              {formatDesignTimeSummary(designRounds)}
            </span>
          </div>
          <ul className="space-y-2 p-3">
            {designRounds.map((round, idx) => (
              <li
                key={`${round.startedAt}-${idx}`}
                className={[
                  'flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2',
                  round.isOpen
                    ? 'border-sky-300 bg-sky-50'
                    : 'border-slate-200 bg-slate-50',
                ].join(' ')}
              >
                <div>
                  <p className="text-[13px] font-semibold text-slate-900">{round.label}</p>
                  <p className="text-[11px] text-slate-500">
                    {round.isOpen ? 'En curso' : 'Cerrado'} ·{' '}
                    {new Date(round.startedAt).toLocaleString('es-MX', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </p>
                </div>
                <span
                  className={[
                    'font-mono text-[13px] font-bold',
                    round.isOpen ? 'text-section-navy' : 'text-slate-700',
                  ].join(' ')}
                >
                  {formatWorkMinutesShort(round.businessMinutes)}
                </span>
              </li>
            ))}
          </ul>
          <p className="border-t border-slate-200 bg-slate-50 px-4 py-2.5 text-[11px] leading-relaxed text-slate-600">
            Estado: <strong>{designEstado}</strong>. Minutos hábiles lun–vie 8:00–17:30. Cada entrega .x_t pausa el
            reloj; las correcciones abren una nueva ronda.
          </p>
        </div>
      ) : null}

      {err ? <p className="border-t border-rose-100 bg-rose-50 px-4 py-2 text-[13px] text-rose-900">{err}</p> : null}

      {showContratiempoEdit ? (
        <div className="border-t border-slate-100 px-4 py-3">
          <label className="block text-[12px] font-semibold text-slate-700">Nota de contratiempo</label>
          <textarea
            value={contratiempoDraft}
            onChange={(e) => setContratiempoDraft(e.target.value)}
            rows={2}
            disabled={busy}
            className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-[14px] outline-none focus:ring-2 focus:ring-section-navy/20"
          />
          <button
            type="button"
            disabled={busy}
            className="mt-2 rounded-lg bg-section-navy px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-50"
            onClick={() => void saveContratiempo()}
          >
            {busy ? 'Guardando…' : 'Guardar nota'}
          </button>
        </div>
      ) : savedContratiempo ? (
        <div className="border-t border-slate-100 bg-slate-50/80 px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Nota de contratiempo</p>
          <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-slate-800">{savedContratiempo}</p>
        </div>
      ) : null}
    </>
  )

  if (props.embedded) return inner

  return (
    <section className={disenoSeccion}>
      <h3 className={disenoTitulo}>Tiempos</h3>
      {inner}
    </section>
  )
}
