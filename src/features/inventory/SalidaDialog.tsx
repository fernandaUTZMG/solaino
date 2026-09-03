import { useEffect, useMemo, useState } from 'react'
import type { InventoryItem } from '../../types/inventory'
import { isSupabaseConfigured } from '../../env'
import { makeId } from '../../lib/id'
import { formatEmbarqueUserMessage, registrarEmbarque } from '../../lib/salidasRepo'
import { fetchProductoByCodigo, fetchProductoById } from '../../lib/productosRepo'
import { fetchProductIdsBySerieBusqueda } from '../../lib/seriesRepo'
import { IconHash, IconPlus, IconSave, IconX } from '../../ui/shellIcons'

function IconTruck(props: { className?: string }) {
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
      <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
      <path d="M15 18h2" />
      <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="17" cy="18" r="2" />
    </svg>
  )
}

function TextInput(props: React.ComponentProps<'input'>) {
  return (
    <input
      {...props}
      className={[
        'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none',
        'placeholder:text-slate-400 focus:border-amber-900/35 focus:ring-2 focus:ring-amber-600/20',
        props.className ?? '',
      ].join(' ')}
    />
  )
}

function Field(props: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {props.icon ? <span className="text-amber-900/55">{props.icon}</span> : null}
        <span>{props.label}</span>
      </div>
      {props.children}
    </label>
  )
}

type CartLine = {
  key: string
  codigo: string
  nombre: string
  productoId: string
  tieneSerie: boolean
  /** Piezas a salir (FIFO) o total cuando hay `series`. */
  cantidad: number
  /** Si se definen, el servidor marca solo estas series. */
  series?: string[]
}

type Mode = 'scan' | 'found'

export function SalidaDialog(props: {
  open: boolean
  onClose: () => void
  onSaved?: () => void
  /** Stock actual por producto (para validar y editar cantidades en el carrito). */
  inventarioItems?: InventoryItem[]
  local?: {
    items: InventoryItem[]
    setItems: React.Dispatch<React.SetStateAction<InventoryItem[]>>
  } | null
}) {
  const [mode, setMode] = useState<Mode>('scan')
  const [codigo, setCodigo] = useState('')
  const [found, setFound] = useState<InventoryItem | null>(null)
  const [cantidad, setCantidad] = useState<number>(1)
  const [serieInput, setSerieInput] = useState('')
  const [seriesExplicit, setSeriesExplicit] = useState<string[]>([])
  const [cart, setCart] = useState<CartLine[]>([])
  const [notaEmbarque, setNotaEmbarque] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!props.open) return
    setMode('scan')
    setCodigo('')
    setFound(null)
    setCantidad(1)
    setSerieInput('')
    setSeriesExplicit([])
    setCart([])
    setNotaEmbarque('')
    setBusy(false)
    setError(null)
  }, [props.open])

  const canScan = useMemo(() => codigo.trim().length > 0 && !busy, [codigo, busy])

  const inventario = props.inventarioItems ?? []

  function stockOfProducto(productoId: string, fallback?: number): number {
    const row = inventario.find((i) => i.id === productoId)
    if (row) return row.stockActual
    return fallback ?? 0
  }

  function totalEnCarritoParaProducto(
    productoId: string,
    carrito: CartLine[],
    excluirKey?: string,
  ): number {
    return carrito.reduce((sum, l) => {
      if (l.productoId !== productoId) return sum
      if (excluirKey && l.key === excluirKey) return sum
      return sum + l.cantidad
    }, 0)
  }

  function maxCantidadFifo(line: CartLine, carrito: CartLine[]): number {
    const stock = stockOfProducto(line.productoId)
    const otros = totalEnCarritoParaProducto(line.productoId, carrito, line.key)
    return Math.max(1, stock - otros)
  }

  const fifoEnCarritoParaFound = useMemo(() => {
    if (!found) return null
    const line = cart.find((l) => l.productoId === found.id && !l.series?.length)
    return line ?? null
  }, [cart, found])

  async function onBuscar() {
    const q = codigo.trim()
    if (!q) return
    setBusy(true)
    setError(null)
    try {
      let item = await fetchProductoByCodigo(q)
      if (!item && isSupabaseConfigured()) {
        const bySerie = await fetchProductIdsBySerieBusqueda(q)
        if (bySerie.length === 1) {
          item = await fetchProductoById(bySerie[0]!)
        } else if (bySerie.length > 1) {
          setError('Hay más de un producto con ese número de serie; usa el código de parte.')
          setBusy(false)
          return
        }
      }
      if (item) {
        setFound(item)
        setMode('found')
        setCantidad(1)
        setSerieInput('')
        setSeriesExplicit([])
      } else {
        setError('Producto no registrado. Solo puedes embargar productos que ya existen en inventario.')
        setFound(null)
        setMode('scan')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo buscar el producto')
    } finally {
      setBusy(false)
    }
  }

  function addSerieExplicit() {
    const v = serieInput.trim()
    if (!v) return
    setSeriesExplicit((prev) => {
      if (prev.some((s) => s.toLowerCase() === v.toLowerCase())) return prev
      return [...prev, v]
    })
    setSerieInput('')
  }

  const effectiveQtyForFound = useMemo(() => {
    if (!found?.tieneSerie) return cantidad
    if (seriesExplicit.length === 0) return cantidad
    if (seriesExplicit.length === 1) return cantidad
    return seriesExplicit.length
  }, [found?.tieneSerie, cantidad, seriesExplicit.length])

  const canAddLine = useMemo(() => {
    if (!found || busy) return false
    const qty = effectiveQtyForFound
    if (!Number.isFinite(qty) || qty <= 0) return false
    const yaEnCarrito = totalEnCarritoParaProducto(found.id, cart)
    const stock = stockOfProducto(found.id, found.stockActual)
    if (seriesExplicit.length > 0) {
      if (yaEnCarrito + qty > stock) return false
      return true
    }
    const fifoExistente = cart.find((l) => l.productoId === found.id && !l.series?.length)
    if (fifoExistente) {
      if (fifoExistente.cantidad + qty > stock) return false
    } else if (yaEnCarrito + qty > stock) {
      return false
    }
    return true
  }, [found, busy, effectiveQtyForFound, seriesExplicit.length, cart, inventario])

  function addLineToCart() {
    if (!found || !canAddLine) return
    const qty = effectiveQtyForFound
    const explicit = found.tieneSerie && seriesExplicit.length > 0 ? [...seriesExplicit] : undefined

    setCart((c) => {
      if (explicit) {
        const lineQty = explicit.length === 1 ? qty : explicit.length
        const line: CartLine = {
          key: makeId('emb'),
          codigo: found.codigo,
          nombre: found.nombre,
          productoId: found.id,
          tieneSerie: true,
          cantidad: lineQty,
          series: explicit,
        }
        return [...c, line]
      }

      const idx = c.findIndex((l) => l.productoId === found.id && !l.series?.length)
      const stock = stockOfProducto(found.id, found.stockActual)
      if (idx >= 0) {
        const copy = [...c]
        const prev = copy[idx]!
        const merged = prev.cantidad + qty
        const otros = totalEnCarritoParaProducto(found.id, c, prev.key)
        const maxAllow = Math.max(0, stock - otros)
        const finalQty = Math.min(merged, maxAllow)
        copy[idx] = { ...prev, cantidad: Math.max(1, finalQty) }
        return copy
      }

      const line: CartLine = {
        key: makeId('emb'),
        codigo: found.codigo,
        nombre: found.nombre,
        productoId: found.id,
        tieneSerie: Boolean(found.tieneSerie),
        cantidad: qty,
      }
      return [...c, line]
    })

    setMode('scan')
    setCodigo('')
    setFound(null)
    setCantidad(1)
    setSerieInput('')
    setSeriesExplicit([])
    setError(null)
  }

  function updateCartLineCantidad(key: string, raw: string) {
    const n = Math.max(1, Math.floor(Number(raw)) || 1)
    setCart((c) =>
      c.map((l) => {
        if (l.key !== key) return l
        if (l.series && l.series.length > 1) return l
        const stock = stockOfProducto(l.productoId)
        const otros = totalEnCarritoParaProducto(l.productoId, c, l.key)
        const max = Math.max(1, stock - otros)
        return { ...l, cantidad: Math.min(n, max) }
      }),
    )
  }

  function removeLine(key: string) {
    setCart((c) => c.filter((x) => x.key !== key))
  }

  const canConfirmEmbarque = useMemo(() => cart.length > 0 && !busy, [cart.length, busy])

  async function onConfirmarEmbarque() {
    if (!canConfirmEmbarque) return
    setError(null)
    setBusy(true)
    try {
      const lineas = cart.map((L) =>
        L.series?.length
          ? { codigo: L.codigo, series: L.series, cantidad: L.cantidad }
          : { codigo: L.codigo, cantidad: L.cantidad },
      )

      if (!isSupabaseConfigured()) {
        const local = props.local
        if (!local) throw new Error('Modo local no está disponible en este contexto.')

        const deltaByProduct = new Map<string, number>()
        for (const L of cart) {
          const d = L.cantidad
          deltaByProduct.set(L.productoId, (deltaByProduct.get(L.productoId) ?? 0) + d)
        }

        for (const [pid, d] of deltaByProduct) {
          const row = local.items.find((p) => p.id === pid)
          if (!row || row.stockActual < d) {
            throw new Error('Stock insuficiente (modo local).')
          }
        }

        const now = new Date().toISOString()
        local.setItems((prev) =>
          prev.map((p) => {
            const d = deltaByProduct.get(p.id)
            if (!d) return p
            return {
              ...p,
              stockActual: p.stockActual - d,
              ultimaSalidaISO: now,
            }
          }),
        )
      } else {
        await registrarEmbarque({
          lineas,
          payload: {
            motivo: 'Embarque',
            nota: notaEmbarque.trim() || undefined,
          },
        })
      }

      props.onSaved?.()
      props.onClose()
    } catch (e) {
      setError(formatEmbarqueUserMessage(e))
    } finally {
      setBusy(false)
    }
  }

  if (!props.open) return null

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
        aria-labelledby="salida-dialog-title"
        className="relative flex w-full max-w-2xl max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-3xl border border-amber-900/20 bg-white shadow-2xl shadow-amber-950/10 ring-1 ring-amber-900/10 sm:max-h-[calc(100vh-3rem)]"
      >
        <div className="relative overflow-hidden border-b border-amber-900/25 bg-gradient-to-br from-amber-950 via-amber-950 to-[#3d2800] px-4 py-4 text-white sm:px-6 sm:py-5">
          <div className="pointer-events-none absolute -right-8 -top-12 h-36 w-36 rounded-full bg-amber-400/10 blur-2xl" />
          <div className="relative flex items-start justify-between gap-4">
            <div className="flex min-w-0 flex-1 items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20 shadow-lg">
                <IconTruck className="h-6 w-6 text-amber-100" />
              </div>
              <div className="min-w-0 pt-0.5">
                <h2 id="salida-dialog-title" className="text-lg font-bold tracking-tight sm:text-xl">
                  Embarque / salida
                </h2>
                <p className="mt-1 text-sm leading-snug text-amber-100/88">
                  Busca por código de parte o escanea. Agrega líneas al embarque y confirma para descontar existencias.
                  En productos con serie puedes indicar <span className="font-semibold text-white">cuántas piezas</span>{' '}
                  salen sin escanear cada serie, o agregar números de serie concretos.
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
          <div className="grid gap-4">
            {error ? (
              <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                {error}
              </div>
            ) : null}

            {cart.length > 0 ? (
              <div className="rounded-2xl border border-amber-200/90 bg-amber-50/50 p-4 shadow-sm">
                <div className="mb-2 text-xs font-bold uppercase tracking-wide text-amber-900">Embarque actual</div>
                <ul className="max-h-52 space-y-2 overflow-y-auto">
                  {cart.map((L) => (
                    <li
                      key={L.key}
                      className="flex flex-wrap items-end justify-between gap-2 rounded-xl border border-amber-200/80 bg-white px-3 py-2 text-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-mono text-xs font-semibold text-slate-700">{L.codigo}</div>
                        <div className="truncate font-medium text-slate-900">{L.nombre}</div>
                        {L.series?.length ? (
                          <>
                            <div className="mt-1 text-[11px] text-slate-600">
                              {L.series.length === 1 ? (
                                <>
                                  Serie: <span className="font-mono font-semibold">{L.series[0]}</span>
                                </>
                              ) : (
                                <>
                                  Series ({L.series.length}): {L.series.slice(0, 3).join(', ')}
                                  {L.series.length > 3 ? '…' : ''}
                                </>
                              )}
                            </div>
                            {L.series.length === 1 ? (
                              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                                <label className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                                  Piezas (misma serie)
                                </label>
                                <input
                                  type="number"
                                  inputMode="numeric"
                                  min={1}
                                  max={maxCantidadFifo(L, cart)}
                                  step={1}
                                  value={L.cantidad}
                                  onChange={(e) => updateCartLineCantidad(L.key, e.target.value)}
                                  className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-center text-sm font-semibold tabular-nums text-slate-900 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30"
                                  aria-label={`Cantidad para serie ${L.series[0]}`}
                                />
                                <span className="text-[11px] text-slate-500">máx. {maxCantidadFifo(L, cart)}</span>
                              </div>
                            ) : null}
                          </>
                        ) : (
                          <div className="mt-1.5 flex flex-wrap items-center gap-2">
                            <label className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                              Cantidad
                            </label>
                            <input
                              type="number"
                              inputMode="numeric"
                              min={1}
                              max={maxCantidadFifo(L, cart)}
                              step={1}
                              value={L.cantidad}
                              onChange={(e) => updateCartLineCantidad(L.key, e.target.value)}
                              className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-center text-sm font-semibold tabular-nums text-slate-900 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30"
                              aria-label={`Cantidad para ${L.codigo}`}
                            />
                            <span className="text-[11px] text-slate-500">
                              máx. {maxCantidadFifo(L, cart)}
                              {L.tieneSerie ? ' · FIFO' : null}
                            </span>
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        className="shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        onClick={() => removeLine(L.key)}
                      >
                        Quitar
                      </button>
                    </li>
                  ))}
                </ul>
                <Field label="Nota del embarque (opcional)" icon={<IconHash className="h-3.5 w-3.5 opacity-80" />}>
                  <TextInput
                    value={notaEmbarque}
                    onChange={(e) => setNotaEmbarque(e.target.value)}
                    placeholder="Referencia, cliente, orden…"
                  />
                </Field>
                <button
                  type="button"
                  disabled={!canConfirmEmbarque}
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-700 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-amber-950/25 transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => void onConfirmarEmbarque()}
                >
                  {busy ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Procesando…
                    </>
                  ) : (
                    <>
                      <IconSave className="h-4 w-4 shrink-0 opacity-95" />
                      Confirmar embarque ({cart.length} {cart.length === 1 ? 'línea' : 'líneas'})
                    </>
                  )}
                </button>
              </div>
            ) : null}

            <Field label="Código de parte / escanear" icon={<IconHash className="h-3.5 w-3.5 opacity-80" />}>
              <TextInput
                value={mode === 'found' && found ? found.codigo : codigo}
                onChange={(e) => {
                  if (mode !== 'scan') return
                  setCodigo(e.target.value)
                }}
                placeholder="Escanea o escribe el código…"
                readOnly={mode === 'found'}
                className={mode === 'found' ? 'bg-slate-50 text-slate-700' : ''}
                autoFocus={mode === 'scan'}
                onKeyDown={(e) => {
                  if (mode === 'scan' && e.key === 'Enter') void onBuscar()
                }}
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={mode !== 'scan' || !canScan}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-950 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-900 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => void onBuscar()}
                >
                  Buscar
                </button>
                {mode === 'found' ? (
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
                    onClick={() => {
                      setMode('scan')
                      setFound(null)
                      setCantidad(1)
                      setSeriesExplicit([])
                      setSerieInput('')
                      setError(null)
                    }}
                  >
                    Otro código
                  </button>
                ) : null}
              </div>
            </Field>

            {mode === 'found' && found ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-1">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Producto</div>
                  <div className="text-base font-bold text-slate-900">
                    {found.codigo} · {found.nombre}
                  </div>
                  <div className="text-sm text-slate-600">
                    Existencias actuales:{' '}
                    <span className="font-semibold tabular-nums text-slate-900">{found.stockActual}</span>
                    {found.tieneSerie ? (
                      <span className="text-slate-500"> (control por número de serie)</span>
                    ) : null}
                  </div>
                </div>

                {fifoEnCarritoParaFound && !seriesExplicit.length ? (
                  <p className="mt-2 rounded-lg border border-sky-200 bg-sky-50/90 px-3 py-2 text-[12px] leading-snug text-sky-950">
                    Este código <span className="font-semibold">ya está en el embarque</span> ({fifoEnCarritoParaFound.cantidad}{' '}
                    piezas). Indica cuántas más salen y pulsa <span className="font-semibold">Agregar</span> para sumarlas, o
                    ajusta la cantidad directamente en la lista de arriba.
                  </p>
                ) : null}

                {found.tieneSerie ? (
                  <div className="mt-4 space-y-3">
                    <Field label="¿Cuántas piezas salen? (sin listar cada serie)">
                      <TextInput
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={found.stockActual}
                        step={1}
                        value={cantidad}
                        disabled={seriesExplicit.length > 1}
                        onChange={(e) => {
                          const n = Math.max(1, Math.floor(Number(e.target.value)) || 1)
                          setCantidad(Math.min(n, found.stockActual))
                        }}
                      />
                      <p className="mt-1 text-[11px] text-slate-500">
                        Se marcan como salida las series <span className="font-medium">disponibles más antiguas</span> (FIFO)
                        en la cantidad indicada.
                      </p>
                    </Field>
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-3 py-2">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                        Opcional: series concretas
                      </div>
                      <p className="mt-1 text-[11px] leading-snug text-slate-600">
                        Si agregas una o más series aquí: con <span className="font-medium">una sola</span> serie, la cantidad
                        de arriba indica cuántas piezas salen de ese número; con <span className="font-medium">varias</span>{' '}
                        distintas, cada una cuenta como 1 pieza y el campo de cantidad se desactiva.
                      </p>
                      <div className="mt-2 flex gap-2">
                        <TextInput
                          value={serieInput}
                          onChange={(e) => setSerieInput(e.target.value)}
                          placeholder="Número de serie…"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') addSerieExplicit()
                          }}
                        />
                        <button
                          type="button"
                          className="inline-flex shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
                          onClick={() => addSerieExplicit()}
                        >
                          Agregar
                        </button>
                      </div>
                      {seriesExplicit.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {seriesExplicit.map((s) => (
                            <button
                              key={s}
                              type="button"
                              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                              title="Quitar"
                              onClick={() => setSeriesExplicit((prev) => prev.filter((x) => x !== s))}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="mt-4">
                    <Field label="Cantidad a descontar">
                      <TextInput
                        type="number"
                        inputMode="decimal"
                        min={1}
                        max={found.stockActual}
                        step={1}
                        value={cantidad}
                        onChange={(e) => {
                          const n = Math.max(1, Math.floor(Number(e.target.value)) || 1)
                          setCantidad(Math.min(n, found.stockActual))
                        }}
                      />
                    </Field>
                  </div>
                )}

                {!canAddLine && found ? (
                  <p className="mt-2 text-xs text-rose-600">
                    {effectiveQtyForFound <= 0
                      ? 'Indica una cantidad válida.'
                      : effectiveQtyForFound > found.stockActual
                        ? 'La cantidad supera las existencias.'
                        : null}
                  </p>
                ) : null}

                <button
                  type="button"
                  disabled={!canAddLine}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-bold text-amber-950 shadow-sm transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => addLineToCart()}
                >
                  <IconPlus className="h-4 w-4 shrink-0 opacity-95" />
                  Agregar al embarque
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
