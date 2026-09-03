import { useEffect, useMemo, useState } from 'react'
import type { InventoryItem } from '../../types/inventory'
import { isSupabaseConfigured } from '../../env'
import {
  formatRegistroEntradaUserMessage,
  isEntradaSerieOtroProductoMessage,
  registrarEntrada,
} from '../../lib/entradasRepo'
import { fetchProductoByCodigo, fetchProductoById, updateProducto } from '../../lib/productosRepo'
import { fetchProductIdsBySerieBusqueda } from '../../lib/seriesRepo'
import { makeId } from '../../lib/id'
import { IconHash, IconNavInventory, IconPlus, IconSave, IconX } from '../../ui/shellIcons'
import { canManageInventory, type AppRole } from '../../lib/roles'

function TextInput(props: React.ComponentProps<'input'>) {
  return (
    <input
      {...props}
      className={[
        'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none',
        'placeholder:text-slate-400 focus:border-blue-950/40 focus:ring-2 focus:ring-section-navy/20',
        props.className ?? '',
      ].join(' ')}
    />
  )
}

function TextArea(props: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      {...props}
      className={[
        'min-h-[88px] w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none',
        'placeholder:text-slate-400 focus:border-blue-950/40 focus:ring-2 focus:ring-section-navy/20',
        props.className ?? '',
      ].join(' ')}
    />
  )
}

function Field(props: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {props.icon ? <span className="text-blue-900/55">{props.icon}</span> : null}
        <span>{props.label}</span>
      </div>
      {props.children}
    </label>
  )
}

type Mode = 'scan' | 'found' | 'create'

type SerieLine = { key: string; serie: string; cantidad: number }

type EntradaCartLine = {
  key: string
  productoId: string
  codigo: string
  nombre: string
  tieneSerie: boolean
  /** Solo sin serie */
  cantidad: number
  /** Solo con serie: copia de líneas al agregar al carrito */
  seriesLineas: { serie: string; cantidad: number }[]
}

const defaultCreate: Omit<InventoryItem, 'id'> = {
  codigo: '',
  nombre: '',
  medida: '',
  codigoProducto: '',
  descripcion: '',
  categoriaId: 'cat_componentes',
  stockActual: 0,
  stockMinimo: 0,
  unidad: 'piezas',
  ubicacion: { area: 'Almacén principal', ubicacion: '' },
  costoUnitario: 0,
  proveedorId: '',
  partNumber: '',
  fabricante: '',
  estado: 'Disponible',
  imagenUrl: '',
  datasheetUrl: '',
  tieneSerie: false,
}

function parseSeriesBulk(raw: string): string[] {
  return raw
    .split(/[\n,;]+/g)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function EntradaDialog(props: {
  open: boolean
  onClose: () => void
  onSaved?: () => void
  role?: AppRole
  /** Tras activar «con serie» u otros cambios de producto desde este diálogo */
  onProductMetaChanged?: () => void
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
  const [piezasEstaSerie, setPiezasEstaSerie] = useState(1)
  const [bulkSeriesText, setBulkSeriesText] = useState('')
  const [serieLines, setSerieLines] = useState<SerieLine[]>([])
  const [createForm, setCreateForm] = useState<Omit<InventoryItem, 'id'>>(defaultCreate)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [serieConflictoMessage, setSerieConflictoMessage] = useState<string | null>(null)
  const [cart, setCart] = useState<EntradaCartLine[]>([])

  useEffect(() => {
    if (!props.open) return
    setMode('scan')
    setCodigo('')
    setFound(null)
    setCantidad(1)
    setSerieInput('')
    setPiezasEstaSerie(1)
    setBulkSeriesText('')
    setSerieLines([])
    setCreateForm(defaultCreate)
    setCart([])
    setBusy(false)
    setError(null)
    setSerieConflictoMessage(null)
  }, [props.open])

  const canScan = useMemo(() => codigo.trim().length > 0 && !busy, [codigo, busy])

  const totalPiezasSeries = useMemo(
    () => serieLines.reduce((acc, L) => acc + L.cantidad, 0),
    [serieLines],
  )

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
        setPiezasEstaSerie(1)
        setBulkSeriesText('')
        setSerieLines([])
      } else {
        setFound(null)
        setMode('create')
        setCreateForm((s) => ({ ...defaultCreate, ...s, codigo: q }))
        setCantidad(1)
        setSerieInput('')
        setPiezasEstaSerie(1)
        setBulkSeriesText('')
        setSerieLines([])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo buscar el producto')
    } finally {
      setBusy(false)
    }
  }

  function mergeSerieLine(serie: string, piezas: number) {
    const trim = serie.trim()
    if (!trim || piezas < 1) return
    setSerieLines((prev) => {
      const i = prev.findIndex((L) => L.serie.toLowerCase() === trim.toLowerCase())
      if (i >= 0) {
        const copy = [...prev]
        const row = copy[i]!
        copy[i] = { ...row, cantidad: row.cantidad + piezas }
        return copy
      }
      return [...prev, { key: makeId('se'), serie: trim, cantidad: piezas }]
    })
  }

  function addSerieFromInput() {
    const piezas = Math.max(1, Math.floor(piezasEstaSerie) || 1)
    mergeSerieLine(serieInput, piezas)
    setSerieInput('')
    setPiezasEstaSerie(1)
  }

  function flushBulkSeries() {
    const parsed = parseSeriesBulk(bulkSeriesText)
    if (!parsed.length) return
    for (const p of parsed) mergeSerieLine(p, 1)
    setBulkSeriesText('')
  }

  function updateLineCantidad(key: string, raw: string) {
    const n = Math.max(1, Math.floor(Number(raw)) || 1)
    setSerieLines((prev) => prev.map((L) => (L.key === key ? { ...L, cantidad: n } : L)))
  }

  const isAdmin = canManageInventory(props.role ?? 'user')

  function goToScanNext() {
    setMode('scan')
    setFound(null)
    setCodigo('')
    setCantidad(1)
    setSerieInput('')
    setPiezasEstaSerie(1)
    setBulkSeriesText('')
    setSerieLines([])
    setError(null)
  }

  function addFoundToCart() {
    if (!found || busy) return
    if (found.tieneSerie) {
      if (serieLines.length === 0) return
      setCart((c) => [
        ...c,
        {
          key: makeId('ent'),
          productoId: found.id,
          codigo: found.codigo,
          nombre: found.nombre,
          tieneSerie: true,
          cantidad: 0,
          seriesLineas: serieLines.map((L) => ({ serie: L.serie, cantidad: L.cantidad })),
        },
      ])
    } else {
      if (!Number.isFinite(cantidad) || cantidad < 1) return
      setCart((c) => [
        ...c,
        {
          key: makeId('ent'),
          productoId: found.id,
          codigo: found.codigo,
          nombre: found.nombre,
          tieneSerie: false,
          cantidad,
          seriesLineas: [],
        },
      ])
    }
    goToScanNext()
  }

  function updateEntradaCartCantidad(lineKey: string, raw: string) {
    const n = Math.max(1, Math.floor(Number(raw)) || 1)
    setCart((c) => c.map((L) => (L.key === lineKey && !L.tieneSerie ? { ...L, cantidad: n } : L)))
  }

  function removeEntradaCartLine(lineKey: string) {
    setCart((c) => c.filter((L) => L.key !== lineKey))
  }

  async function activarSerieEnProducto() {
    if (!found || !isAdmin) return
    setBusy(true)
    setError(null)
    try {
      if (!isSupabaseConfigured()) {
        const local = props.local
        if (!local) throw new Error('Modo local no está disponible en este contexto.')
        local.setItems((prev) =>
          prev.map((p) => (p.id === found.id ? { ...p, tieneSerie: true } : p)),
        )
      } else {
        await updateProducto({ ...found, tieneSerie: true }, { previousStockActual: found.stockActual })
      }
      setFound({ ...found, tieneSerie: true })
      props.onProductMetaChanged?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo activar el control por serie.')
    } finally {
      setBusy(false)
    }
  }

  const canConfirmCart = useMemo(() => cart.length > 0 && !busy, [cart.length, busy])

  async function confirmarCarrito() {
    if (!canConfirmCart) return
    setBusy(true)
    setError(null)
    try {
      if (!isSupabaseConfigured()) {
        const local = props.local
        if (!local) throw new Error('Modo local no está disponible en este contexto.')
        const now = new Date().toISOString()
        const deltaById = new Map<string, number>()
        for (const line of cart) {
          const d = line.tieneSerie
            ? line.seriesLineas.reduce((a, s) => a + s.cantidad, 0)
            : line.cantidad
          deltaById.set(line.productoId, (deltaById.get(line.productoId) ?? 0) + d)
        }
        local.setItems((prev) =>
          prev.map((p) => {
            const d = deltaById.get(p.id)
            if (!d) return p
            return { ...p, stockActual: p.stockActual + d, ultimaEntradaISO: now }
          }),
        )
      } else {
        for (const line of cart) {
          if (line.tieneSerie) {
            await registrarEntrada({
              codigo: line.codigo,
              seriesLineas: line.seriesLineas,
            })
          } else {
            await registrarEntrada({
              codigo: line.codigo,
              cantidad: line.cantidad,
            })
          }
        }
      }
      setCart([])
      props.onSaved?.()
      props.onClose()
    } catch (e) {
      const m = formatRegistroEntradaUserMessage(e)
      if (isEntradaSerieOtroProductoMessage(m)) setSerieConflictoMessage(m)
      else setError(m)
    } finally {
      setBusy(false)
    }
  }

  const canSaveFound = useMemo(() => {
    if (busy) return false
    if (!found) return false
    if (!found.tieneSerie) {
      return Number.isFinite(cantidad) && cantidad >= 1 && cantidad === Math.floor(cantidad)
    }
    return serieLines.length > 0 && serieLines.every((L) => L.cantidad >= 1)
  }, [busy, found, cantidad, serieLines])

  const canSaveCreate = useMemo(() => {
    if (!createForm.codigo.trim() || !createForm.nombre.trim() || busy) return false
    if (createForm.tieneSerie) {
      return serieLines.length > 0 && serieLines.every((L) => L.cantidad >= 1)
    }
    return Number.isFinite(cantidad) && cantidad >= 1 && cantidad === Math.floor(cantidad)
  }, [createForm.codigo, createForm.nombre, createForm.tieneSerie, cantidad, busy, serieLines])

  async function onGuardar() {
    setError(null)
    setBusy(true)
    try {
      if (mode === 'found' && found) {
        if (found.tieneSerie && serieLines.length === 0) {
          throw new Error('Agrega al menos un número de serie con su cantidad.')
        }

        if (!isSupabaseConfigured()) {
          const local = props.local
          if (!local) throw new Error('Modo local no está disponible en este contexto.')
          const delta = found.tieneSerie ? totalPiezasSeries : cantidad
          local.setItems((prev) => {
            const idx = prev.findIndex((p) => p.id === found.id)
            if (idx === -1) return prev
            const now = new Date().toISOString()
            const next = {
              ...prev[idx]!,
              stockActual: prev[idx]!.stockActual + delta,
              ultimaEntradaISO: now,
            }
            const copy = [...prev]
            copy[idx] = next
            return copy
          })
        } else if (found.tieneSerie) {
          await registrarEntrada({
            codigo: found.codigo,
            seriesLineas: serieLines.map((L) => ({ serie: L.serie, cantidad: L.cantidad })),
          })
        } else {
          await registrarEntrada({
            codigo: found.codigo,
            cantidad,
          })
        }
        props.onSaved?.()
        props.onClose()
        return
      }

      if (mode === 'create') {
        if (createForm.tieneSerie && serieLines.length === 0) {
          throw new Error('Agrega al menos un número de serie con su cantidad.')
        }

        if (!isSupabaseConfigured()) {
          const local = props.local
          if (!local) throw new Error('Modo local no está disponible en este contexto.')
          const now = new Date().toISOString()
          const stockInicial = createForm.tieneSerie ? totalPiezasSeries : cantidad
          const item: InventoryItem = {
            id: crypto.randomUUID(),
            ...defaultCreate,
            ...createForm,
            codigo: createForm.codigo.trim(),
            nombre: createForm.nombre.trim(),
            stockActual: stockInicial,
            ultimaEntradaISO: now,
          }
          local.setItems((prev) => [...prev, item])
        } else if (createForm.tieneSerie) {
          await registrarEntrada({
            codigo: createForm.codigo.trim(),
            seriesLineas: serieLines.map((L) => ({ serie: L.serie, cantidad: L.cantidad })),
            payload: {
              nombre: createForm.nombre,
              categoriaId: createForm.categoriaId,
              unidad: createForm.unidad,
              ubicacionArea: createForm.ubicacion.area,
              ubicacionDetalle: createForm.ubicacion.ubicacion,
              costoUnitario: createForm.costoUnitario,
              estado: createForm.estado,
              tieneSerie: true,
            },
          })
        } else {
          await registrarEntrada({
            codigo: createForm.codigo.trim(),
            cantidad,
            payload: {
              nombre: createForm.nombre,
              categoriaId: createForm.categoriaId,
              unidad: createForm.unidad,
              ubicacionArea: createForm.ubicacion.area,
              ubicacionDetalle: createForm.ubicacion.ubicacion,
              costoUnitario: createForm.costoUnitario,
              estado: createForm.estado,
              tieneSerie: false,
            },
          })
        }
        props.onSaved?.()
        props.onClose()
      }
    } catch (e) {
      const m = formatRegistroEntradaUserMessage(e)
      if (isEntradaSerieOtroProductoMessage(m)) setSerieConflictoMessage(m)
      else setError(m)
    } finally {
      setBusy(false)
    }
  }

  if (!props.open) return null

  return (
    <>
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
        aria-labelledby="entrada-dialog-title"
        className="relative flex w-full max-w-2xl max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-3xl border border-blue-950/25 bg-white shadow-2xl shadow-blue-950/15 ring-1 ring-blue-950/10 sm:max-h-[calc(100vh-3rem)]"
      >
        <div className="relative overflow-hidden border-b border-blue-950/25 bg-section-navy px-4 py-4 text-white sm:px-6 sm:py-5">
          <div className="pointer-events-none absolute -right-8 -top-12 h-36 w-36 rounded-full bg-blue-400/15 blur-2xl" />
          <div className="relative flex items-start justify-between gap-4">
            <div className="flex min-w-0 flex-1 items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20 shadow-lg">
                <IconNavInventory className="h-6 w-6 text-blue-100" />
              </div>
              <div className="min-w-0 pt-0.5">
                <h2 id="entrada-dialog-title" className="text-lg font-bold tracking-tight sm:text-xl">
                  Registrar entrada
                </h2>
                <p className="mt-1 text-sm leading-snug text-blue-100/88">
                  Busca por <span className="font-semibold text-white">código de parte</span> o{' '}
                  <span className="font-semibold text-white">número de serie</span>. Puedes{' '}
                  <span className="font-semibold text-white">agregar varios productos al carrito</span>, ajustar
                  cantidades en la lista y confirmar todo junto, o guardar solo la línea actual.
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
              <div className="rounded-2xl border border-blue-200/90 bg-gradient-to-br from-blue-50/90 to-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-blue-900/75">
                      Carrito de esta entrada
                    </div>
                    <p className="mt-0.5 text-[12px] leading-snug text-slate-600">
                      {cart.length} {cart.length === 1 ? 'producto' : 'productos'} listos. Ajusta cantidades (sin serie)
                      o quita líneas antes de confirmar.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={!canConfirmCart}
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-section-navy px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-blue-950/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => void confirmarCarrito()}
                  >
                    <IconSave className="h-4 w-4 shrink-0 opacity-95" />
                    Confirmar carrito
                  </button>
                </div>
                <ul className="mt-3 space-y-2">
                  {cart.map((line) => {
                    const piezasSerie = line.tieneSerie
                      ? line.seriesLineas.reduce((a, s) => a + s.cantidad, 0)
                      : 0
                    return (
                      <li
                        key={line.key}
                        className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200/90 bg-white px-3 py-2.5 shadow-sm"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-bold text-slate-900">
                            {line.codigo} · {line.nombre}
                          </div>
                          {line.tieneSerie ? (
                            <div className="mt-0.5 text-[11px] text-slate-600">
                              {line.seriesLineas.length} número(s) de serie ·{' '}
                              <span className="font-semibold tabular-nums">{piezasSerie}</span> pieza(s)
                            </div>
                          ) : null}
                        </div>
                        {!line.tieneSerie ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-semibold uppercase text-slate-500">Cant.</span>
                            <TextInput
                              type="number"
                              inputMode="numeric"
                              min={1}
                              step={1}
                              className="w-24 py-1.5 text-center text-xs"
                              value={line.cantidad}
                              onChange={(e) => updateEntradaCartCantidad(line.key, e.target.value)}
                            />
                          </div>
                        ) : null}
                        <button
                          type="button"
                          className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-semibold text-rose-800 transition hover:bg-rose-100"
                          onClick={() => removeEntradaCartLine(line.key)}
                        >
                          Quitar
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ) : null}

            <Field label="Número de parte / código" icon={<IconHash className="h-3.5 w-3.5 opacity-80" />}>
              <TextInput
                value={mode === 'found' && found ? found.codigo : mode === 'create' ? createForm.codigo : codigo}
                onChange={(e) => {
                  if (mode === 'scan') setCodigo(e.target.value)
                  if (mode === 'create') setCreateForm((s) => ({ ...s, codigo: e.target.value }))
                }}
                placeholder="Escanea o escribe…"
                readOnly={mode === 'found'}
                className={mode === 'found' ? 'bg-slate-50 text-slate-700' : ''}
                autoFocus={mode === 'scan'}
                onKeyDown={(e) => {
                  if (mode === 'scan' && e.key === 'Enter') void onBuscar()
                }}
              />
            </Field>

            {mode === 'scan' ? (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={!canScan}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-section-navy px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => void onBuscar()}
                >
                  Buscar
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
                  onClick={() => {
                    setMode('scan')
                    setFound(null)
                    setCreateForm(defaultCreate)
                    setCodigo('')
                    setCantidad(1)
                    setSerieInput('')
                    setPiezasEstaSerie(1)
                    setBulkSeriesText('')
                    setSerieLines([])
                    setError(null)
                  }}
                >
                  Otro código
                </button>
              </div>
            )}

            {mode === 'found' && found ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-1">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Producto encontrado</div>
                  <div className="text-base font-bold text-slate-900">
                    {found.codigo} · {found.nombre}
                  </div>
                  <div className="text-sm text-slate-600">
                    Stock actual: <span className="font-semibold text-slate-900">{found.stockActual}</span>
                  </div>
                </div>

                {isAdmin && !found.tieneSerie ? (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-2.5">
                    <p className="text-[12px] leading-snug text-amber-950">
                      Como <span className="font-semibold">administrador</span> puedes activar el control por número de
                      serie para este producto. Luego podrás capturar series en este mismo panel.
                    </p>
                    <button
                      type="button"
                      disabled={busy}
                      className="mt-2 inline-flex w-full items-center justify-center rounded-xl border border-amber-300/80 bg-white px-3 py-2 text-sm font-semibold text-amber-950 shadow-sm transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                      onClick={() => void activarSerieEnProducto()}
                    >
                      Activar control por serie
                    </button>
                  </div>
                ) : null}

                {!found.tieneSerie ? (
                  <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50/90 px-3 py-2 text-[12px] leading-snug text-slate-700">
                    Este producto <span className="font-semibold">no</span> usa control por número de serie. Indica la{' '}
                    <span className="font-semibold">cantidad</span> que ingresa, agrégalo al carrito o guarda solo esta
                    entrada.
                  </p>
                ) : (
                  <p className="mt-3 rounded-xl border border-emerald-200/80 bg-emerald-50/70 px-3 py-2 text-[12px] leading-snug text-emerald-950">
                    <span className="font-semibold">Control por serie.</span> Mismo número de serie puede representar varias
                    piezas: escanea una vez y ajusta la cantidad al lado. Total en esta entrada:{' '}
                    <span className="font-semibold tabular-nums">{totalPiezasSeries}</span> pieza(s).
                  </p>
                )}

                {found.tieneSerie ? (
                  <div className="mt-4 space-y-3">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
                      <div className="min-w-0 flex-1">
                        <Field label="Número de serie (escaneo o Enter)">
                          <TextInput
                            value={serieInput}
                            onChange={(e) => setSerieInput(e.target.value)}
                            placeholder="Ej. 7503033120316"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') addSerieFromInput()
                            }}
                          />
                        </Field>
                      </div>
                      <div className="w-full shrink-0 sm:w-32">
                        <Field label="Piezas (misma serie)">
                          <TextInput
                            type="number"
                            inputMode="numeric"
                            min={1}
                            step={1}
                            value={piezasEstaSerie}
                            onChange={(e) => {
                              const n = Number(e.target.value)
                              setPiezasEstaSerie(Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1)
                            }}
                          />
                        </Field>
                      </div>
                      <button
                        type="button"
                        className="inline-flex shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 lg:mb-0.5"
                        onClick={() => addSerieFromInput()}
                      >
                        Agregar
                      </button>
                    </div>

                    <Field label="Pegar varias series (una por línea = 1 pieza; se puede repetir el mismo número)">
                      <TextArea
                        value={bulkSeriesText}
                        onChange={(e) => setBulkSeriesText(e.target.value)}
                        placeholder={'7503033120316\n7503033120316\nOtroSerial'}
                      />
                      <button
                        type="button"
                        className="mt-2 inline-flex items-center justify-center rounded-xl bg-section-navy px-4 py-2 text-sm font-semibold text-white shadow-sm hover:brightness-110"
                        onClick={() => flushBulkSeries()}
                      >
                        Agregar listado
                      </button>
                    </Field>

                    {serieLines.length > 0 ? (
                      <div>
                        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          Líneas en esta entrada ({serieLines.length} · {totalPiezasSeries} piezas)
                        </div>
                        <ul className="max-h-48 space-y-2 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50/80 p-2">
                          {serieLines.map((L) => (
                            <li
                              key={L.key}
                              className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2"
                            >
                              <span className="min-w-0 flex-1 font-mono text-xs font-semibold text-slate-900">{L.serie}</span>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-semibold uppercase text-slate-500">Cant.</span>
                                <TextInput
                                  type="number"
                                  inputMode="numeric"
                                  min={1}
                                  step={1}
                                  className="w-20 py-1.5 text-center text-xs"
                                  value={L.cantidad}
                                  onChange={(e) => updateLineCantidad(L.key, e.target.value)}
                                />
                              </div>
                              <button
                                type="button"
                                className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-800 hover:bg-rose-100"
                                onClick={() => setSerieLines((prev) => prev.filter((x) => x.key !== L.key))}
                              >
                                Quitar
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-4 space-y-4">
                    <Field label="Cantidad a ingresar">
                      <TextInput
                        type="number"
                        inputMode="numeric"
                        min={1}
                        step={1}
                        value={cantidad}
                        onChange={(e) => {
                          const n = Number(e.target.value)
                          setCantidad(Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1)
                        }}
                      />
                      <p className="mt-1 text-[11px] leading-snug text-slate-500">
                        Piezas que se suman al inventario de este código.
                      </p>
                    </Field>
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                      <button
                        type="button"
                        disabled={!canSaveFound}
                        className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={() => addFoundToCart()}
                      >
                        <IconPlus className="h-4 w-4 shrink-0 opacity-95" />
                        Agregar al carrito
                      </button>
                      <button
                        type="button"
                        disabled={!canSaveFound}
                        className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-section-navy px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-950/25 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={() => void onGuardar()}
                      >
                        <IconSave className="h-4 w-4 shrink-0 opacity-95" />
                        Guardar esta entrada
                      </button>
                    </div>
                  </div>
                )}

                {found.tieneSerie ? (
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <button
                      type="button"
                      disabled={!canSaveFound}
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={() => addFoundToCart()}
                    >
                      <IconPlus className="h-4 w-4 shrink-0 opacity-95" />
                      Agregar al carrito
                    </button>
                    <button
                      type="button"
                      disabled={!canSaveFound}
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-section-navy px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-950/25 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={() => void onGuardar()}
                    >
                      <IconSave className="h-4 w-4 shrink-0 opacity-95" />
                      Guardar esta entrada
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}

            {mode === 'create' ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 shadow-sm">
                <div className="text-sm font-semibold text-amber-900">Producto no registrado</div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field label="Nombre">
                    <TextInput
                      value={createForm.nombre ?? ''}
                      onChange={(e) => setCreateForm((s) => ({ ...s, nombre: e.target.value }))}
                      placeholder="Nombre del producto"
                    />
                  </Field>
                  <Field label="Categoría ID">
                    <TextInput
                      value={createForm.categoriaId ?? ''}
                      onChange={(e) => setCreateForm((s) => ({ ...s, categoriaId: e.target.value }))}
                      placeholder="cat_componentes"
                    />
                  </Field>
                  <Field label="Unidad">
                    <TextInput
                      value={createForm.unidad ?? ''}
                      onChange={(e) => setCreateForm((s) => ({ ...s, unidad: e.target.value }))}
                      placeholder="piezas"
                    />
                  </Field>
                  <Field label="Ubicación (área)">
                    <TextInput
                      value={createForm.ubicacion?.area ?? ''}
                      onChange={(e) =>
                        setCreateForm((s) => ({ ...s, ubicacion: { ...s.ubicacion, area: e.target.value } }))
                      }
                      placeholder="Almacén principal"
                    />
                  </Field>
                  <Field label="Ubicación (detalle)">
                    <TextInput
                      value={createForm.ubicacion?.ubicacion ?? ''}
                      onChange={(e) =>
                        setCreateForm((s) => ({
                          ...s,
                          ubicacion: { ...s.ubicacion, ubicacion: e.target.value },
                        }))
                      }
                      placeholder="Estante / caja / etc."
                    />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="¿Control por serie?">
                      <button
                        type="button"
                        className={[
                          'flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left shadow-sm transition',
                          createForm.tieneSerie
                            ? 'border-emerald-200 bg-emerald-50/60'
                            : 'border-slate-200 bg-white hover:bg-slate-50',
                        ].join(' ')}
                        onClick={() =>
                          setCreateForm((s) => {
                            const next = !Boolean(s.tieneSerie)
                            if (!next) setSerieLines([])
                            return { ...s, tieneSerie: next }
                          })
                        }
                        aria-pressed={Boolean(createForm.tieneSerie)}
                      >
                        <span className="text-sm font-semibold text-slate-800">
                          {createForm.tieneSerie ? 'Con serie' : 'Sin serie'}
                        </span>
                        <span className="text-xs font-semibold text-slate-500">Cambiar</span>
                      </button>
                    </Field>
                  </div>
                  {!createForm.tieneSerie ? (
                    <div className="sm:col-span-2">
                      <Field label="Cantidad inicial">
                        <TextInput
                          type="number"
                          inputMode="numeric"
                          min={1}
                          step={1}
                          value={cantidad}
                          onChange={(e) => {
                            const n = Number(e.target.value)
                            setCantidad(Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1)
                          }}
                        />
                        <p className="mt-1 text-[11px] text-slate-600">Stock inicial al crear el producto (sin series).</p>
                      </Field>
                    </div>
                  ) : null}
                </div>

                {createForm.tieneSerie ? (
                  <div className="mt-4 space-y-3 rounded-xl border border-emerald-200/80 bg-white/80 p-3">
                    <p className="text-[12px] leading-snug text-emerald-950">
                      Total piezas con serie: <span className="font-semibold tabular-nums">{totalPiezasSeries}</span>
                    </p>
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
                      <div className="min-w-0 flex-1">
                        <Field label="Número de serie">
                          <TextInput
                            value={serieInput}
                            onChange={(e) => setSerieInput(e.target.value)}
                            placeholder="Serie…"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') addSerieFromInput()
                            }}
                          />
                        </Field>
                      </div>
                      <div className="w-full shrink-0 sm:w-32">
                        <Field label="Piezas">
                          <TextInput
                            type="number"
                            inputMode="numeric"
                            min={1}
                            step={1}
                            value={piezasEstaSerie}
                            onChange={(e) => {
                              const n = Number(e.target.value)
                              setPiezasEstaSerie(Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1)
                            }}
                          />
                        </Field>
                      </div>
                      <button
                        type="button"
                        className="inline-flex shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 lg:mb-0.5"
                        onClick={() => addSerieFromInput()}
                      >
                        Agregar
                      </button>
                    </div>
                    <Field label="Pegar varias series (una por línea)">
                      <TextArea
                        value={bulkSeriesText}
                        onChange={(e) => setBulkSeriesText(e.target.value)}
                        placeholder={'SN001\nSN001\nSN002'}
                      />
                      <button
                        type="button"
                        className="mt-2 inline-flex items-center justify-center rounded-xl bg-section-navy px-4 py-2 text-sm font-semibold text-white shadow-sm hover:brightness-110"
                        onClick={() => flushBulkSeries()}
                      >
                        Agregar listado
                      </button>
                    </Field>
                    {serieLines.length > 0 ? (
                      <ul className="max-h-40 space-y-2 overflow-y-auto">
                        {serieLines.map((L) => (
                          <li
                            key={L.key}
                            className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2"
                          >
                            <span className="min-w-0 flex-1 font-mono text-xs font-semibold text-slate-900">{L.serie}</span>
                            <TextInput
                              type="number"
                              min={1}
                              className="w-20 py-1.5 text-center text-xs"
                              value={L.cantidad}
                              onChange={(e) => updateLineCantidad(L.key, e.target.value)}
                            />
                            <button
                              type="button"
                              className="text-[11px] font-semibold text-rose-700 hover:underline"
                              onClick={() => setSerieLines((prev) => prev.filter((x) => x.key !== L.key))}
                            >
                              Quitar
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}

                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    disabled={!canSaveCreate}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-section-navy px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-950/25 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => void onGuardar()}
                  >
                    <IconPlus className="h-4 w-4 shrink-0 opacity-95" />
                    Guardar producto y entrada
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>

    {serieConflictoMessage ? (
      <div
        className="fixed inset-0 z-[70] grid place-items-center p-4 sm:p-6"
        role="presentation"
      >
        <button
          type="button"
          className="absolute inset-0 bg-slate-900/55 backdrop-blur-[1px]"
          aria-label="Cerrar aviso"
          onClick={() => setSerieConflictoMessage(null)}
        />
        <div
          role="alertdialog"
          aria-modal="true"
          aria-describedby="entrada-serie-conflicto-desc"
          className="relative w-full max-w-md rounded-2xl border border-rose-200 bg-white p-5 shadow-2xl shadow-rose-900/10 sm:p-6"
        >
          <p id="entrada-serie-conflicto-desc" className="text-sm leading-relaxed text-rose-950">
            {serieConflictoMessage}
          </p>
          <div className="mt-5 flex justify-end">
            <button
              type="button"
              className="inline-flex min-w-[7rem] items-center justify-center rounded-xl bg-section-navy px-4 py-2.5 text-sm font-bold text-white shadow-md transition hover:brightness-110"
              onClick={() => setSerieConflictoMessage(null)}
            >
              Aceptar
            </button>
          </div>
        </div>
      </div>
    ) : null}
    </>
  )
}
