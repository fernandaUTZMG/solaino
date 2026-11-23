import { useState } from 'react'
import {
  produccionCausaDurationLabel,
  produccionCausaElapsedSeconds,
  saveProduccionCausa,
  startProduccionCausaEvento,
  stopProduccionCausaEvento,
  type ProduccionCausa,
  type ProduccionCausaEvento,
} from '../../lib/bodegaProduccionCausasRepo'
import { useLiveClockTick } from './useLiveClockTick.ts'

type Props = {
  dayId: string
  causas: ProduccionCausa[]
  eventos: ProduccionCausaEvento[]
  editable: boolean
  onChanged: () => Promise<void>
}

export function ProduccionCausasDia(props: Props) {
  const running = props.eventos.some((event) => event.ended_at == null)
  const now = useLiveClockTick(running)
  const [causaId, setCausaId] = useState('')
  const [nombre, setNombre] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setErr(null)
    try {
      await action()
      await props.onChanged()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo guardar la causa')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-2 space-y-1.5 border-t border-slate-200 pt-2">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-600">Causas</p>
      {props.eventos.length === 0 ? (
        <p className="text-[11px] text-slate-400">Sin causas este día.</p>
      ) : (
        <ul className="space-y-1">
          {props.eventos.map((event) => {
            const seconds = produccionCausaElapsedSeconds(event, now.getTime())
            const open = event.ended_at == null
            return (
              <li key={event.id} className="flex items-center justify-between gap-2 text-[11px] leading-snug">
                <span className="min-w-0">
                  <span className="font-semibold text-slate-900">{event.nombre}</span>
                  <span className={open ? 'ml-1 font-mono font-bold text-amber-800' : 'ml-1 font-mono text-slate-600'}>
                    {produccionCausaDurationLabel(seconds)}
                  </span>
                </span>
                {props.editable && open ? (
                  <button
                    type="button"
                    disabled={busy}
                    className="shrink-0 rounded-md border border-amber-400 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-950 hover:bg-amber-100 disabled:opacity-50"
                    onClick={() => void run(() => stopProduccionCausaEvento(event.id))}
                  >
                    Parar
                  </button>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
      {props.editable ? (
        <div className="produccion-semanal-no-print space-y-1.5">
          <div className="flex gap-1">
            <select
              value={causaId}
              onChange={(e) => setCausaId(e.target.value)}
              className="min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-1.5 py-1 text-[11px] text-slate-800"
            >
              <option value="">Causas guardadas</option>
              {props.causas.map((causa) => (
                <option key={causa.id} value={causa.id}>
                  {causa.nombre}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={busy || !causaId}
              className="shrink-0 rounded-md bg-sky-700 px-2 py-1 text-[10px] font-bold text-white hover:bg-sky-800 disabled:opacity-50"
              onClick={() => void run(() => startProduccionCausaEvento(props.dayId, causaId))}
            >
              Iniciar tiempo
            </button>
          </div>
          <div className="flex gap-1">
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Nueva causa"
              className="min-w-0 flex-1 rounded-md border border-slate-200 px-1.5 py-1 text-[11px] text-slate-800"
            />
            <button
              type="button"
              disabled={busy || !nombre.trim()}
              className="shrink-0 rounded-md border border-slate-300 bg-white px-2 py-1 text-[10px] font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
              onClick={() =>
                void run(async () => {
                  const saved = await saveProduccionCausa(nombre)
                  setNombre('')
                  setCausaId(saved.id)
                })
              }
            >
              Guardar causa
            </button>
          </div>
        </div>
      ) : null}
      {err ? <p className="text-[11px] text-rose-700">{err}</p> : null}
    </div>
  )
}
