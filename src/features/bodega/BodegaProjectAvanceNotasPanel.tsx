import type { AppRole } from '../../lib/roles'

import { canSaveBodegaProjectNote, canSetManualBodegaProjectAvance } from '../../lib/roles'

import { deliveryTabTheme, type BodegaDeliveryTabId } from './bodegaDeliveryTabTheme.ts'



const COPY: Record<

  BodegaDeliveryTabId,

  { sectionTitle: string; subtitle: string; avanceHint: string; commentHint: string }

> = {

  diseno: {

    sectionTitle: 'Avance y notas — Diseño',

    subtitle:

      'Registra el avance estimado mientras modelas o preparas entregas. Los supervisores lo ven al revisar el ZIP de diseño.',

    avanceHint:

      'Úsalo si el modelado va avanzado pero aún no subes el ZIP final (p. ej. 40 % del módulo listo). Queda en el historial del proyecto.',

    commentHint: 'Pulsa «Guardar nota» para dejarla en el historial, o se adjunta al subir el ZIP / guardar avance.',

  },

  maquinado: {

    sectionTitle: 'Avance y notas — Maquinado',

    subtitle: 'Comentarios del trabajo en máquina CNC/Torno para este proyecto.',

    avanceHint: 'Úsalo mientras maquinas piezas del módulo.',

    commentHint: 'Visible en el historial del proyecto.',

  },

  taller: {

    sectionTitle: 'Avance y notas — Taller',

    subtitle: 'Notas de perfilado, armado o detallado en este proyecto.',

    avanceHint: 'Avance manual del módulo en etapas físicas de taller.',

    commentHint: 'Queda en el historial del proyecto.',

  },

  cnc: {

    sectionTitle: 'Avance y notas — Programación',

    subtitle:

      'Registra el avance de programación CNC/Torno. Los supervisores lo ven junto con las revisiones de oficina.',

    avanceHint:

      'Úsalo mientras programas piezas (p. ej. mitad del módulo con archivo adjunto). Queda en el historial del proyecto.',

    commentHint: 'Visible al aprobar o pedir cambios en entregas de programación.',

  },

  fotos: {

    sectionTitle: 'Avance y notas — Fotos',

    subtitle: 'Notas sobre evidencias por pieza y cierre del proyecto (paso 10).',

    avanceHint: 'Úsalo si el taller avanzó y quieres reflejar el % antes de que el supervisor finalice.',

    commentHint: 'Visible al solicitar revisión de cierre o al finalizar el proyecto.',

  },

  piezas: {

    sectionTitle: 'Avance y notas — Piezas',

    subtitle: 'Notas generales del flujo por piezas en taller.',

    avanceHint: 'Avance manual del proyecto completo (mismo % que en la lista).',

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

  const canManual = canSetManualBodegaProjectAvance(props.role)
  const canNote = canSaveBodegaProjectNote(props.role)

  const inputCls = `mt-1.5 w-[7rem] rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[15px] font-semibold tabular-nums text-slate-900 shadow-sm outline-none ${theme.inputFocus} focus:ring-2`

  const textareaCls = `mt-2 min-h-[80px] w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[14px] leading-relaxed text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:ring-2 ${theme.textareaFocus}`



  const body = (

    <div className={embedded ? 'space-y-5 p-4 sm:p-5' : 'space-y-6 p-4 sm:p-6'}>

      {!embedded && props.tab === 'diseno' ? (

        <p className="max-w-2xl text-[13px] leading-relaxed text-slate-700">{copy.subtitle}</p>

      ) : null}

      {embedded ? (

        <p className="text-[12px] leading-relaxed text-slate-600">{copy.subtitle}</p>

      ) : null}



      {props.operationalAvancePct != null ? (

        <div className="rounded-xl border border-emerald-200 bg-emerald-50/90 px-3.5 py-2.5">

          <p className="text-[13px] font-bold text-emerald-950">Avance automático (piezas)</p>

          <p className="mt-1 text-[12px] text-emerald-900/90">

            <span className="font-mono font-semibold">{props.operationalAvancePct}%</span>

            {props.operationalStageLabel ? (

              <>

                {' '}

                — <span className="font-semibold">{props.operationalStageLabel}</span>

              </>

            ) : null}

          </p>

        </div>

      ) : null}



      {canManual ? (

        <div className={embedded ? 'rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-sm' : theme.avanceBox}>

          <p className="text-[13px] font-bold text-slate-900">Avance estimado (manual)</p>

          <p className="mt-1.5 text-[12px] leading-relaxed text-slate-600">{copy.avanceHint}</p>

          <div className="mt-3 flex flex-wrap items-end gap-3">

            <label className="block">

              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">% (0–100)</span>

              <input

                type="number"

                min={0}

                max={100}

                step={1}

                value={props.manualAvanceInput}

                onChange={(e) => props.onManualAvanceInputChange(e.target.value)}

                className={inputCls}

              />

            </label>

            <button

              type="button"

              disabled={props.manualAvanceBusy || props.loading}

              className={[

                'min-h-[40px] rounded-xl px-4 py-2 text-[12px] font-semibold text-white shadow-md transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50',

                theme.saveButton,

              ].join(' ')}

              onClick={() => props.onSaveManualAvance()}

            >

              {props.manualAvanceBusy ? 'Guardando…' : 'Guardar avance'}

            </button>

          </div>

        </div>

      ) : (

        <p className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[12px] text-slate-600">

          El avance manual (%) lo registran diseño, programación o supervisión. Puedes dejar comentarios abajo con{' '}

          <strong className="font-semibold text-slate-800">Guardar nota</strong>.

        </p>

      )}



      <div className={embedded ? '' : canManual ? 'border-t border-slate-100 pt-6' : ''}>

        <label className="block">

          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">

            Comentario

          </span>

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

