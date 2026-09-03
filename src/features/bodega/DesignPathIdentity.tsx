import {
  designPathModelBadge,
  displayLabelFromDesignPath,
} from '../../lib/designZipScope'
import { labelFromZipPath } from '../../lib/zipDesignPackage'

type Props = {
  path: string
  /** Mapa kit → nombre del ZIP (opcional, para etiquetas más claras). */
  kitLabels?: ReadonlyMap<string, string> | Record<string, string>
  /** Tamaño compacto para tarjetas del kanban. */
  compact?: boolean
  className?: string
}

export function DesignPathIdentity(props: Props) {
  const title = displayLabelFromDesignPath(props.path, props.kitLabels)
  const badge = designPathModelBadge(props.path, props.kitLabels)
  const fileOnly = labelFromZipPath(props.path)

  if (props.compact) {
    return (
      <div className={props.className}>
        {badge ? (
          <span className="mb-1 inline-flex rounded-md bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-900">
            {badge}
          </span>
        ) : null}
        <p className="font-semibold text-slate-900">{title}</p>
        {title !== fileOnly ? (
          <p className="mt-0.5 font-mono text-[10px] text-slate-500">{fileOnly}</p>
        ) : null}
      </div>
    )
  }

  return (
    <div className={props.className}>
      <div className="flex flex-wrap items-center gap-2">
        {badge ? (
          <span className="inline-flex rounded-lg bg-indigo-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-indigo-900">
            Modelo {badge}
          </span>
        ) : null}
        <p className="font-semibold text-slate-900">{title}</p>
      </div>
      <p className="mt-0.5 truncate font-mono text-[11px] text-slate-500" title={props.path}>
        {props.path}
      </p>
    </div>
  )
}
