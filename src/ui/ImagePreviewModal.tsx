import { useEffect } from 'react'

export function ImagePreviewModal(props: {
  src: string | null
  alt?: string
  onClose: () => void
}) {
  useEffect(() => {
    if (!props.src) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // onClose identity may change each render; Escape still works.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.src])

  if (!props.src) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/80"
        aria-label="Cerrar vista previa"
        onClick={props.onClose}
      />
      <div className="relative z-[101] max-h-[90vh] max-w-[min(96vw,900px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-2">
          <span className="text-sm font-semibold text-slate-800">Vista de imagen</span>
          <button
            type="button"
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-100"
            onClick={props.onClose}
          >
            Cerrar
          </button>
        </div>
        <div className="max-h-[calc(90vh-52px)] overflow-auto bg-slate-50 p-3">
          <img
            src={props.src}
            alt={props.alt ?? 'Producto'}
            className="mx-auto max-h-[calc(90vh-80px)] w-auto max-w-full object-contain"
          />
        </div>
      </div>
    </div>
  )
}
