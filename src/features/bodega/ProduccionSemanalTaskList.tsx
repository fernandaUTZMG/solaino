import { splitProduccionSemanalLines } from '../../lib/bodegaProduccionSemanalFormat'
import {
  armadoHelpersLabel,
  taskProgressBadge,
  type ProduccionLiveBadge,
  type ProduccionLiveTone,
  type ProduccionProjectLive,
  type ProduccionSemanalTask,
  type ProduccionTaskLane,
} from '../../lib/bodegaProduccionSemanalTasks'

const TASK_COLORS = ['text-sky-800', 'text-amber-700'] as const
const PROJECTOR_TASK_COLORS = ['#1d4ed8', '#c2410c'] as const

const TONE_CLASS: Record<ProduccionLiveTone, string> = {
  done: 'bg-emerald-100 text-emerald-950',
  progress: 'bg-sky-100 text-sky-950',
  wait: 'bg-amber-100 text-amber-950',
  idle: 'bg-slate-100 text-slate-600',
}

type Variant = 'board' | 'projector'

export function ProduccionSemanalTaskList(props: {
  text?: string
  tasks?: ProduccionSemanalTask[]
  lane?: ProduccionTaskLane
  liveByProject?: Map<string, ProduccionProjectLive>
  variant?: Variant
}) {
  const lines = props.tasks ?? splitProduccionSemanalLines(props.text ?? '').map((text) => ({
    text,
    projectId: null,
    manual: null,
    helpers: [],
  }))
  const projector = props.variant === 'projector'

  if (lines.length === 0) {
    return <span className={projector ? 'text-slate-500' : 'text-slate-400'}>—</span>
  }

  return (
    <div className="flex flex-col">
      {lines.map((line, i) => {
        const badge = props.lane ? taskProgressBadge(line, props.lane, props.liveByProject) : null
        const helped = armadoHelpersLabel(line.helpers)
        return (
          <div
            key={`${i}-${line.text.slice(0, 32)}`}
            className={[
              projector
                ? 'py-2.5 text-[clamp(10px,1.05vw,15px)] leading-snug text-black'
                : 'py-2 text-[13px] leading-snug',
              i < lines.length - 1
                ? projector
                  ? 'border-b border-black'
                  : 'border-b border-slate-300/90'
                : '',
            ].join(' ')}
          >
            <span
              className={projector ? undefined : TASK_COLORS[i % TASK_COLORS.length]}
              style={projector ? { color: PROJECTOR_TASK_COLORS[i % PROJECTOR_TASK_COLORS.length] } : undefined}
            >
              {line.text}
            </span>
            {helped ? (
              <p className={projector ? 'mt-0.5 text-[11px] font-semibold text-black' : 'mt-0.5 text-[11px] font-semibold text-slate-700'}>
                {helped}
              </p>
            ) : null}
            {badge ? <ProduccionProgressDetail badge={badge} variant={projector ? 'projector' : 'board'} /> : null}
          </div>
        )
      })}
    </div>
  )
}

export function ProduccionProgressDetail(props: { badge: ProduccionLiveBadge; variant?: Variant | 'edit' }) {
  const projector = props.variant === 'projector'
  const pieces = props.badge.pieces
  return (
    <div className={projector ? 'mt-1' : 'mt-1.5'}>
      <span
        className={[
          'block w-fit max-w-full rounded px-1.5 py-0.5 font-bold leading-snug',
          projector ? 'bg-slate-100 text-[11px] text-black' : `text-[10px] ${TONE_CLASS[props.badge.tone]}`,
        ].join(' ')}
      >
        {props.badge.label}
      </span>
      {props.badge.percent != null ? (
        <div className="mt-1 h-1.5 w-full max-w-[9rem] overflow-hidden rounded-full bg-slate-200">
          <div
            className={props.badge.percent >= 100 ? 'h-full bg-emerald-600' : 'h-full bg-sky-700'}
            style={{ width: `${props.badge.percent}%` }}
          />
        </div>
      ) : null}
      {pieces.length > 0 ? (
        <ul className={projector ? 'mt-1 max-h-24 space-y-0.5 overflow-auto' : 'mt-1 max-h-28 space-y-0.5 overflow-auto'}>
          {pieces.map((piece, index) => (
            <li
              key={`${index}-${piece.name}`}
              title={piece.timeLabel ? `${piece.name} · ${piece.timeLabel}` : piece.name}
              className={[
                'flex items-baseline justify-between gap-2 text-[10px] font-semibold leading-tight',
                piece.done ? 'text-emerald-800' : 'text-amber-800',
              ].join(' ')}
            >
              <span className="min-w-0 truncate">
                {piece.done ? 'Lista' : 'Falta'} · {piece.name}
              </span>
              {piece.timeLabel ? <span className="shrink-0 tabular-nums">{piece.timeLabel}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
