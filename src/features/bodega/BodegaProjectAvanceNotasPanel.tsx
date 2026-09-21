import type { AppRole } from '../../lib/roles'
import { canSaveBodegaProjectNote } from '../../lib/roles'
import { deliveryTabTheme, type BodegaDeliveryTabId } from './bodegaDeliveryTabTheme.ts'

const COPY: Record<BodegaDeliveryTabId, { sectionTitle: string; subtitle: string; commentHint: string }> = {
  diseno: {
    sectionTitle: 'Notas — Diseño',
    subtitle: 'Deja comentarios para supervisores o el resto del equipo.',
    commentHint: 'Pulsa «Guardar nota» para dejarla en el historial, o se adjunta al subir el .x_t.',
  },
  maquinado: {
    sectionTitle: 'Notas — Maquinado',
    subtitle: 'Comentarios del trabajo en máquina CNC/Torno para este proyecto.',
    commentHint: 'Visible en el historial del proyecto.',
  },
  taller: {
    sectionTitle: 'Notas — Taller',
    subtitle: 'Notas de perfilado, armado o detallado en este proyecto.',
    commentHint: 'Queda en el historial del proyecto.',
  },
  cnc: {
    sectionTitle: 'Notas — Programación',
    subtitle: 'Comentarios de programación CNC/Torno. Los supervisores los ven junto con las revisiones.',
    commentHint: 'Visible al aprobar o pedir cambios en programación.',
  },
  fotos: {
    sectionTitle: 'Notas — Fotos',
    subtitle: 'Notas sobre evidencias por pieza y cierre del proyecto.',
    commentHint: 'Visible al solicitar revisión de cierre o al finalizar el proyecto.',
  },
  piezas: {
    sectionTitle: 'Notas — Piezas',
    subtitle: 'Notas generales del flujo por piezas en taller.',
    commentHint: 'Queda registrado en el historial del proyecto.',
  },
}

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
  variant?: 'standalone' | 'embedded'
}

export function BodegaProjectAvanceNotasPanel(props: Props) {
  const embedded = props.variant === 'embedded'
  const copy = COPY[props.tab]
  const theme = deliveryTabTheme(props.tab)
  const canNote = canSaveBodegaProjectNote(props.role)

  const textareaCls = `mt-2 min-h-[80px] w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[14px] leading-relaxed text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:ring-2 ${theme.textareaFocus}`

  const body = (
    <div className={embedded ? 'space-y-5 p-4 sm:p-5' : 'space-y-6 p-4 sm:p-6'}>
      {!embedded && props.tab === 'diseno' ? (
        <p className="max-w-2xl text-[13px] leading-relaxed text-slate-700">{copy.subtitle}</p>
      ) : null}
      {embedded ? <p className="text-[12px] leading-relaxed text-slate-600">{copy.subtitle}</p> : null}

      <label className="block">
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Comentario</span>
        <span className="mt-0.5 block text-[12px] text-slate-600">{copy.commentHint}</span>
        <textarea
          value={props.designCommentDraft}
          onChange={(e) => props.onDesignCommentDraftChange(e.target.value)}
          placeholder="Notas para supervisores…"
          className={textareaCls}
          rows={3}
        />
      </label>
      {canNote && props.onSaveComment ? (
        <button
          type="button"
          disabled={props.commentSaveBusy || props.loading || !props.designCommentDraft.trim()}
          className={[
            'mt-2.5 min-h-[40px] rounded-xl px-4 py-2 text-[12px] font-semibold text-white shadow-md transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50',
            theme.saveButton,
          ].join(' ')}
          onClick={() => props.onSaveComment?.()}
        >
          {props.commentSaveBusy ? 'Guardando…' : 'Guardar nota'}
        </button>
      ) : null}
    </div>
  )

  if (embedded) {
    return (
      <div>
        <div className="border-b border-slate-200/90 px-4 py-3 sm:px-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Notas</p>
          <p className="mt-0.5 text-[14px] font-bold text-slate-900">{copy.sectionTitle.replace(' — ', ' · ')}</p>
        </div>
        {body}
      </div>
    )
  }

  return (
    <section className={theme.section}>
      <div className={theme.header}>
        <h3 className={theme.headerTitle}>{copy.sectionTitle}</h3>
        {props.tab !== 'diseno' ? <p className={theme.headerSubtitle}>{copy.subtitle}</p> : null}
      </div>
      {body}
    </section>
  )
}
