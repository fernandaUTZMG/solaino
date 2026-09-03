function IconPdf(props: { className?: string }) {
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
      <line x1="12" y1="18" x2="12" y2="11" />
      <polyline points="9 15 12 18 15 15" />
    </svg>
  )
}

function IconFolderOpen(props: { className?: string }) {
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
      <path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

export function BodegaOcPdfPartidaButton(props: {
  lineNo: number
  variant: 'pdf-row' | 'project-row'
  disabled?: boolean
  canOpenPdf: boolean
  onOpenPdf: () => void
}) {
  const title = props.canOpenPdf
    ? `Ver PDF de la orden · partida ${props.lineNo}`
    : 'Tu rol no puede abrir el PDF de la orden'

  return (
    <button
      type="button"
      disabled={props.disabled || !props.canOpenPdf}
      title={title}
      className={[
        'group flex w-full max-w-[15rem] items-center gap-2.5 rounded-xl border p-2.5 text-left shadow-sm transition',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/50',
        props.canOpenPdf
          ? 'border-emerald-200/90 bg-gradient-to-br from-emerald-50 via-white to-orange-50/40 hover:border-orange-300 hover:shadow-md'
          : 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-60',
      ].join(' ')}
      onClick={props.onOpenPdf}
    >
      <span
        className={[
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-orange-400/30 shadow-sm transition',
          props.canOpenPdf
            ? 'bg-gradient-to-br from-orange-500 to-orange-600 text-white group-hover:from-orange-600 group-hover:to-orange-700'
            : 'bg-slate-200 text-slate-500',
        ].join(' ')}
      >
        <IconPdf className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-bold uppercase tracking-wide text-emerald-900">
          {props.variant === 'pdf-row' ? `PDF · partida ${props.lineNo}` : `Partida PDF ${props.lineNo}`}
        </span>
        <span className="block text-[10px] font-medium text-slate-600">
          {props.canOpenPdf ? 'Clic para ver cotización' : 'PDF no disponible'}
        </span>
      </span>
    </button>
  )
}

export function BodegaArchivosEntregasButton(props: {
  busy?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={props.disabled || props.busy}
      className="inline-flex w-full max-w-[15rem] items-center justify-center gap-2 rounded-xl border border-violet-600/90 bg-gradient-to-r from-violet-600 to-violet-700 px-3 py-2 text-[11px] font-bold text-white shadow-sm transition hover:from-violet-700 hover:to-violet-800 disabled:cursor-not-allowed disabled:opacity-55"
      onClick={props.onClick}
    >
      <IconFolderOpen className="h-4 w-4 shrink-0 opacity-95" />
      {props.busy ? 'Abriendo…' : 'Archivos y entregas'}
    </button>
  )
}

export function BodegaProyectoOrigenManualBadge() {
  return (
    <span className="inline-flex w-fit items-center rounded-lg border border-blue-200/90 bg-blue-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-blue-950">
      Proyecto manual
    </span>
  )
}
