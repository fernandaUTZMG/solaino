import { useEffect, useState } from 'react'
import type { OrdenCompraRow } from '../../lib/bodegaOrdenes'
import { createSignedUrlForOrdenPdf } from '../../lib/bodegaOrdenes'
import { IconX } from '../../ui/shellIcons'

function IconPdfDoc(props: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
      aria-hidden
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <path d="M10 12h4" />
      <path d="M10 16h4" />
      <path d="M10 8h1" />
    </svg>
  )
}

export function OrdenCompraPdfViewerModal(props: {
  oc: OrdenCompraRow | null
  partidaLineNo?: number | null
  onClose: () => void
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!props.oc) {
      setUrl(null)
      setError(null)
      setLoading(false)
      return
    }
    let cancelled = false
    queueMicrotask(() => {
      setLoading(true)
      setError(null)
      setUrl(null)
    })
    void createSignedUrlForOrdenPdf(props.oc.archivo_storage_path)
      .then((signed) => {
        if (cancelled) return
        if (!signed) setError('No se pudo generar el enlace del PDF.')
        else setUrl(signed)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Error al cargar el PDF')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [props.oc?.id, props.oc?.archivo_storage_path])

  if (!props.oc) return null

  const partidaHint =
    props.partidaLineNo != null && Number.isFinite(props.partidaLineNo)
      ? ` · Partida ${props.partidaLineNo}`
      : ''

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center p-3 sm:p-5">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/70 backdrop-blur-[3px]"
        aria-label="Cerrar visor PDF"
        onClick={props.onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="orden-pdf-viewer-title"
        className="relative flex h-[min(92vh,900px)] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-blue-950/25 bg-white shadow-2xl shadow-blue-950/20 ring-1 ring-blue-950/10"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-blue-950/25 bg-section-navy px-4 py-3.5 text-white sm:px-5">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-500 text-white shadow-lg shadow-orange-950/30">
              <IconPdfDoc className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <h2 id="orden-pdf-viewer-title" className="text-lg font-bold tracking-tight sm:text-xl">
                Orden de compra (PDF)
              </h2>
              <p className="mt-0.5 font-mono text-sm text-blue-100/95">
                {props.oc.numero}
                {partidaHint}
              </p>
              <p className="mt-1 truncate text-[12px] text-blue-100/85" title={props.oc.archivo_nombre}>
                {props.oc.archivo_nombre}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition hover:bg-white/20"
            onClick={props.onClose}
            aria-label="Cerrar"
          >
            <IconX className="h-5 w-5" />
          </button>
        </div>

        <div className="relative min-h-0 flex-1 bg-slate-100">
          {loading ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8">
              <div
                className="h-10 w-10 animate-spin rounded-full border-2 border-slate-200 border-t-orange-500"
                aria-hidden
              />
              <p className="text-[13px] font-medium text-slate-600">Cargando PDF…</p>
            </div>
          ) : error ? (
            <div className="flex h-full items-center justify-center p-8">
              <p className="max-w-md rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-center text-sm text-rose-900">
                {error}
              </p>
            </div>
          ) : url ? (
            <iframe
              title={`PDF orden ${props.oc.numero}`}
              src={url}
              className="h-full w-full border-0 bg-white"
            />
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-200/90 bg-slate-50 px-4 py-3 sm:px-5">
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-[13px] font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
            >
              Abrir en pestaña nueva
            </a>
          ) : null}
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-xl bg-section-navy px-4 py-2 text-[13px] font-bold text-white shadow-sm transition hover:brightness-110"
            onClick={props.onClose}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
