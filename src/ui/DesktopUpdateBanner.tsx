import { useEffect, useState } from 'react'
import { isDesktopApp } from '../lib/loginRemember'

type UpdaterStatus = {
  state: 'checking' | 'available' | 'downloading' | 'downloaded' | 'idle' | 'error'
  version?: string
  currentVersion?: string
  percent?: number
  message?: string
}

export function DesktopUpdateBanner() {
  const [status, setStatus] = useState<UpdaterStatus | null>(null)

  useEffect(() => {
    if (!isDesktopApp() || !window.solainoDesktop?.updater) return
    const unsub = window.solainoDesktop.updater.onStatus((payload) => {
      setStatus(payload as UpdaterStatus)
    })
    void window.solainoDesktop.updater.getVersion()
    return unsub
  }, [])

  if (!status) return null
  if (status.state === 'idle' || status.state === 'checking') return null

  if (status.state === 'error') {
    return (
      <div className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-center text-[13px] text-amber-950">
        No se pudo buscar actualizaciones: {status.message ?? 'error desconocido'}
      </div>
    )
  }

  if (status.state === 'available' || status.state === 'downloading') {
    return (
      <div className="border-b border-sky-200 bg-sky-50 px-4 py-2 text-center text-[13px] text-sky-950">
        {status.state === 'downloading' ? (
          <>
            Descargando actualización v{status.version}…{' '}
            <span className="font-mono font-semibold tabular-nums">{status.percent ?? 0}%</span>
          </>
        ) : (
          <>Nueva versión <strong>v{status.version}</strong> disponible. Descargando…</>
        )}
      </div>
    )
  }

  if (status.state === 'downloaded') {
    return (
      <div className="flex flex-wrap items-center justify-center gap-3 border-b border-emerald-300 bg-emerald-50 px-4 py-2.5 text-[13px] text-emerald-950">
        <span>
          Actualización <strong>v{status.version}</strong> lista. Reinicia para instalar.
        </span>
        <button
          type="button"
          className="rounded-lg bg-emerald-700 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-emerald-800"
          onClick={() => void window.solainoDesktop?.updater?.install()}
        >
          Instalar y reiniciar
        </button>
      </div>
    )
  }

  return null
}
