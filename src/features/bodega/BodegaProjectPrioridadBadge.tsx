import {
  hasProjectPrioridad,
  prioridadMeta,
  type ProjectPrioridadNivel,
} from '../../lib/bodegaProjectPrioridad'

type Props = {
  nivel: ProjectPrioridadNivel
  className?: string
}

export function BodegaProjectPrioridadBadge(props: Props) {
  if (!hasProjectPrioridad(props.nivel)) return null
  const meta = prioridadMeta(props.nivel)
  return (
    <span
      className={[
        'inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
        meta.badgeClass,
        props.className ?? '',
      ].join(' ')}
      title={meta.label}
    >
      {meta.short}
    </span>
  )
}
