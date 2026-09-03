import type { ProjectOrdenTimeBreakdown } from '../../lib/bodegaProjectOrdenTimes'
import {
  OrdenProjectTimeGrid,
  OrdenTimeLegend,
  OrdenTimeSegmentsBar,
  OrdenTimesSummaryLine,
} from './BodegaOrdenTimesUi.tsx'

type Props = {
  times: ProjectOrdenTimeBreakdown
  closureReview?: boolean
}

export function BodegaProjectDeliveryTimesSummary(props: Props) {
  return (
    <section className="overflow-hidden rounded-2xl border-2 border-sky-300/90 bg-white shadow-md ring-1 ring-sky-900/[0.04]">
      <div className="border-b border-sky-200/80 bg-gradient-to-r from-sky-50 via-white to-sky-50/40 px-5 py-4 sm:px-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-sky-800">
          {props.closureReview ? 'Revisión de cierre — tiempos del proyecto' : 'Tiempos del proyecto'}
        </p>
        <p className="mt-1 text-[13px] leading-relaxed text-sky-950/90">
          {props.closureReview
            ? 'La programadora solicitó cierre. Revisa el total en cada etapa antes de marcar terminado.'
            : 'Suma de relojes por pieza y por proyecto en cada etapa del flujo.'}
        </p>
        <div className="mt-3">
          <OrdenTimesSummaryLine times={props.times} />
        </div>
      </div>
      <div className="space-y-4 px-5 py-4 sm:px-6 sm:py-5">
        <OrdenTimeSegmentsBar times={props.times} />
        <OrdenTimeLegend />
        <OrdenProjectTimeGrid times={props.times} />
      </div>
    </section>
  )
}
