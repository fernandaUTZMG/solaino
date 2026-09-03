import { useState } from 'react'
import type { BodegaProjectPieceRow } from '../../lib/bodegaPiecesRepo'
import { attachPieceDesignDrawing, pieceHasPlano, piecePlanoSource } from '../../lib/bodegaPieceDesignDrawing'
import { labelFromZipPath } from '../../lib/zipDesignPackage'
import { designDrawingPdfPathForPiece } from '../../lib/bodegaPiecesRepo'
import { BodegaPieceDesignDrawingDownload } from './BodegaPieceDesignDrawingDownload.tsx'

type Props = {
  piece: BodegaProjectPieceRow
  projectFolio: string
  designZipPaths?: string[]
  canEdit: boolean
  compact?: boolean
  onUpdated: () => void | Promise<void>
}

export function BodegaPiecePlanoAttach(props: Props) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const designPaths = props.designZipPaths ?? []
  const source = piecePlanoSource(props.piece, designPaths)
  const zipPath = designDrawingPdfPathForPiece(props.piece, designPaths)
  const hasPlano = pieceHasPlano(props.piece, designPaths)

  async function onFile(file: File | undefined) {
    if (!file || !props.canEdit) return
    setBusy(true)
    setErr(null)
    try {
      await attachPieceDesignDrawing({
        projectFolio: props.projectFolio,
        pieceId: props.piece.id,
        file,
      })
      await props.onUpdated()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo subir el plano')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={props.compact ? 'space-y-2' : 'rounded-lg border border-sky-200/80 bg-sky-50/40 px-3 py-2.5'}>
      {!props.compact ? (
        <p className="text-[10px] font-bold uppercase tracking-wide text-sky-950">Plano PDF</p>
      ) : null}

      {hasPlano ? (
        <div className="flex flex-wrap items-center gap-2">
          {source === 'adjunto' && props.piece.design_drawing_storage_path && props.piece.design_drawing_name ? (
            <BodegaPieceDesignDrawingDownload
              storagePath={props.piece.design_drawing_storage_path}
              fileName={props.piece.design_drawing_name}
              className="inline-flex min-h-[32px] items-center rounded-lg border border-sky-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-sky-900 shadow-sm underline-offset-2 hover:bg-sky-50 hover:underline"
            />
          ) : zipPath ? (
            <span className="inline-flex min-h-[32px] items-center rounded-lg border border-sky-200 bg-white px-3 py-1.5 font-mono text-[11px] font-medium text-slate-800 shadow-sm">
              {labelFromZipPath(zipPath)}
            </span>
          ) : null}
          {source === 'adjunto' ? (
            <span className="text-[11px] font-medium text-emerald-800">Adjunto en pieza</span>
          ) : source === 'zip' ? (
            <span className="text-[11px] font-medium text-sky-800">Desde ZIP de diseño</span>
          ) : null}
        </div>
      ) : (
        <p className="text-[12px] leading-relaxed text-amber-900">
          Sin plano vinculado. Sube el PDF si lo recibiste aparte del ZIP.
        </p>
      )}

      {props.canEdit ? (
        <label
          className={[
            'inline-flex min-h-[34px] cursor-pointer items-center rounded-lg border border-dashed px-3 py-1.5 text-[12px] font-semibold shadow-sm',
            busy ? 'pointer-events-none opacity-60' : '',
            hasPlano
              ? 'border-sky-300 bg-white text-sky-900 hover:bg-sky-50'
              : 'border-amber-400 bg-amber-50 text-amber-950 hover:bg-amber-100',
          ].join(' ')}
        >
          {busy ? 'Subiendo…' : hasPlano ? 'Reemplazar plano' : 'Subir plano PDF'}
          <input
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0]
              void onFile(f)
              e.currentTarget.value = ''
            }}
          />
        </label>
      ) : null}

      {err ? <p className="text-[11px] text-rose-800">{err}</p> : null}
    </div>
  )
}
