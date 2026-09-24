import { formatSecondsAsHms } from '../../lib/maquinadoEstimatedTime'

type Props = {
  seconds: number
  active: boolean
  label?: string
  hint?: string
  /** Minutos hábiles acumulados (opcional, texto pequeño). */
  businessMinutes?: number
  businessMinutesLabel?: string
  tone?: 'default' | 'pink' | 'programacion' | 'teal' | 'amber' | 'slate' | 'navy'
  idleLabel?: string
  className?: string
}

const TONE_ACTIVE: Record<NonNullable<Props['tone']>, string> = {
  default: 'border-emerald-300 bg-white text-emerald-800 ring-emerald-300/60',
  pink: 'border-pink-300 bg-white text-pink-700 ring-pink-300/60',
  programacion: 'border-programacion-300 bg-white text-programacion-800 ring-programacion-400/50',
  teal: 'border-teal-300 bg-white text-teal-800 ring-teal-300/60',
  amber: 'border-amber-300 bg-white text-amber-900 ring-amber-300/60',
  slate: 'border-slate-300 bg-white text-slate-800 ring-slate-300/60',
  navy: 'border-section-navy bg-section-navy text-white ring-sky-400/40',
}

const TONE_IDLE: Record<NonNullable<Props['tone']>, string> = {
  default: 'border-slate-200 bg-white text-slate-700 ring-slate-200/80',
  pink: 'border-pink-200 bg-white text-pink-900/80 ring-pink-200/80',
  programacion: 'border-programacion-200 bg-white text-programacion-900/80 ring-programacion-200/80',
  teal: 'border-teal-200 bg-white text-teal-900/80 ring-teal-200/80',
  amber: 'border-amber-200 bg-white text-amber-900/80 ring-amber-200/80',
  slate: 'border-slate-300 bg-slate-50 text-slate-700 ring-slate-200/80',
  navy: 'border-slate-300 bg-slate-100 text-section-navy ring-slate-300/70',
}

export function BodegaLiveClock(props: Props) {
  const tone = props.tone ?? 'default'
  const display = formatSecondsAsHms(props.seconds)

  return (
    <div
      className={[
        'rounded-xl border px-4 py-3.5 text-center shadow-sm ring-2',
        props.active ? TONE_ACTIVE[tone] : TONE_IDLE[tone],
        props.className ?? '',
      ].join(' ')}
      aria-live={props.active ? 'polite' : 'off'}
    >
      {props.label ? (
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] opacity-80">{props.label}</p>
      ) : null}
      <p
        className="mt-1 font-mono text-[32px] font-bold leading-none tabular-nums tracking-tight sm:text-[36px]"
      >
        {display}
      </p>
      {props.active ? (
        <p className={['mt-2 text-[11px] font-bold uppercase tracking-wide', tone === 'navy' ? 'text-emerald-300' : 'text-emerald-700'].join(' ')}>
          En curso
        </p>
      ) : props.seconds > 0 ? (
        <p className={['mt-2 text-[11px] font-semibold', tone === 'navy' ? 'text-slate-600' : 'text-slate-500'].join(' ')}>
          Pausado / terminado
        </p>
      ) : (
        <p className={['mt-2 text-[11px] font-semibold', tone === 'navy' ? 'text-slate-600' : 'text-slate-500'].join(' ')}>
          {props.idleLabel ?? 'Aún no inicia'}
        </p>
      )}
      {props.hint ? <p className="mt-2 text-[12px] leading-snug opacity-85">{props.hint}</p> : null}
      {props.businessMinutes != null && props.businessMinutes > 0 ? (
        <p className={['mt-1.5 font-mono text-[10px]', props.active && tone === 'navy' ? 'text-sky-200' : 'text-slate-500'].join(' ')}>
          {props.businessMinutesLabel ?? 'Hábil'}: {Math.round(props.businessMinutes)} min
        </p>
      ) : null}
    </div>
  )
}
