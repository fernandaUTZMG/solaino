import { useCallback, useEffect, useState } from 'react'
import type { AppRole } from '../../lib/roles'
import { canAccessMaquinadoNav } from '../../lib/roles'
import type { BodegaProjectPieceWithProject } from '../../lib/bodegaPiecesRepo'
import { fetchPiecesQueueMaquinado } from '../../lib/bodegaPiecesRepo'
import { BodegaOperatorMaquinadoWorkspace } from './BodegaOperatorMaquinadoWorkspace.tsx'

/** Cola de maquinado CNC (piezas programadas sin perfilado). */
export function BodegaMaquinadoPage(props: { role: AppRole }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<BodegaProjectPieceWithProject[]>([])

  const load = useCallback(async () => {
    if (!canAccessMaquinadoNav(props.role)) return
    setLoading(true)
    setError(null)
    try {
      setRows(await fetchPiecesQueueMaquinado())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar la cola de maquinado')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [props.role])

  useEffect(() => {
    void load()
  }, [load])

  if (!canAccessMaquinadoNav(props.role)) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
        Tu rol no tiene acceso a maquinado.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ring-1 ring-slate-900/[0.03] sm:p-6">
        <h1 className="text-xl font-bold text-section-navy">Maquinado CNC</h1>
        <p className="mt-2 max-w-3xl text-[14px] leading-relaxed text-slate-600">
          Solo piezas <strong>CNC</strong> con archivo de programación (cerradas sin perfilado).{' '}
          <strong>Inicio</strong> / <strong>Fin</strong> por pieza, luego Armado o Detallado.
        </p>
        <ol className="mt-4 list-decimal space-y-1 pl-5 text-[13px] text-slate-600">
          <li>
            En Programación: termina CNC con archivo (sin perfilado). Perfilado va a Taller, no a esta cola.
          </li>
          <li>Aquí: elige la pieza → Inicio → Fin → Armado o Detallado.</li>
        </ol>
      </section>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-900">{error}</div>
      ) : null}

      <BodegaOperatorMaquinadoWorkspace rows={rows} loading={loading} onReload={load} />
    </div>
  )
}
