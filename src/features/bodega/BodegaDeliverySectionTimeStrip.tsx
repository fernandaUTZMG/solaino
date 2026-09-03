import {
  DELIVERY_TAB_SECTION_LABEL,
  deliveryTabHasOpenInterval,
  formatDeliveryTabTime,
  type BodegaDeliveryTabId,
} from '../../lib/bodegaDeliveryTabTimes'
import type { BodegaPieceIntervalRow } from '../../lib/bodegaPieceIntervalsRepo'
import type { BodegaWorkIntervalRow } from '../../lib/bodegaWorkIntervalsRepo'
import type { ProjectOrdenTimeBreakdown } from '../../lib/bodegaProjectOrdenTimes'
import { deliveryTabTheme } from './bodegaDeliveryTabTheme.ts'

type Props = {
  tab: BodegaDeliveryTabId
  times: ProjectOrdenTimeBreakdown | null
  loading?: boolean
  detail?: string
  workIntervals?: BodegaWorkIntervalRow[]
  pieceIntervals?: BodegaPieceIntervalRow[]
}

export function BodegaDeliverySectionTimeStrip(props: Props) {
  const theme = deliveryTabTheme(props.tab)
  const label = DELIVERY_TAB_SECTION_LABEL[props.tab]
  const times = props.times
  const display = props.loading ? '…' : times ? formatDeliveryTabTime(times, props.tab) : '—'
  const tabOpen =
    props.workIntervals != null && props.pieceIntervals != null
      ? deliveryTabHasOpenInterval(props.tab, props.workIntervals, props.pieceIntervals)
      : Boolean(times?.hasOpenInterval)

  return (
    <div
      className={[
        'mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 shadow-sm',
        theme.avanceBox,
      ].join(' ')}
      role="status"
      aria-label={`Tiempo en ${label}: ${display}`}
    >
      <div className="min-w-0">
        <p className={[theme.headerTitle, 'text-[11px] uppercase tracking-wide'].join(' ')}>
          Tiempo en {label}
        </p>
        {props.detail ? (
          <p className={[theme.headerSubtitle, 'mt-0.5 text-[11px]'].join(' ')}>{props.detail}</p>
        ) : (
          <p className={[theme.headerSubtitle, 'mt-0.5 text-[11px]'].join(' ')}>
            Minutos hábiles (lun–vie, horario de planta)
            {tabOpen ? ' · hay reloj en curso' : ''}
          </p>
        )}
      </div>
      <p className="shrink-0 font-mono text-[20px] font-bold tabular-nums text-slate-900 sm:text-[22px]">
        {display}
      </p>
    </div>
  )
}
