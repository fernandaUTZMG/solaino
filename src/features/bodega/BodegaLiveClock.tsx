import { formatSecondsAsHms } from '../../lib/maquinadoEstimatedTime'

type Props = {
  seconds: number
  active: boolean
  label?: string
  hint?: string
  /** Minutos hábiles acumulados (opcional, texto pequeño). */
  businessMinutes?: number
  businessMinutesLabel?: string
  tone?: 'default' | 'pink' | 'programacion' | 'teal' | 'amber' | 'slate'
  className?: string
}

const TONE_ACTIVE: Record<NonNullable<Props['tone']>, string> = {
  default: 'text-emerald-700 ring-emerald-300/60',
  pink: 'text-pink-700 ring-pink-300/60',
  programacion: 'text-programacion-700 ring-programacion-400/50',
  teal: 'text-teal-700 ring-teal-300/60',
  amber: 'text-amber-800 ring-amber-300/60',
  slate: 'text-slate-800 ring-slate-300/60',
}

const TONE_IDLE: Record<NonNullable<Props['tone']>, string> = {
  default: 'text-slate-700 ring-slate-200/80',
  pink: 'text-pink-900/80 ring-pink-200/80',
  programacion: 'text-programacion-900/80 ring-programacion-200/80',
  teal: 'text-teal-900/80 ring-teal-200/80',
  amber: 'text-amber-900/80 ring-amber-200/80',
  slate: 'text-slate-600 ring-slate-200/80',
}

export function BodegaLiveClock(props: Props) {
  const tone = props.tone ?? 'default'
  const display = formatSecondsAsHms(props.seconds)

  return (
    <div
      className={[
        'rounded-xl border bg-white/90 px-4 py-3.5 text-center shadow-sm ring-2',
        props.active ? TONE_ACTIVE[tone] : TONE_IDLE[tone],
        props.className ?? '',
      ].join(' ')}
      aria-live={props.active ? 'polite' : 'off'}
    >
      {props.label ? (
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] opacity-80">{props.label}</p>
      ) : null}
      <p
        className={[
          'mt-1 font-mono text-[32px] font-bold leading-none tabular-nums tracking-tight sm:text-[36px]',
          props.active ? 'animate-pulse' : '',
        ].join(' ')}
      >
        {display}
      </p>
      {props.active ? (
        <p className="mt-2 text-[11px] font-bold uppercase tracking-wide text-emerald-700">En curso</p>
      ) : props.seconds > 0 ? (
        <p className="mt-2 text-[11px] text-slate-500">Pausado / terminado</p>
      ) : (
        <p className="mt-2 text-[11px] text-slate-500">00:00:00 — pulsa Inicio</p>
      )}
      {props.hint ? <p className="mt-2 text-[12px] leading-snug opacity-85">{props.hint}</p> : null}
      {props.businessMinutes != null && props.businessMinutes > 0 ? (
        <p className="mt-1.5 font-mono text-[10px] text-slate-500">
          {props.businessMinutesLabel ?? 'Hábil'}: {Math.round(props.businessMinutes)} min
        </p>
      ) : null}
    </div>
  )
}
