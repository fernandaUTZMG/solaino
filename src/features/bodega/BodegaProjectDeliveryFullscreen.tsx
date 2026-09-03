import type { ReactNode } from 'react'
import { FullscreenPortal } from '../../ui/FullscreenPortal.tsx'

type Props = {
  folio: string
  projectName: string
  statusLabel: string
  avancePct: number
  onClose: () => void
  /** Info, prioridad, etc. */
  headerActions?: ReactNode
  tabs: ReactNode
  footer?: ReactNode
  children: ReactNode
  overlay?: ReactNode
}

/** Pantalla dedicada de archivos y entregas (layout tipo programación). */
export function BodegaProjectDeliveryFullscreen(props: Props) {
  return (
    <FullscreenPortal>
      <div
        className="fixed inset-0 z-[100] flex h-[100dvh] w-full flex-col bg-slate-100"
        role="dialog"
        aria-modal="true"
        aria-label="Archivos y entregas del proyecto"
      >
        <header className="shrink-0 w-full border-b border-blue-950/30 bg-gradient-to-br from-section-navy via-section-navy to-blue-950 text-white shadow-md">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4 lg:px-8">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-blue-200/90">
                Archivos y entregas
              </p>
              <h2 className="mt-1 truncate text-lg font-bold sm:text-xl" title={props.projectName}>
                <span className="font-mono">{props.folio}</span>
              </h2>
              {props.headerActions ? (
                <div className="mt-2.5 flex flex-wrap items-center gap-2">{props.headerActions}</div>
              ) : null}
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 sm:gap-3">
              <div className="hidden min-w-[7.5rem] flex-col rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-center sm:flex sm:text-left">
                <span className="text-[10px] font-bold uppercase tracking-wide text-blue-200/80">Estado</span>
                <span className="text-[13px] font-bold leading-tight text-white">{props.statusLabel}</span>
                <span className="font-mono text-[10px] text-blue-100/75">Avance {props.avancePct}%</span>
              </div>
              <span className="rounded-lg border border-white/20 bg-white/10 px-2.5 py-1.5 font-mono text-[11px] text-blue-100/90 sm:hidden">
                {props.avancePct}%
              </span>
              <button
                type="button"
                className="min-h-[44px] rounded-xl border border-white/30 bg-white/10 px-4 py-2 text-[13px] font-bold text-white shadow-sm transition hover:bg-white/20 sm:px-5 sm:text-[14px]"
                onClick={props.onClose}
              >
                Volver a bodega
              </button>
            </div>
          </div>

          <div className="border-t border-white/10 bg-black/20 px-4 py-2.5 sm:px-6 lg:px-8">{props.tabs}</div>
        </header>

        <div
          className="min-h-0 w-full flex-1 overflow-y-auto overscroll-contain bg-slate-50"
          data-bodega-delivery-scroll
        >
          <div className="mx-auto w-full max-w-[1600px] space-y-6 p-4 sm:p-6 lg:py-8">{props.children}</div>
        </div>

        {props.footer ? (
          <footer className="shrink-0 w-full border-t border-slate-200 bg-white shadow-[0_-4px_24px_-8px_rgba(15,23,42,0.08)]">
            <div className="mx-auto w-full max-w-[1600px] px-4 py-4 sm:px-6 lg:px-8">{props.footer}</div>
          </footer>
        ) : null}

        {props.overlay}
      </div>
    </FullscreenPortal>
  )
}
