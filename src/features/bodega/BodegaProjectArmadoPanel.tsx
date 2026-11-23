import { useEffect, useMemo, useState } from 'react'
import {
  markProjectPiecesArmadoCompleted,
  type BodegaProjectPieceRow,
} from '../../lib/bodegaPiecesRepo'
import {
  pieceNotReadyForProjectArmado,
  projectArmadoBusinessSeconds,
  projectArmadoClockClosed,
  projectArmadoClockOpen,
  projectArmadoClockPaused,
  projectPiecesReadyForArmado,
} from '../../lib/bodegaProjectArmado'
import { closeWorkInterval, tagLatestArmadoStop } from '../../lib/bodegaWorkIntervalClose'
import {
  fetchWorkIntervals,
  startWorkInterval,
  type BodegaWorkIntervalRow,
} from '../../lib/bodegaWorkIntervalsRepo'
import { formatSecondsAsHms } from '../../lib/maquinadoEstimatedTime'
import { useLiveClockTick } from './useLiveClockTick.ts'

type Props = {
  projectId: string
  projectFolio: string
  projectName?: string | null
  pieces: BodegaProjectPieceRow[]
  loading?: boolean
  onReload?: () => Promise<void>
}

export function BodegaProjectArmadoPanel(props: Props) {
  const [intervals, setIntervals] = useState<BodegaWorkIntervalRow[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const open = projectArmadoClockOpen(intervals)
  const paused = projectArmadoClockPaused(intervals)
  const closed =
    projectArmadoClockClosed(intervals) ||
    (props.pieces.length > 0 && props.pieces.every((piece) => piece.armado_completed_at != null))
  const now = useLiveClockTick(open)
  const seconds = projectArmadoBusinessSeconds(intervals, now)
  const ready = projectPiecesReadyForArmado(props.pieces)
  const waiting = useMemo(
    () => props.pieces.filter((p) => pieceNotReadyForProjectArmado(p) != null),
    [props.pieces],
  )
  const sorted = useMemo(
    () => [...props.pieces].sort((a, b) => a.label.localeCompare(b.label, 'es')),
    [props.pieces],
  )

  useEffect(() => {
    let cancelled = false
    void fetchWorkIntervals(props.projectId).then((rows) => {
      if (!cancelled) setIntervals(rows)
    })
    return () => {
      cancelled = true
    }
  }, [props.projectId, props.pieces])

  async function reloadIntervals() {
    setIntervals(await fetchWorkIntervals(props.projectId))
  }

  async function onStart() {
    if (open || closed) return
    if (!paused && !ready) return
    setBusy(true)
    setErr(null)
    try {
      await startWorkInterval(props.projectId, 'armado')
      await reloadIntervals()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se inició el armado')
    } finally {
      setBusy(false)
    }
  }

  async function onPause() {
    if (!open) return
    setBusy(true)
    setErr(null)
    try {
      await closeWorkInterval(props.projectId, 'armado', { armado_stop: 'pause' })
      await tagLatestArmadoStop(props.projectId, 'pause')
      await reloadIntervals()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se detuvo el armado')
    } finally {
      setBusy(false)
    }
  }

  async function onFinish() {
    if (!open && !paused) return
    setBusy(true)
    setErr(null)
    try {
      if (open) await closeWorkInterval(props.projectId, 'armado', { armado_stop: 'fin' })
      await tagLatestArmadoStop(props.projectId, 'fin')
      await markProjectPiecesArmadoCompleted(props.pieces.map((p) => p.id))
      await reloadIntervals()
      await props.onReload?.()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se cerró el armado')
    } finally {
      setBusy(false)
    }
  }

  if (props.loading) {
    return <p className="text-[13px] text-slate-600">Cargando piezas del armado…</p>
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm sm:p-5">
        <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-800">Armado del proyecto</p>
        <h3 className="mt-1 text-[18px] font-bold text-slate-900">
          <span className="font-mono">{props.projectFolio}</span>
          {props.projectName ? <span className="font-medium text-slate-700"> · {props.projectName}</span> : null}
        </h3>
        <p className="mt-2 text-[13px] leading-relaxed text-slate-600">
          Aquí están las {props.pieces.length} piezas de este proyecto. El reloj es uno solo: cuánto se tardó en armarlo.
          Parar detiene el tiempo. Continuar lo vuelve a correr. Fin cierra el armado y pasa a la foto.
        </p>
        <p className="mt-4 font-mono text-[28px] font-bold tabular-nums text-emerald-900">
          {formatSecondsAsHms(seconds)}
        </p>
        <p className="text-[12px] text-slate-500">Horario de oficina, lun–vie 8:00–17:30.</p>
        {err ? <p className="mt-3 text-[13px] text-rose-700">{err}</p> : null}
        {closed ? (
          <p className="mt-4 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-950">
            Armado terminado. En <strong>Fotos</strong> sube la foto del armado para finalizar el proyecto.
          </p>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2">
            {!open ? (
              <button
                type="button"
                disabled={busy || (!paused && !ready)}
                className="min-h-[44px] rounded-xl bg-emerald-700 px-5 py-2.5 text-[14px] font-bold text-white shadow-sm hover:bg-emerald-800 disabled:opacity-50"
                onClick={() => void onStart()}
              >
                {paused ? 'Continuar' : 'Inicio'}
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                className="min-h-[44px] rounded-xl border border-amber-400 bg-amber-50 px-5 py-2.5 text-[14px] font-bold text-amber-950 shadow-sm hover:bg-amber-100 disabled:opacity-50"
                onClick={() => void onPause()}
              >
                Parar
              </button>
            )}
            {open || paused ? (
              <button
                type="button"
                disabled={busy}
                className="min-h-[44px] rounded-xl bg-emerald-950 px-5 py-2.5 text-[14px] font-bold text-white shadow-sm hover:brightness-110 disabled:opacity-50"
                onClick={() => void onFinish()}
              >
                Fin
              </button>
            ) : null}
          </div>
        )}
        {paused && !closed ? (
          <p className="mt-3 text-[13px] font-semibold text-amber-900">En pausa. El tiempo está detenido.</p>
        ) : null}
        {!ready && !closed ? (
          <p className="mt-3 text-[13px] text-amber-900">
            Faltan {waiting.length} pieza{waiting.length === 1 ? '' : 's'} por llegar. El armado empieza cuando estén
            todas.
          </p>
        ) : null}
      </div>

      <ul className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {sorted.length === 0 ? (
          <li className="px-4 py-6 text-[13px] text-slate-600">Este proyecto no tiene piezas.</li>
        ) : null}
        {sorted.map((p) => {
          const block = pieceNotReadyForProjectArmado(p)
          return (
            <li key={p.id} className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 last:border-0">
              <span className="min-w-0 truncate font-semibold text-slate-900">{p.label}</span>
              <span
                className={[
                  'shrink-0 rounded-lg px-2 py-1 text-[11px] font-bold',
                  block ? 'bg-amber-50 text-amber-900' : 'bg-emerald-50 text-emerald-900',
                ].join(' ')}
              >
                {block ?? 'Lista'}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
