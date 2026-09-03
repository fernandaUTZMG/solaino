import { useEffect, useState } from 'react'

import type { BodegaProjectPieceRow } from '../../lib/bodegaPiecesRepo'

import { savePieceMaquinadoEstimate } from '../../lib/bodegaPieceMaquinadoEstimate'

import { pieceMaquinadoEstimatedLabel } from '../../lib/maquinadoEstimatedTime'

import { progWorkspacePalette } from './bodegaProgramacionUi.ts'



type Props = {

  piece: BodegaProjectPieceRow

  projectFolio: string

  module: 'programacion' | 'torno'

  canEdit: boolean

  busy: boolean

  onUpdated: () => void | Promise<void>

}



export function BodegaPieceMaquinadoEstimateForm(props: Props) {

  const palette = progWorkspacePalette(props.module)

  const existingLabel = pieceMaquinadoEstimatedLabel(props.piece) ?? ''

  const [estimateInput, setEstimateInput] = useState(existingLabel)

  const [notes, setNotes] = useState(props.piece.maquinado_time_variance_notes ?? '')

  const [err, setErr] = useState<string | null>(null)

  const [saving, setSaving] = useState(false)



  useEffect(() => {

    setEstimateInput(pieceMaquinadoEstimatedLabel(props.piece) ?? '')

    setNotes(props.piece.maquinado_time_variance_notes ?? '')

  }, [props.piece.id, props.piece.maquinado_estimated_label, props.piece.maquinado_estimated_seconds])



  async function onSave() {

    if (!props.canEdit) return

    setSaving(true)

    setErr(null)

    try {

      await savePieceMaquinadoEstimate({

        projectFolio: props.projectFolio,

        pieceId: props.piece.id,

        estimatedLabel: estimateInput,

        varianceNotes: notes.trim() || null,

      })

      await props.onUpdated()

    } catch (e) {

      setErr(e instanceof Error ? e.message : 'No se guardó el tiempo estimado')

    } finally {

      setSaving(false)

    }

  }



  return (

    <div className={['rounded-xl border bg-white p-4', palette.innerCard].join(' ')}>

      <p className={['text-[11px] font-bold uppercase', palette.panelTitle].join(' ')}>

        Tiempo estimado de programación

      </p>

      <p className="mt-1 truncate text-[14px] font-bold text-slate-900" title={props.piece.label}>

        {props.piece.label}

      </p>

      <p className={['mt-2 text-[12px] leading-relaxed', palette.panelText].join(' ')}>

        Escribe el tiempo estimado en máquina (formato H:M:S, ej. <span className="font-mono font-semibold">1:21:4</span>

        ). La captura SURFCAM se adjunta en la pestaña <strong>Maquinado</strong>, no aquí.

      </p>



      {err ? (

        <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-900">{err}</p>

      ) : null}



      <label className="mt-3 block">

        <span className="text-[11px] font-bold uppercase text-slate-600">Tiempo estimado (H:M:S)</span>

        <input

          type="text"

          value={estimateInput}

          onChange={(e) => setEstimateInput(e.target.value)}

          placeholder="1:21:4"

          disabled={!props.canEdit || saving || props.busy}

          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-mono text-[14px] text-slate-900"

        />

      </label>



      <label className="mt-3 block">

        <span className="text-[11px] font-bold uppercase text-slate-600">

          Notas si tardó más (programación)

        </span>

        <textarea

          value={notes}

          onChange={(e) => setNotes(e.target.value)}

          rows={3}

          disabled={!props.canEdit || saving || props.busy}

          placeholder="Ej. material duro, herramienta nueva, retrabajo…"

          className="mt-1 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-slate-900"

        />

      </label>



      {props.canEdit ? (

        <button

          type="button"

          disabled={saving || props.busy || !estimateInput.trim()}

          className={`mt-3 min-h-[44px] rounded-lg px-5 py-2.5 text-[13px] font-bold text-white disabled:opacity-50 ${palette.btnPrimary}`}

          onClick={() => void onSave()}

        >

          {saving ? 'Guardando…' : 'Guardar tiempo estimado'}

        </button>

      ) : null}

    </div>

  )

}

