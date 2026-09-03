import { splitProduccionSemanalLines } from '../../lib/bodegaProduccionSemanalFormat'

const TASK_COLORS = ['text-sky-800', 'text-amber-700'] as const
const PROJECTOR_TASK_COLORS = ['#1d4ed8', '#c2410c'] as const

type Variant = 'board' | 'projector'

export function ProduccionSemanalTaskList(props: { text: string; variant?: Variant }) {
  const lines = splitProduccionSemanalLines(props.text)
  const projector = props.variant === 'projector'

  if (lines.length === 0) {
    return <span className={projector ? 'text-slate-500' : 'text-slate-400'}>—</span>
  }

  return (
    <div className="flex flex-col">
      {lines.map((line, i) => (
        <div
          key={`${i}-${line.slice(0, 32)}`}
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
            {line}
          </span>
        </div>
      ))}
    </div>
  )
}
