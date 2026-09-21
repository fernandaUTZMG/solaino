import { useState } from 'react'
import type { XtParseResult } from '../../lib/xtParasolidPieces'

/** Lista de piezas detectadas en un ensamble `.x_t`. */
export function BodegaXtPieceList(props: {
  result: XtParseResult
  compact?: boolean
  hideDiscarded?: boolean
  /** nombre pieza (como en el XT) → nombre del PDF vinculado en la UI */
  planoPdfByPiece?: Record<string, string>
  onDownloadPiece?: (pieceName: string) => void
  downloadBusy?: boolean
}) {
  const [showDiscarded, setShowDiscarded] = useState(false)
  const { result } = props
  const planos = props.planoPdfByPiece ?? {}
  return (
    <div className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-200 bg-slate-100 px-3 py-2.5">
        <div className="min-w-0 text-[12px] text-slate-600">
          <p>
            Ensamble:{' '}
            <span className="font-semibold text-slate-900">{result.assemblyKey || '—'}</span>
          </p>
          {result.exportedBy ? <p>Exportado por: {result.exportedBy}</p> : null}
        </div>
        <span className="shrink-0 rounded-lg bg-section-navy px-2.5 py-1 text-[12px] font-bold text-white">
          {result.pieces.length} pieza{result.pieces.length === 1 ? '' : 's'}
        </span>
      </div>
      <ol className={props.compact ? 'max-h-72 overflow-auto' : ''}>
        {result.pieces.map((p, i) => {
          const pdfName = planos[p.name]
          return (
            <li
              key={p.name}
              className={[
                'flex flex-wrap items-center gap-3 border-b border-slate-100 px-3 py-2 text-[13px] text-slate-800 last:border-0',
                i % 2 === 0 ? 'bg-white' : 'bg-slate-50',
                pdfName ? 'ring-1 ring-inset ring-emerald-300/80' : '',
              ].join(' ')}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-section-navy/10 text-[11px] font-bold text-section-navy">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 font-mono font-medium">{p.name}</span>
              {pdfName ? (
                <span
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-emerald-400 bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-900"
                  title={pdfName}
                >
                  <span
                    className="flex h-5 w-5 items-center justify-center rounded bg-rose-600 text-[9px] font-black text-white"
                    aria-hidden
                  >
                    PDF
                  </span>
                  Plano listo
                </span>
              ) : (
                <span className="shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Sin plano
                </span>
              )}
              {props.onDownloadPiece ? (
                <button
                  type="button"
                  disabled={props.downloadBusy}
                  className="shrink-0 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-bold text-section-navy shadow-sm hover:bg-slate-50 disabled:opacity-50"
                  onClick={() => props.onDownloadPiece?.(p.name)}
                >
                  Descargar
                </button>
              ) : null}
            </li>
          )
        })}
      </ol>
      {!props.hideDiscarded && result.discarded.length ? (
        <div className="border-t border-slate-200 bg-slate-50 px-3 py-2">
          <button
            type="button"
            className="text-[12px] font-semibold text-section-navy underline decoration-slate-300 underline-offset-2 hover:decoration-section-navy"
            onClick={() => setShowDiscarded((v) => !v)}
          >
            {showDiscarded ? 'Ocultar' : 'Ver'} {result.discarded.length} cadena(s) descartada(s)
          </button>
          {showDiscarded ? (
            <ul className="mt-2 max-h-40 overflow-auto text-[11px] text-slate-500">
              {result.discarded.slice(0, 200).map((d) => (
                <li key={d} className="font-mono">
                  {d}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
