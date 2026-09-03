import {
  PROJECT_PRIORIDAD_OPTIONS,
  type ProjectPrioridadNivel,
} from '../../lib/bodegaProjectPrioridad'
import { BodegaProjectPrioridadBadge } from './BodegaProjectPrioridadBadge.tsx'

type Props = {
  nivel: ProjectPrioridadNivel
  canEdit: boolean
  busy?: boolean
  compact?: boolean
  id?: string
  onChange: (nivel: ProjectPrioridadNivel) => void
}

export function BodegaProjectPrioridadControl(props: Props) {
  if (!props.canEdit) {
    return <BodegaProjectPrioridadBadge nivel={props.nivel} />
  }

  return (
    <label className={props.compact ? 'inline-flex min-w-0 flex-col gap-0.5' : 'block min-w-0'}>
      {!props.compact ? (
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Prioridad del proyecto</span>
      ) : null}
      <select
        id={props.id}
        value={props.nivel}
        disabled={props.busy}
        title="Define qué tan urgente es este proyecto frente a otros de distintas órdenes de compra"
        className={[
          'rounded-lg border border-slate-200 bg-white font-semibold text-slate-900 shadow-sm outline-none transition',
          'focus:border-sky-400 focus:ring-2 focus:ring-sky-300/35 disabled:cursor-not-allowed disabled:opacity-60',
          props.compact ? 'max-w-[11rem] px-2 py-1.5 text-[11px]' : 'mt-1 min-h-[40px] w-full max-w-xs px-3 py-2 text-[13px]',
        ].join(' ')}
        onChange={(e) => props.onChange(Number(e.target.value) as ProjectPrioridadNivel)}
      >
        {PROJECT_PRIORIDAD_OPTIONS.map((o) => (
          <option key={o.nivel} value={o.nivel}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}
