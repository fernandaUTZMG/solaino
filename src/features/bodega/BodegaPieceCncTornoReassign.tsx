import type { BodegaPieceIntervalRow } from '../../lib/bodegaPieceIntervalsRepo'
import type { BodegaProjectPieceRow } from '../../lib/bodegaPiecesRepo'
import {
  canReassignProgrammerCncTorno,
  reassignProgrammerCncTornoBlockedReason,
} from '../../lib/bodegaProgrammerFlow'

type Props = {
  piece: BodegaProjectPieceRow
  intervals?: BodegaPieceIntervalRow[]
  busy: boolean
  onReassign: (bucket: 'cnc' | 'torno') => void | Promise<void>
}

export function BodegaPieceCncTornoReassign(props: Props) {
  const current = props.piece.programmer_bucket
  if (current !== 'cnc' && current !== 'torno') return null

  const can = canReassignProgrammerCncTorno(props.piece, props.intervals)
  const blocked = reassignProgrammerCncTornoBlockedReason(props.piece, props.intervals)
  const other: 'cnc' | 'torno' = current === 'cnc' ? 'torno' : 'cnc'
  const otherLabel = other === 'cnc' ? 'CNC' : 'Torno'
  const currentLabel = current === 'cnc' ? 'CNC' : 'Torno'

  return (
    <div className="rounded-xl border border-programacion-200/90 bg-programacion-50/60 px-3 py-3 sm:px-4">
      <p className="text-[11px] font-bold uppercase tracking-wide text-programacion-900">Destino actual</p>
      <p className="mt-1 text-[13px] text-slate-800">
        Asignada a <strong>{currentLabel}</strong>
        {props.piece.programming_finished_at ? (
          <span className="text-slate-600"> · programación terminada</span>
        ) : null}
      </p>
      {can ? (
        <button
          type="button"
          disabled={props.busy}
          className="mt-3 min-h-[40px] rounded-lg border border-programacion-400 bg-white px-4 py-2 text-[13px] font-bold text-programacion-950 shadow-sm hover:bg-programacion-50 disabled:opacity-50"
          onClick={() => void props.onReassign(other)}
        >
          Cambiar a {otherLabel}
        </button>
      ) : (
        <p className="mt-2 text-[12px] leading-relaxed text-amber-950">{blocked ?? 'No se puede cambiar el destino.'}</p>
      )}
    </div>
  )
}
