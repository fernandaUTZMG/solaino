import type { BodegaProjectPieceRow, PerfiladoCompletionOutcome } from '../../lib/bodegaPiecesRepo'
import { BodegaPieceProgrammingFileDownload } from './BodegaPieceProgrammingFileDownload.tsx'
import { tallerPerfiladoUi as ui } from './bodegaTallerStageUi.ts'

type Props = {
  piece: BodegaProjectPieceRow
  originLabel: string
  canWork: boolean
  busy: boolean
  pdfLabel?: string | null
  pdfPreviewUrl?: string | null
  pdfLoading?: boolean
  pdfError?: string | null
  onViewPdf?: () => void | Promise<void>
  onFinishPerfilado: (outcome: PerfiladoCompletionOutcome) => void | Promise<void>
}

/** Perfilado en taller: sin cronómetro. Solo PDF/programa y destino al terminar. */
export function BodegaPiecePerfiladoControls(props: Props) {
  const btn = 'min-h-[52px] rounded-xl px-5 py-3 text-[15px] font-bold transition disabled:opacity-50'

  return (
    <div className={ui.panel}>
      <p className={ui.panelKicker}>Perfilado</p>
      <p className="mt-1 text-[17px] font-bold text-slate-900">{props.piece.label}</p>
      <p className="mt-0.5 text-[12px] text-slate-500">
        Origen: <span className="font-semibold text-slate-700">{props.originLabel}</span>
      </p>
      <p className={`mt-3 ${ui.note}`}>
        Sin tiempo de taller aquí. El reloj de máquina es solo en <strong>maquinado (CNC)</strong>.
      </p>

      <div className="mt-4 space-y-4">
        <div>
          <p className={ui.docLabel}>Plano PDF (diseño)</p>
          {props.pdfError ? (
            <p className="mt-1 text-[12px] text-amber-900">{props.pdfError}</p>
          ) : props.pdfLabel ? (
            <p className="mt-1 truncate font-mono text-[12px] text-slate-500" title={props.pdfLabel}>
              {props.pdfLabel}
            </p>
          ) : props.pdfLoading ? (
            <p className="mt-1 text-[12px] text-slate-500">Buscando PDF en el diseño…</p>
          ) : (
            <p className="mt-1 text-[12px] text-slate-500">Sin PDF para esta pieza.</p>
          )}
          {props.onViewPdf && props.pdfLabel && !props.pdfError ? (
            <button
              type="button"
              disabled={props.busy || props.pdfLoading}
              className={`mt-2 inline-flex min-h-[40px] items-center rounded-lg border px-4 py-2 text-[13px] font-semibold disabled:opacity-50 ${ui.docBtn}`}
              onClick={() => void props.onViewPdf?.()}
            >
              {props.pdfPreviewUrl ? 'Actualizar PDF' : 'Ver PDF'}
            </button>
          ) : null}
          {props.pdfPreviewUrl ? (
            <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-inner">
              <iframe
                title={`PDF ${props.piece.label}`}
                src={props.pdfPreviewUrl}
                className="block h-[min(360px,45vh)] w-full bg-white"
              />
            </div>
          ) : null}
        </div>

        {props.piece.programming_file_storage_path && props.piece.programming_file_name ? (
          <div>
            <p className={ui.docLabel}>Programa (programación)</p>
            <BodegaPieceProgrammingFileDownload
              storagePath={props.piece.programming_file_storage_path}
              fileName={props.piece.programming_file_name}
              className={`mt-1 inline-flex min-h-[40px] items-center rounded-lg border px-4 py-2 text-[12px] font-semibold ${ui.docBtn}`}
            />
          </div>
        ) : null}
      </div>

      {props.canWork ? (
        <div className="mt-5 flex flex-col gap-3">
          <button
            type="button"
            disabled={props.busy}
            className={`${btn} ${ui.btnPrimary}`}
            onClick={() => void props.onFinishPerfilado('detallado')}
          >
            Terminación → Detallado
          </button>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-bold uppercase text-slate-500">Solo si hace falta</p>
            <p className="mt-1 text-[12px] leading-relaxed text-slate-600">
              Otra pasada de programación en oficina antes de maquinado:
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                disabled={props.busy}
                className={`${btn} flex-1 ${ui.btnSecondary}`}
                onClick={() => void props.onFinishPerfilado('cnc')}
              >
                Terminación → CNC
              </button>
              <button
                type="button"
                disabled={props.busy}
                className={`${btn} flex-1 ${ui.btnSecondary}`}
                onClick={() => void props.onFinishPerfilado('torno')}
              >
                Terminación → Torno
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <p className="mt-4 text-[12px] leading-relaxed text-slate-500">
        Lo habitual: <strong className="text-slate-700">Terminación → Detallado</strong>. Si la pieza necesita
        programarse otra vez, elige <strong className="text-slate-700">CNC</strong> o{' '}
        <strong className="text-slate-700">Torno</strong>.
      </p>
    </div>
  )
}
