import { formatBusinessMinutesShort } from '../../lib/bodegaProjectPhaseDurations'
import {
  ORDEN_TIME_SEGMENTS,
  ordenSegmentMinutes,
  type ProjectOrdenTimeBreakdown,
} from '../../lib/bodegaProjectOrdenTimes'

export function OrdenTimeLegend(props: { compact?: boolean }) {
  return (
    <div
      className={[
        'flex flex-wrap gap-2',
        props.compact ? 'text-[9px]' : 'text-[10px]',
      ].join(' ')}
    >
      {ORDEN_TIME_SEGMENTS.map((s) => (
        <span
          key={s.key}
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-white/80 px-2 py-0.5 font-semibold text-slate-700"
        >
          <span className={['h-2 w-3 shrink-0 rounded-sm', s.barClass].join(' ')} aria-hidden />
          {s.label}
        </span>
      ))}
    </div>
  )
}

export function OrdenTimeSegmentsBar(props: { times: ProjectOrdenTimeBreakdown; className?: string }) {
  const total = Math.max(props.times.totalTrackedMin, 1)
  const parts = ORDEN_TIME_SEGMENTS.map((s) => ({
    key: s.key,
    barClass: s.barClass,
    mins: ordenSegmentMinutes(props.times, s.key),
  })).filter((p) => p.mins > 0)

  const title = ORDEN_TIME_SEGMENTS.map(
    (s) => `${s.label} ${formatBusinessMinutesShort(ordenSegmentMinutes(props.times, s.key))}`,
  ).join(' · ')

  if (props.times.totalTrackedMin < 1) {
    return (
      <div
        className={[
          'flex h-2.5 w-full items-center justify-center rounded-full bg-slate-100 text-[9px] font-medium text-slate-500 ring-1 ring-slate-200/70',
          props.className ?? '',
        ].join(' ')}
        title="Sin tiempo registrado con reloj"
      >
        Sin reloj aún
      </div>
    )
  }

  return (
    <div
      className={['flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200/70', props.className ?? '']
        .filter(Boolean)
        .join(' ')}
      title={title}
      role="img"
      aria-label={title}
    >
      {parts.map((p) => (
        <div
          key={p.key}
          className={['h-full min-w-[2px]', p.barClass].join(' ')}
          style={{ width: `${(p.mins / total) * 100}%` }}
        />
      ))}
    </div>
  )
}

export function OrdenProjectTimeGrid(props: {
  times: ProjectOrdenTimeBreakdown
  compact?: boolean
}) {
  const compact = props.compact ?? false
  return (
    <div
      className={[
        'grid gap-1.5',
        compact ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-3',
      ].join(' ')}
    >
      {ORDEN_TIME_SEGMENTS.map((s) => {
        const mins = ordenSegmentMinutes(props.times, s.key)
        return (
          <div
            key={s.key}
            className={[
              'rounded-lg border px-2 py-1.5',
              s.borderClass,
              s.bgClass,
              compact ? 'min-h-[2.75rem]' : '',
            ].join(' ')}
          >
            <p className={['text-[9px] font-bold uppercase tracking-wide', s.textClass].join(' ')}>{s.label}</p>
            <p className={['mt-0.5 font-mono font-bold tabular-nums', compact ? 'text-[11px]' : 'text-[12px]', s.textClass].join(' ')}>
              {formatBusinessMinutesShort(mins)}
            </p>
          </div>
        )
      })}
    </div>
  )
}

export function OrdenTimesSummaryLine(props: { times: ProjectOrdenTimeBreakdown }) {
  return (
    <p className="text-[10px] font-semibold tabular-nums text-slate-700">
      Total registrado: {formatBusinessMinutesShort(props.times.totalTrackedMin)}
      {props.times.hasOpenInterval ? (
        <span className="ml-1.5 inline-flex items-center rounded-full bg-sky-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-sky-800">
          En curso
        </span>
      ) : null}
    </p>
  )
}
