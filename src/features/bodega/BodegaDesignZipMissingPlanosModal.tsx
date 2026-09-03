import type { DesignZipPiecePair } from '../../lib/designZipPiecePairs'

type Props = {
  missing: DesignZipPiecePair[]
  zipFileName: string
  canAttachExistingPieces: boolean
  busy: boolean
  onUploadAnyway: () => void
  onGoAttachPlanos: () => void
  onClose: () => void
}

export function BodegaDesignZipMissingPlanosModal(props: Props) {
  const count = props.missing.length

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-[1px]"
        aria-label="Cerrar"
        disabled={props.busy}
        onClick={props.onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="design-zip-missing-planos-title"
        className="relative flex max-h-[min(90vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-amber-300 bg-white shadow-2xl shadow-amber-900/10"
      >
        <div className="border-b border-amber-200 bg-gradient-to-r from-amber-100 via-amber-50 to-white px-5 py-4 sm:px-6">
          <div className="flex items-start gap-3">
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-lg font-bold text-white shadow-md"
              aria-hidden
            >
              !
            </span>
            <div className="min-w-0">
              <h2 id="design-zip-missing-planos-title" className="text-lg font-bold text-amber-950">
                Faltan planos PDF en la carpeta
              </h2>
              <p className="mt-1 text-[13px] leading-relaxed text-amber-900/90">
                En <strong className="font-semibold">{props.zipFileName}</strong>,{' '}
                {count === 1 ? '1 pieza no tiene' : `${count} piezas no tienen`} su plano PDF con el mismo nombre
                (.SLDPRT / .PRT + .PDF).
              </p>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
          <ul className="divide-y divide-amber-100 rounded-xl border border-amber-200 bg-amber-50/40">
            {props.missing.map((row) => (
              <li key={row.partPath} className="px-4 py-3">
                <p className="font-semibold text-slate-900">{row.partLabel}</p>
                <p className="mt-1 text-[12px] leading-relaxed text-amber-950">
                  Esta pieza no cuenta con su plano PDF. Se esperaba un archivo como{' '}
                  <span className="font-mono font-medium">
                    {row.partLabel.replace(/\.(sldprt|slcprt|prt)$/i, '')}.pdf
                  </span>
                  .
                </p>
              </li>
            ))}
          </ul>

          <p className="mt-4 text-[13px] leading-relaxed text-slate-600">
            ¿Deseas subir la carpeta así o prefieres agregar los PDF antes de continuar?
          </p>
          {props.canAttachExistingPieces ? (
            <p className="mt-2 text-[12px] leading-relaxed text-slate-500">
              También puedes adjuntar planos manualmente en la sección <strong>Planos adicionales por pieza</strong>{' '}
              (más abajo en Diseño), si ya existen piezas importadas de una entrega anterior.
            </p>
          ) : (
            <p className="mt-2 text-[12px] leading-relaxed text-slate-500">
              Agrega cada PDF dentro de la carpeta del proyecto (mismo nombre que la pieza), vuelve a comprimir el ZIP
              e intenta de nuevo.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t border-slate-100 bg-slate-50/80 px-5 py-4 sm:flex-row sm:flex-wrap sm:justify-end sm:px-6">
          <button
            type="button"
            disabled={props.busy}
            className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-[14px] font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
            onClick={props.onGoAttachPlanos}
          >
            {props.canAttachExistingPieces ? 'Adjuntar PDF — ir a planos' : 'No subir — agregaré los PDF'}
          </button>
          <button
            type="button"
            disabled={props.busy}
            className="min-h-[44px] rounded-xl border border-amber-400 bg-amber-500 px-4 py-2.5 text-[14px] font-semibold text-white shadow-sm transition hover:bg-amber-600 disabled:opacity-60"
            onClick={props.onUploadAnyway}
          >
            {props.busy ? 'Subiendo…' : 'Subir carpeta así'}
          </button>
        </div>
      </div>
    </div>
  )
}
