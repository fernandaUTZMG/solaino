import type { AppRole } from '../../lib/roles'
import type { ProjectActivityRow } from '../../lib/projectActivityRepo'
import { deliveryTabTheme, type BodegaDeliveryTabId } from './bodegaDeliveryTabTheme.ts'
import { BodegaProjectAvanceNotasPanel } from './BodegaProjectAvanceNotasPanel.tsx'
import { BodegaProjectActivityHistorial } from './BodegaProjectActivityHistorial.tsx'

type Props = {
  tab: BodegaDeliveryTabId
  role: AppRole
  avancePct: number
  operationalAvancePct?: number | null
  operationalStageLabel?: string | null
  manualAvanceInput: string
  onManualAvanceInputChange: (value: string) => void
  manualAvanceBusy: boolean
  loading: boolean
  designCommentDraft: string
  onDesignCommentDraftChange: (value: string) => void
  onSaveManualAvance: () => void
  commentSaveBusy?: boolean
  onSaveComment?: () => void
  activities: ProjectActivityRow[]
  formatDateTime: (d: Date) => string
}

const TAB_LABEL: Record<BodegaDeliveryTabId, string> = {
  diseno: 'Diseño',
  cnc: 'Programación',
  maquinado: 'Maquinado',
  taller: 'Taller',
  fotos: 'Fotos',
  piezas: 'Piezas',
}

export function BodegaProjectSeguimientoSection(props: Props) {
  const theme = deliveryTabTheme(props.tab)
  const activityCount = props.activities.length

  const { activities, formatDateTime, tab, ...avanceProps } = props

  return (
    <section className={[theme.section, 'shadow-md ring-1 ring-slate-900/[0.04]'].join(' ')} aria-label="Seguimiento del proyecto">
      <div
        className={[
          'flex flex-col gap-2 border-b px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6',
          theme.header,
        ].join(' ')}
      >
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] opacity-75">Seguimiento</p>
          <h3 className="text-[16px] font-bold leading-tight sm:text-[17px]">
            Notas y historial — {TAB_LABEL[props.tab]}
          </h3>
          <p className="mt-1 max-w-2xl text-[12px] leading-relaxed opacity-90">
            Registra avance o comentarios a la izquierda; a la derecha ves todo lo guardado en el proyecto.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <span className="rounded-lg border border-white/40 bg-white/60 px-3 py-1.5 text-[11px] font-bold text-slate-800 shadow-sm backdrop-blur-sm">
            Avance manual {props.avancePct}%
          </span>
          <span
            className={[
              'rounded-lg border px-3 py-1.5 text-[11px] font-bold',
              theme.historialBadge,
            ].join(' ')}
          >
            {activityCount} evento{activityCount === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      <div className="grid gap-0 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:divide-x lg:divide-slate-200/90">
        <div className="min-w-0 bg-slate-50/40">
          <BodegaProjectAvanceNotasPanel variant="embedded" tab={tab} {...avanceProps} />
        </div>
        <div className="min-w-0 border-t border-slate-200/90 bg-white lg:border-t-0">
          <BodegaProjectActivityHistorial
            variant="embedded"
            tab={tab}
            activities={activities}
            formatDateTime={formatDateTime}
          />
        </div>
      </div>
    </section>
  )
}
