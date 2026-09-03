import { useEffect, useState } from 'react'
import type { BodegaProjectPieceRow } from '../../lib/bodegaPiecesRepo'
import {
  loadPerfiladoPiecePdfObjectUrl,
  resolvePerfiladoPiecePdfMeta,
  revokePerfiladoPiecePdfObjectUrl,
} from '../../lib/bodegaPerfiladoPiecePdf'
import { pieceHasPlano } from '../../lib/bodegaPieceDesignDrawing'
import { BodegaPiecePlanoAttach } from './BodegaPiecePlanoAttach.tsx'

type Props = {
  piece: BodegaProjectPieceRow
  projectId: string
  projectFolio: string
  designZipPaths?: string[]
  canAttach: boolean
  busy?: boolean
  /** Cargar el visor automáticamente al seleccionar la pieza (programación). */
  autoPreview?: boolean
  onUpdated: () => void | Promise<void>
}

export function BodegaPieceDesignPlanoSection(props: Props) {
  const designPaths = props.designZipPaths ?? []
  const [pdfLabel, setPdfLabel] = useState<string | null>(null)
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [pdfError, setPdfError] = useState<string | null>(null)

  const hasPlano = pieceHasPlano(props.piece, designPaths)

  useEffect(() => {
    revokePerfiladoPiecePdfObjectUrl(pdfPreviewUrl)
    setPdfPreviewUrl(null)
    setPdfLabel(null)
    setPdfError(null)

    let cancelled = false
    setPdfLoading(true)
    void resolvePerfiladoPiecePdfMeta(props.projectId, props.piece).then(async (meta) => {
      if (cancelled) return
      setPdfLabel(meta.pdfLabel)
      setPdfError(meta.missingReason)
      setPdfLoading(false)

      if (props.autoPreview && !meta.missingReason && (meta.pdfPath || meta.attachedStoragePath)) {
        try {
          const { url } = await loadPerfiladoPiecePdfObjectUrl(props.projectId, props.piece)
          if (!cancelled) setPdfPreviewUrl(url)
        } catch (e) {
          if (!cancelled) {
            setPdfError(e instanceof Error ? e.message : 'No se pudo abrir el plano')
          }
        }
      }
    })

    return () => {
      cancelled = true
    }
  }, [
    props.piece.id,
    props.projectId,
    props.piece.source_path,
    props.piece.label,
    props.piece.design_drawing_storage_path,
    props.piece.design_drawing_name,
    props.autoPreview,
  ])

  useEffect(() => {
    return () => revokePerfiladoPiecePdfObjectUrl(pdfPreviewUrl)
  }, [pdfPreviewUrl])

  async function onViewPdf() {
    setPdfLoading(true)
    setPdfError(null)
    try {
      revokePerfiladoPiecePdfObjectUrl(pdfPreviewUrl)
      const { url, pdfLabel: label } = await loadPerfiladoPiecePdfObjectUrl(props.projectId, props.piece)
      setPdfPreviewUrl(url)
      setPdfLabel(label)
    } catch (e) {
      setPdfError(e instanceof Error ? e.message : 'No se pudo abrir el plano')
    } finally {
      setPdfLoading(false)
    }
  }

  async function onPlanoUpdated() {
    revokePerfiladoPiecePdfObjectUrl(pdfPreviewUrl)
    setPdfPreviewUrl(null)
    await props.onUpdated()
  }

  return (
    <section className="rounded-xl border border-programacion-200/90 bg-programacion-50/40 p-4">
      <h4 className="text-[11px] font-bold uppercase tracking-wide text-programacion-800">Plano PDF (diseño)</h4>
      <p className="mt-1 text-[12px] text-slate-600">
        Plano de la pieza para programar. Puede venir del ZIP o subirse aquí si faltó.
      </p>

      {pdfLoading && !pdfPreviewUrl ? (
        <p className="mt-2 text-[12px] text-slate-500">Cargando plano…</p>
      ) : null}

      {pdfLabel && !pdfError ? (
        <p className="mt-2 truncate font-mono text-[11px] text-programacion-900/80" title={pdfLabel}>
          {pdfLabel}
        </p>
      ) : null}

      {pdfError && !hasPlano ? (
        <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1.5 text-[12px] text-amber-950">{pdfError}</p>
      ) : null}

      {hasPlano || pdfPreviewUrl ? (
        <button
          type="button"
          disabled={props.busy || pdfLoading}
          className="mt-2 inline-flex min-h-[40px] items-center rounded-lg border border-programacion-300 bg-white px-4 py-2 text-[13px] font-semibold text-programacion-950 hover:bg-programacion-50 disabled:opacity-50"
          onClick={() => void onViewPdf()}
        >
          {pdfPreviewUrl ? 'Actualizar vista del plano' : 'Abrir plano PDF'}
        </button>
      ) : null}

      {pdfPreviewUrl ? (
        <iframe
          title={`Plano ${props.piece.label}`}
          src={pdfPreviewUrl}
          className="mt-3 h-[min(360px,45vh)] w-full rounded-xl border border-programacion-200 bg-white shadow-inner"
        />
      ) : null}

      {props.canAttach ? (
        <div className="mt-3 border-t border-programacion-200/80 pt-3">
          <BodegaPiecePlanoAttach
            piece={props.piece}
            projectFolio={props.projectFolio}
            designZipPaths={designPaths}
            canEdit={!props.busy}
            onUpdated={onPlanoUpdated}
          />
        </div>
      ) : null}
    </section>
  )
}
