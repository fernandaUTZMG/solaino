import type { ReactNode } from 'react'
import { FullscreenPortal } from '../../ui/FullscreenPortal.tsx'

type Props = {
  folio: string
  projectName: string
  onClose: () => void
  children: ReactNode
}

/** Pantalla completa para programación (piezas + tiempos + ZIP). */
export function BodegaProgrammerProgrammingFullscreen(props: Props) {
  return (
    <FullscreenPortal>
      <div
        className="fixed inset-0 z-[110] flex h-[100dvh] w-full flex-col bg-slate-100"
        role="dialog"
        aria-modal="true"
        aria-label="Programación CNC y Torno"
      >
        <header className="shrink-0 w-full border-b border-programacion-400/80 bg-gradient-to-r from-programacion-900 via-programacion-700 to-programacion-800 px-4 py-3 text-white shadow-md sm:px-6 sm:py-4 lg:px-8">
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wide text-programacion-100/90">Programación</p>
              <h2 className="truncate text-lg font-bold sm:text-xl">
                <span className="font-mono">{props.folio}</span>
                <span className="mx-2 font-normal text-programacion-200/90">·</span>
                <span className="font-medium">{props.projectName}</span>
              </h2>
            </div>
            <button
              type="button"
              className="min-h-[44px] rounded-xl border border-white/30 bg-white/15 px-5 py-2.5 text-[14px] font-bold text-white shadow-sm transition hover:bg-white/25"
              onClick={props.onClose}
            >
              Volver a archivos y entregas
            </button>
          </div>
        </header>
        <div className="min-h-0 w-full flex-1 overflow-y-auto overscroll-contain">
          <div className="w-full space-y-6 p-4 sm:p-6 lg:px-8 lg:py-8">{props.children}</div>
        </div>
      </div>
    </FullscreenPortal>
  )
}
