import { useEffect, useMemo, useState } from 'react'
import type { InventoryItem } from '../../types/inventory'
import { formatFechaHoraLocal } from '../../lib/formatDateTime'
import { fetchMovimientosByProducto, type MovimientoDbRow } from '../../lib/movimientosRepo'
import { isProductoUuid } from '../../lib/productosRepo'
import { isSupabaseConfigured } from '../../env'
import { IconNavInventory, IconX } from '../../ui/shellIcons'

function IconArrowDownCircle(props: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v8M8 14l4 4 4-4" />
    </svg>
  )
}

function IconArrowUpCircle(props: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16V8M8 10l4-4 4 4" />
    </svg>
  )
}

function normalizeTipo(t: string): string {
  return String(t ?? '').trim().toLowerCase()
}

function MovimientoList(props: {
  rows: MovimientoDbRow[]
  tone: 'entrada' | 'salida' | 'otro'
  emptyLabel: string
}) {
  if (props.rows.length === 0) {
    return <p className="py-6 text-center text-sm text-slate-500">{props.emptyLabel}</p>
  }

  return (
    <ul className="max-h-[min(40vh,22rem)] space-y-2 overflow-y-auto pr-1">
      {props.rows.map((r) => (
        <li
          key={r.id}
          className={[
            'rounded-xl border px-3 py-2.5 text-sm shadow-sm',
            props.tone === 'entrada'
              ? 'border-emerald-200/80 bg-emerald-50/80'
              : props.tone === 'salida'
                ? 'border-amber-200/80 bg-amber-50/80'
                : 'border-slate-200 bg-slate-50/90',
          ].join(' ')}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="font-semibold tabular-nums text-slate-900">
              Cantidad: <span className="text-base">{r.cantidad}</span>
            </span>
            <time
              className="text-[12px] font-medium text-slate-600"
              dateTime={r.fecha}
              title={r.fecha}
            >
              {formatFechaHoraLocal(r.fecha)}
            </time>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[12px] text-slate-700">
            <span>
              <span className="text-slate-500">Motivo:</span> {r.motivo?.trim() || '—'}
            </span>
            {r.responsable?.trim() ? (
              <span>
                <span className="text-slate-500">Responsable:</span> {r.responsable.trim()}
              </span>
            ) : null}
          </div>
          {r.nota?.trim() ? (
            <p className="mt-1.5 border-t border-black/5 pt-1.5 text-[12px] leading-snug text-slate-600">
              <span className="font-medium text-slate-500">Nota:</span> {r.nota.trim()}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

export function ProductHistorialDialog(props: {
  open: boolean
  item: InventoryItem | null
  useLocal: boolean
  onClose: () => void
}) {
  const [rows, setRows] = useState<MovimientoDbRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!props.open || !props.item) return

    if (props.useLocal || !isSupabaseConfigured()) {
      setRows([])
      setError(null)
      setLoading(false)
      return
    }

    if (!isProductoUuid(props.item.id)) {
      setRows([])
      setError('Este producto es local (sin UUID de Supabase); no hay historial de movimientos en la nube.')
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)
    void fetchMovimientosByProducto(props.item.id)
      .then((data) => {
        if (!cancelled) setRows(data)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'No se pudo cargar el historial')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [props.open, props.item?.id, props.useLocal])

  const { entradas, salidas, otros } = useMemo(() => {
    const entradas: MovimientoDbRow[] = []
    const salidas: MovimientoDbRow[] = []
    const otros: MovimientoDbRow[] = []
    for (const r of rows) {
      const t = normalizeTipo(r.tipo)
      if (t === 'entrada') entradas.push(r)
      else if (t === 'salida') salidas.push(r)
      else otros.push(r)
    }
    return { entradas, salidas, otros }
  }, [rows])

  if (!props.open || !props.item) return null

  const item = props.item

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-[2px] transition hover:bg-slate-900/65"
        onClick={() => props.onClose()}
        aria-label="Cerrar"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-historial-title"
        className="relative flex w-full max-w-3xl max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-3xl border border-blue-950/25 bg-white shadow-2xl shadow-blue-950/15 ring-1 ring-blue-950/10 sm:max-h-[calc(100vh-3rem)]"
      >
        <div className="relative overflow-hidden border-b border-blue-950/25 bg-section-navy px-4 py-4 text-white sm:px-6 sm:py-5">
          <div className="pointer-events-none absolute -right-8 -top-12 h-36 w-36 rounded-full bg-blue-400/15 blur-2xl" />
          <div className="relative flex items-start justify-between gap-4">
            <div className="flex min-w-0 flex-1 items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20 shadow-lg">
                <IconNavInventory className="h-6 w-6 text-blue-100" />
              </div>
              <div className="min-w-0 pt-0.5">
                <h2 id="product-historial-title" className="text-lg font-bold tracking-tight sm:text-xl">
                  Historial del producto
                </h2>
                <p className="mt-1 truncate font-mono text-sm text-blue-100/90" title={item.codigo}>
                  {item.codigo}
                </p>
                <p className="truncate text-sm font-semibold text-white/95" title={item.nombre}>
                  {item.nombre}
                </p>
              </div>
            </div>
            <button
              type="button"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition hover:bg-white/20"
              onClick={() => props.onClose()}
              aria-label="Cerrar"
            >
              <IconX className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-slate-50 via-white to-slate-50/90 p-4 sm:p-6">
          {props.useLocal || !isSupabaseConfigured() ? (
            <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              En modo local no se consultan movimientos en Supabase. Conecta la app a la nube para ver entradas y
              salidas registradas.
            </p>
          ) : null}

          {error ? (
            <div role="alert" className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
              {error}
            </div>
          ) : null}

          {loading ? (
            <p className="py-8 text-center text-sm text-slate-600">Cargando movimientos…</p>
          ) : !props.useLocal && isSupabaseConfigured() && !error ? (
            <div className="grid gap-6 lg:grid-cols-2">
              <section className="rounded-2xl border border-emerald-200/80 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-2 border-b border-emerald-100 pb-2">
                  <IconArrowDownCircle className="h-5 w-5 shrink-0 text-emerald-700" aria-hidden />
                  <h3 className="text-[13px] font-bold uppercase tracking-wide text-emerald-900">Entradas</h3>
                  <span className="ml-auto text-[12px] font-semibold tabular-nums text-emerald-800">
                    {entradas.length}
                  </span>
                </div>
                <MovimientoList
                  rows={entradas}
                  tone="entrada"
                  emptyLabel="Sin entradas registradas en movimientos."
                />
              </section>

              <section className="rounded-2xl border border-amber-200/80 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-2 border-b border-amber-100 pb-2">
                  <IconArrowUpCircle className="h-5 w-5 shrink-0 text-amber-800" aria-hidden />
                  <h3 className="text-[13px] font-bold uppercase tracking-wide text-amber-950">
                    Salidas / embarques
                  </h3>
                  <span className="ml-auto text-[12px] font-semibold tabular-nums text-amber-900">
                    {salidas.length}
                  </span>
                </div>
                <MovimientoList
                  rows={salidas}
                  tone="salida"
                  emptyLabel="Sin salidas registradas en movimientos."
                />
              </section>

              {otros.length > 0 ? (
                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
                  <div className="mb-3 flex items-center gap-2 border-b border-slate-100 pb-2">
                    <h3 className="text-[13px] font-bold uppercase tracking-wide text-slate-700">Otros movimientos</h3>
                    <span className="ml-auto text-[12px] font-semibold tabular-nums text-slate-600">{otros.length}</span>
                  </div>
                  <MovimientoList rows={otros} tone="otro" emptyLabel="" />
                </section>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
