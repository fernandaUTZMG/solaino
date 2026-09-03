import { useCallback, useEffect, useState } from 'react'
import type { AppRole } from '../../lib/roles'
import { canAccessMaquinadoNav } from '../../lib/roles'
import type { BodegaProjectPieceWithProject } from '../../lib/bodegaPiecesRepo'
import { fetchPiecesQueueMaquinado } from '../../lib/bodegaPiecesRepo'
import { BodegaOperatorMaquinadoWorkspace } from './BodegaOperatorMaquinadoWorkspace.tsx'

/** Único lugar para registrar maquinado CNC/Torno (cola de todas las piezas). */
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
      <section className="rounded-2xl border border-amber-200/90 bg-gradient-to-br from-amber-50/90 to-white p-5 shadow-sm sm:p-6">
        <h1 className="text-xl font-bold text-amber-950">Maquinado</h1>
        <p className="mt-2 max-w-3xl text-[14px] leading-relaxed text-amber-950/85">
          Trabajo en <strong>máquina CNC o Torno</strong> por pieza: inicio de tiempo, fin y envío a{' '}
          <strong>Armado</strong> o <strong>Detallado</strong>. La programación del archivo se hace en{' '}
          <strong>Bodega → proyecto → Programación</strong>; aquí solo se maquina.
        </p>
        <ol className="mt-4 list-decimal space-y-1 pl-5 text-[13px] text-amber-950/80">
          <li>
            En Bodega → Programación: CNC/Torno terminan con archivo (sin perfilado). Piezas en columna Perfilado van a{' '}
            <strong>Taller → Perfilado</strong>, no a esta cola.
          </li>
          <li>Aquí: elige la pieza → Inicio → al terminar elige Armado o Detallado.</li>
          <li>Perfilado / Armado / Detallado: menú <strong>Taller</strong>.</li>
        </ol>
      </section>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-900">{error}</div>
      ) : null}

      <BodegaOperatorMaquinadoWorkspace rows={rows} loading={loading} onReload={load} />
    </div>
  )
}
