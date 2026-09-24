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
  /** Piezas quitadas: siguen visibles para poder restaurarlas, pero no se entregan. */
  excludedNames?: Set<string>
  onToggleExclude?: (pieceName: string) => void
  toggleDisabled?: boolean
}) {
  const [showDiscarded, setShowDiscarded] = useState(false)
  const { result } = props
  const planos = props.planoPdfByPiece ?? {}
  const excluded = props.excludedNames ?? new Set<string>()
  const keptCount = result.pieces.filter((p) => !excluded.has(p.name)).length
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
        <span
          className={[
            'shrink-0 rounded-lg px-2.5 py-1 text-[12px] font-bold text-white',
            keptCount === 0 ? 'bg-rose-700' : 'bg-section-navy',
          ].join(' ')}
        >
          {keptCount < result.pieces.length
            ? `${keptCount} de ${result.pieces.length} piezas`
            : `${result.pieces.length} pieza${result.pieces.length === 1 ? '' : 's'}`}
        </span>
      </div>
      <ol className={props.compact ? 'max-h-72 overflow-auto' : ''}>
        {result.pieces.map((p, i) => {
          const pdfName = planos[p.name]
          const isExcluded = excluded.has(p.name)
          return (
            <li
              key={p.name}
              className={[
                'flex flex-wrap items-center gap-3 border-b border-slate-100 px-3 py-2 text-[13px] text-slate-800 last:border-0',
                isExcluded ? 'bg-rose-50/70' : i % 2 === 0 ? 'bg-white' : 'bg-slate-50',
                pdfName && !isExcluded ? 'ring-1 ring-inset ring-emerald-300/80' : '',
              ].join(' ')}
            >
              <span
                className={[
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-bold',
                  isExcluded ? 'bg-rose-200 text-rose-900' : 'bg-section-navy/10 text-section-navy',
                ].join(' ')}
              >
                {i + 1}
              </span>
              <span
                className={[
                  'min-w-0 flex-1 font-mono font-medium',
                  isExcluded ? 'text-slate-400 line-through' : '',
                ].join(' ')}
              >
                {p.name}
              </span>
              {isExcluded ? (
                <span className="shrink-0 rounded-lg border border-rose-300 bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-rose-800">
                  No se entrega
                </span>
              ) : pdfName ? (
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
              {props.onToggleExclude ? (
                <button
                  type="button"
                  disabled={props.toggleDisabled}
                  className={[
                    'min-h-[32px] shrink-0 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold shadow-sm disabled:opacity-50',
                    isExcluded
                      ? 'border-emerald-400 bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
                      : 'border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100',
                  ].join(' ')}
                  onClick={() => props.onToggleExclude?.(p.name)}
                >
                  {isExcluded ? 'Restaurar' : 'Quitar'}
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
