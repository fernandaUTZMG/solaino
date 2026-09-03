import { useEffect, useMemo, useRef, useState } from 'react'
import type { InventoryItem } from '../../types/inventory'
import { makeId } from '../../lib/id'
import {
  deleteProducto,
  insertProducto,
  isProductoUuid,
  updateProducto,
} from '../../lib/productosRepo'
import { canManageInventory, type AppRole } from '../../lib/roles'
import { useInventoryItems } from './inventoryStore'
import { downloadProductosCsv } from '../../lib/exportProductosCsv'
import { logClientAction } from '../../lib/auditClient'
import { ProductFormDialog, type CreateProductSubmit } from './ProductFormDialog'
import { ProductTable } from './ProductTable'
import { StatCard } from './StatCard'
import { ImagePreviewModal } from '../../ui/ImagePreviewModal.tsx'
import {
  IconBell,
  IconClear,
  IconDownload,
  IconLayers,
  IconListFilter,
  IconNavInventory,
  IconPlus,
  IconSearch,
  IconX,
} from '../../ui/shellIcons.tsx'
import { SolicitarDialog } from './SolicitarDialog'
import { EntradaDialog } from './EntradaDialog'
import { SalidaDialog } from './SalidaDialog'
import { AjusteDialog } from './AjusteDialog'
import { ProductHistorialDialog } from './ProductHistorialDialog'
import { isSupabaseConfigured } from '../../env'
import { fetchProductIdsBySerieBusqueda } from '../../lib/seriesRepo'
function sortByCodigo(a: InventoryItem, b: InventoryItem) {
  return a.codigo.localeCompare(b.codigo)
}

function IconChevronDown(props: { className?: string }) {
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
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

export function InventoryPage(props: { role?: AppRole; onSolicitudesChanged?: () => void }) {
  const inventoryManager = canManageInventory(props.role ?? 'user')
  const { items, setItems, stats, loading, error, refresh, useLocal } = useInventoryItems()
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editing, setEditing] = useState<InventoryItem | null>(null)
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [persistError, setPersistError] = useState<string | null>(null)
  const [solicitar, setSolicitar] = useState<InventoryItem | null>(null)
  const [historialItem, setHistorialItem] = useState<InventoryItem | null>(null)
  const [entradaOpen, setEntradaOpen] = useState(false)
  const [salidaOpen, setSalidaOpen] = useState(false)
  const [ajusteOpen, setAjusteOpen] = useState(false)
  const [exportCsvMenuOpen, setExportCsvMenuOpen] = useState(false)
  const exportCsvMenuRef = useRef<HTMLDivElement | null>(null)
  const [page, setPage] = useState(1)
  const pageSize = 10
  const [productIdsPorSerie, setProductIdsPorSerie] = useState<string[]>([])

  useEffect(() => {
    const q = busqueda.trim()
    if (!q || useLocal || !isSupabaseConfigured()) {
      setProductIdsPorSerie([])
      return
    }
    let cancelled = false
    const t = window.setTimeout(() => {
      void fetchProductIdsBySerieBusqueda(q)
        .then((ids) => {
          if (!cancelled) setProductIdsPorSerie(ids)
        })
        .catch(() => {
          if (!cancelled) setProductIdsPorSerie([])
        })
    }, 220)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [busqueda, useLocal])

  const serieMatchSet = useMemo(() => new Set(productIdsPorSerie), [productIdsPorSerie])

  const itemsFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return items
    return items.filter((i) => {
      const codigo = i.codigo.toLowerCase()
      const nombre = i.nombre.toLowerCase()
      const area = i.ubicacion.area.toLowerCase()
      const ubicacion = i.ubicacion.ubicacion.toLowerCase()
      const matchCampos =
        codigo.includes(q) ||
        nombre.includes(q) ||
        area.includes(q) ||
        ubicacion.includes(q)
      const matchSerie = serieMatchSet.has(i.id)
      return matchCampos || matchSerie
    })
  }, [items, busqueda, serieMatchSet])

  const totalPages = useMemo(() => Math.max(1, Math.ceil(itemsFiltrados.length / pageSize)), [itemsFiltrados.length])

  const pageItems = useMemo(() => {
    const safePage = Math.min(Math.max(1, page), totalPages)
    const start = (safePage - 1) * pageSize
    return itemsFiltrados.slice(start, start + pageSize)
  }, [itemsFiltrados, page, totalPages])

  const [exportSelectedIds, setExportSelectedIds] = useState<string[]>([])

  useEffect(() => {
    const allowed = new Set(itemsFiltrados.map((i) => i.id))
    setExportSelectedIds((prev) => prev.filter((id) => allowed.has(id)))
  }, [itemsFiltrados])

  const selectedForExport = useMemo(
    () => itemsFiltrados.filter((i) => exportSelectedIds.includes(i.id)),
    [itemsFiltrados, exportSelectedIds],
  )

  function toggleExportSelect(id: string) {
    setExportSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function toggleExportSelectPage(checked: boolean) {
    const pageIds = pageItems.map((i) => i.id)
    setExportSelectedIds((prev) => {
      if (checked) {
        return Array.from(new Set([...prev, ...pageIds]))
      }
      return prev.filter((id) => !pageIds.includes(id))
    })
  }

  function selectAllFilteredForExport() {
    setExportSelectedIds(itemsFiltrados.map((i) => i.id))
  }

  function clearExportSelection() {
    setExportSelectedIds([])
  }

  // Si cambia la búsqueda o baja el total, regresamos a página 1 para evitar páginas vacías.
  useEffect(() => {
    setPage(1)
  }, [busqueda])

  useEffect(() => {
    if (!exportCsvMenuOpen) return
    function onDocMouseDown(e: MouseEvent) {
      const el = exportCsvMenuRef.current
      if (el && !el.contains(e.target as Node)) setExportCsvMenuOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setExportCsvMenuOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [exportCsvMenuOpen])

  const lowStockItems = useMemo(() => {
    return items.filter((i) => i.stockActual > 0 && i.stockActual < i.stockMinimo)
  }, [items])

  const outOfStockItems = useMemo(() => {
    return items.filter((i) => i.stockActual <= 0)
  }, [items])

  async function upsertItem(next: InventoryItem) {
    setPersistError(null)

    if (useLocal) {
      setItems((prev) => {
        const idx = prev.findIndex((p) => p.id === next.id)
        const now = new Date().toISOString()

        if (idx === -1) {
          return [...prev, next].sort(sortByCodigo)
        }

        const prevItem = prev[idx]!
        let merged: InventoryItem = { ...next }

        if (prevItem.stockActual !== next.stockActual) {
          if (next.stockActual > prevItem.stockActual) {
            merged = { ...merged, ultimaEntradaISO: now }
          } else if (next.stockActual < prevItem.stockActual) {
            merged = { ...merged, ultimaSalidaISO: now }
          }
        } else {
          merged = {
            ...merged,
            ultimaEntradaISO: next.ultimaEntradaISO ?? prevItem.ultimaEntradaISO,
            ultimaSalidaISO: next.ultimaSalidaISO ?? prevItem.ultimaSalidaISO,
          }
        }

        const copy = [...prev]
        copy[idx] = merged
        return copy.sort(sortByCodigo)
      })
      return
    }

    try {
      const prev = items.find((p) => p.id === next.id)
      const now = new Date().toISOString()
      let merged: InventoryItem = { ...next }

      if (prev && prev.stockActual !== next.stockActual) {
        if (next.stockActual > prev.stockActual) {
          merged = { ...merged, ultimaEntradaISO: now }
        } else if (next.stockActual < prev.stockActual) {
          merged = { ...merged, ultimaSalidaISO: now }
        }
      } else if (prev) {
        merged = {
          ...merged,
          ultimaEntradaISO: next.ultimaEntradaISO ?? prev.ultimaEntradaISO,
          ultimaSalidaISO: next.ultimaSalidaISO ?? prev.ultimaSalidaISO,
        }
      }

      if (isProductoUuid(merged.id)) {
        await updateProducto(merged, { previousStockActual: prev?.stockActual })
      } else {
        const { id: _id, ...rest } = merged
        await insertProducto(rest as Omit<InventoryItem, 'id'>)
      }
      await refresh()
    } catch (e) {
      setPersistError(e instanceof Error ? e.message : 'Error al guardar')
    }
  }

  async function onCreate(partial: CreateProductSubmit) {
    setPersistError(null)
    const now = new Date().toISOString()
    const withTs: Omit<InventoryItem, 'id'> = { ...partial }
    if (partial.stockActual > 0) {
      withTs.ultimaEntradaISO = now
    }

    if (useLocal) {
      await upsertItem({ ...withTs, id: makeId('item') })
      setIsCreateOpen(false)
      return
    }

    try {
      await insertProducto(withTs)
      await refresh()
      setIsCreateOpen(false)
    } catch (e) {
      setPersistError(e instanceof Error ? e.message : 'Error al crear producto')
    }
  }

  async function onEdit(next: InventoryItem) {
    setPersistError(null)
    if (useLocal) {
      await upsertItem(next)
      setEditing(null)
      return
    }
    try {
      const prev = items.find((p) => p.id === next.id)
      const now = new Date().toISOString()
      let merged: InventoryItem = { ...next }
      if (prev && prev.stockActual !== next.stockActual) {
        if (next.stockActual > prev.stockActual) {
          merged = { ...merged, ultimaEntradaISO: now }
        } else if (next.stockActual < prev.stockActual) {
          merged = { ...merged, ultimaSalidaISO: now }
        }
      } else if (prev) {
        merged = {
          ...merged,
          ultimaEntradaISO: next.ultimaEntradaISO ?? prev.ultimaEntradaISO,
          ultimaSalidaISO: next.ultimaSalidaISO ?? prev.ultimaSalidaISO,
        }
      }
      await updateProducto(merged, { previousStockActual: prev?.stockActual })
      await refresh()
      setEditing(null)
    } catch (e) {
      setPersistError(e instanceof Error ? e.message : 'Error al actualizar')
    }
  }

  async function onDelete(id: string) {
    setPersistError(null)
    if (useLocal) {
      setItems((prev) => prev.filter((i) => i.id !== id))
      return
    }
    try {
      await deleteProducto(id)
      await refresh()
    } catch (e) {
      setPersistError(e instanceof Error ? e.message : 'Error al eliminar')
    }
  }

  return (
    <div className="space-y-4">
      {loading && items.length === 0 ? (
        <p className="text-sm text-slate-600">Cargando inventario…</p>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      {persistError ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {persistError}
        </div>
      ) : null}

      <div className="rounded-2xl border border-blue-950/40 bg-section-navy px-4 py-3.5 text-white shadow-md sm:px-5 sm:py-4">
        <div>
          <h1 className="inline-flex items-center gap-2 text-lg font-semibold tracking-tight sm:text-xl">
            <IconNavInventory className="h-6 w-6 shrink-0 text-blue-200/95" aria-hidden />
            Inventario
          </h1>
          <p className="mt-1 text-[13px] leading-snug text-blue-100/88">
            {useLocal
              ? 'Edita cantidades y costos, agrega productos e imágenes (modo local: se guarda en este navegador).'
              : 'Los productos se guardan en Supabase (nube). Todos los equipos ven los mismos datos.'}
          </p>
        </div>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-3">
        <StatCard
          title="Sin stock"
          value={stats.sinStock}
          tone="danger"
          subtitle="stock = 0"
        />
        <StatCard
          title="Por terminarse"
          value={stats.porTerminarse}
          tone="warning"
          subtitle={'stock estrictamente bajo el mínimo'}
        />
        <StatCard
          title="OK"
          value={stats.ok}
          tone="ok"
          subtitle={'en el mínimo o por encima'}
        />
      </div>

      {(outOfStockItems.length > 0 || lowStockItems.length > 0) && (
        <section className="rounded-2xl border border-amber-200/90 bg-white p-3 shadow-sm sm:p-4">
          <div className="mb-3 inline-flex items-center gap-2 text-[15px] font-bold text-slate-900">
            <IconBell className="h-5 w-5 shrink-0 text-amber-600" aria-hidden />
            Alertas
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-2.5 sm:p-3">
              <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-rose-800">
                Sin stock
              </div>
              {outOfStockItems.length === 0 ? (
                <div className="text-sm font-medium text-slate-700">Sin alertas.</div>
              ) : (
                <ul className="space-y-1.5 text-[13px] font-bold leading-snug text-slate-900">
                  {outOfStockItems.slice(0, 6).map((i) => (
                    <li key={i.id} className="flex justify-between gap-3">
                      <span className="truncate">
                        {i.codigo} · {i.nombre}
                      </span>
                      <span className="shrink-0 tabular-nums text-rose-800">0</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-2.5 sm:p-3">
              <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-amber-800">
                Por terminarse
              </div>
              {lowStockItems.length === 0 ? (
                <div className="text-sm font-medium text-slate-700">Sin alertas.</div>
              ) : (
                <ul className="space-y-1.5 text-[13px] font-bold leading-snug text-slate-900">
                  {lowStockItems.slice(0, 6).map((i) => (
                    <li key={i.id} className="flex justify-between gap-3">
                      <span className="truncate">
                        {i.codigo} · {i.nombre}
                      </span>
                      <span className="shrink-0 tabular-nums text-amber-800">{i.stockActual}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      )}

      <section
        className="rounded-2xl border border-blue-950/40 bg-section-navy p-3 shadow-md sm:p-4"
        aria-label="Buscar productos"
      >
        <div className="flex flex-col gap-3 sm:gap-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
            <div className="min-w-0 flex-1">
              <label
                htmlFor="buscar-inventario"
                className="mb-1.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-blue-100/90"
              >
                <IconSearch className="h-4 w-4 shrink-0 text-blue-200/95" aria-hidden />
                Buscar en productos
              </label>
              <div className="relative">
                <span
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-blue-300/90"
                  aria-hidden
                >
                  <IconSearch className="h-[18px] w-[18px]" />
                </span>
                <input
                  id="buscar-inventario"
                  type="text"
                  role="searchbox"
                  inputMode="search"
                  enterKeyHint="search"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Código, nombre, ubicación o número de serie…"
                  className="w-full rounded-xl border border-white/20 bg-white py-2.5 pl-10 pr-10 text-sm text-slate-900 shadow-inner outline-none ring-0 placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-300/40"
                  autoComplete="off"
                />
                {busqueda.trim() ? (
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-blue-900 transition hover:bg-slate-100 hover:text-blue-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-900/35"
                    onClick={() => setBusqueda('')}
                    aria-label="Limpiar búsqueda"
                    title="Limpiar búsqueda"
                  >
                    <IconX className="h-[18px] w-[18px] shrink-0" aria-hidden />
                  </button>
                ) : null}
              </div>
              <p className="mt-1.5 text-xs text-blue-100/85">
                Coincide con <span className="font-medium text-white/95">código</span>,{' '}
                <span className="font-medium text-white/95">nombre</span>,{' '}
                <span className="font-medium text-white/95">ubicación</span> (área y estante) o{' '}
                <span className="font-medium text-white/95">número de serie</span> registrado en
                inventario (muestra el producto al que pertenece).
                {busqueda.trim() ? (
                  <span className="font-semibold text-amber-200">
                    {' '}
                    · {itemsFiltrados.length} de {items.length} resultados
                  </span>
                ) : null}
              </p>
            </div>
          </div>

          <div
            className="flex w-full min-w-0 flex-wrap items-stretch gap-2 border-t border-white/15 pt-3 sm:justify-end sm:gap-3"
            aria-label="Acciones de inventario"
          >
            {inventoryManager ? (
              <button
                type="button"
                className="inline-flex min-h-[2.5rem] w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-purple-600 px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition hover:bg-purple-500 sm:w-auto"
                onClick={() => setAjusteOpen(true)}
              >
                Ajuste inventario
              </button>
            ) : null}

            <button
              type="button"
              className="inline-flex min-h-[2.5rem] w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition hover:bg-emerald-500 sm:w-auto"
              onClick={() => setEntradaOpen(true)}
            >
              Entradas producto
            </button>

            <button
              type="button"
              className="inline-flex min-h-[2.5rem] w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition hover:bg-amber-500 sm:w-auto"
              onClick={() => setSalidaOpen(true)}
            >
              Embarque / salida
            </button>

            <div ref={exportCsvMenuRef} className="relative w-full min-w-[12rem] sm:w-auto">
              <button
                type="button"
                className="inline-flex min-h-[2.5rem] w-full items-center justify-between gap-2 rounded-xl border border-white/25 bg-white/15 px-4 py-2 text-left text-[13px] font-semibold text-white shadow-sm transition hover:bg-white/25 sm:min-w-[15rem]"
                aria-expanded={exportCsvMenuOpen}
                aria-haspopup="menu"
                onClick={() => setExportCsvMenuOpen((o) => !o)}
              >
                <span className="inline-flex items-center gap-2">
                  <IconDownload className="h-4 w-4 shrink-0 opacity-95" aria-hidden />
                  Opciones exportación CSV
                </span>
                <IconChevronDown
                  className={[
                    'h-4 w-4 shrink-0 text-blue-100/90 transition-transform',
                    exportCsvMenuOpen ? 'rotate-180' : '',
                  ].join(' ')}
                />
              </button>
              {exportCsvMenuOpen ? (
                <div
                  role="menu"
                  className="absolute right-0 z-[100] mt-2 w-[min(calc(100vw-2rem),20rem)] overflow-hidden rounded-xl border border-slate-200/90 bg-white py-1 text-slate-800 shadow-xl shadow-slate-900/15 ring-1 ring-slate-900/5"
                >
                  <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    Selección para CSV
                  </div>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={pageItems.length === 0}
                    onClick={() => {
                      toggleExportSelectPage(true)
                    }}
                  >
                    <IconLayers className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                    Marcar página actual
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={itemsFiltrados.length === 0}
                    onClick={() => {
                      selectAllFilteredForExport()
                    }}
                  >
                    <IconListFilter className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                    Marcar todo filtrado ({itemsFiltrados.length})
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={exportSelectedIds.length === 0}
                    onClick={() => {
                      clearExportSelection()
                    }}
                  >
                    <IconClear className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                    Limpiar selección ({exportSelectedIds.length})
                  </button>
                  <div className="my-1 border-t border-slate-100" />
                  <button
                    type="button"
                    role="menuitem"
                    title="CSV separado por punto y coma (;), UTF-8 con BOM. Solo filas marcadas en la tabla."
                    className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={selectedForExport.length === 0}
                    onClick={() => {
                      setExportCsvMenuOpen(false)
                      void logClientAction({
                        action: 'export_excel',
                        tableName: 'productos',
                        metadata: {
                          total: selectedForExport.length,
                          mode: 'selected',
                          filtered: Boolean(busqueda.trim()),
                        },
                      })
                      downloadProductosCsv(
                        selectedForExport,
                        `inventario-seleccion-${selectedForExport.length}`,
                      )
                    }}
                  >
                    <span className="text-[13px] font-semibold text-slate-900">Exportar seleccionados</span>
                    <span className="text-[11px] text-slate-500">{selectedForExport.length} filas</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    title="CSV separado por punto y coma (;), UTF-8 con BOM. Todo lo que coincide con el filtro de búsqueda."
                    className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={itemsFiltrados.length === 0}
                    onClick={() => {
                      setExportCsvMenuOpen(false)
                      void logClientAction({
                        action: 'export_excel',
                        tableName: 'productos',
                        metadata: {
                          total: itemsFiltrados.length,
                          mode: 'filtered_all',
                          filtered: Boolean(busqueda.trim()),
                        },
                      })
                      downloadProductosCsv(
                        itemsFiltrados,
                        busqueda.trim() ? 'inventario-filtrado' : 'inventario',
                      )
                    }}
                  >
                    <span className="text-[13px] font-semibold text-slate-900">Exportar todo (filtrado)</span>
                    <span className="text-[11px] text-slate-500">{itemsFiltrados.length} filas</span>
                  </button>
                </div>
              ) : null}
            </div>

            <button
              type="button"
              disabled={loading && !useLocal}
              className="inline-flex min-h-[2.5rem] w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              onClick={() => setIsCreateOpen(true)}
            >
              <IconPlus className="h-4 w-4 shrink-0 opacity-95" aria-hidden />
              Nuevo producto
            </button>
          </div>
        </div>
      </section>

      <ProductTable
        items={pageItems}
        totalInventario={items.length}
        totalFiltered={itemsFiltrados.length}
        page={page}
        pageSize={pageSize}
        onPageChange={(p) => setPage(Math.min(Math.max(1, p), totalPages))}
        onEdit={inventoryManager ? (item) => setEditing(item) : undefined}
        onDelete={inventoryManager ? (id) => void onDelete(id) : undefined}
        onInlineUpdate={inventoryManager ? (next) => void upsertItem(next) : undefined}
        onPreviewImage={(url) => setPreviewImage(url)}
        onSolicitar={!inventoryManager ? (item) => setSolicitar(item) : undefined}
        onHistorial={(item) => setHistorialItem(item)}
        canDelete={inventoryManager}
        exportSelection={{
          selectedIds: exportSelectedIds,
          onToggleRow: toggleExportSelect,
          onTogglePage: toggleExportSelectPage,
        }}
      />

      <ImagePreviewModal
        src={previewImage}
        onClose={() => setPreviewImage(null)}
      />

      <SolicitarDialog
        open={solicitar !== null}
        item={solicitar}
        onClose={() => setSolicitar(null)}
        onCreated={() => props.onSolicitudesChanged?.()}
      />

      <ProductHistorialDialog
        open={historialItem !== null}
        item={historialItem}
        useLocal={useLocal}
        onClose={() => setHistorialItem(null)}
      />

      <EntradaDialog
        open={entradaOpen}
        onClose={() => setEntradaOpen(false)}
        onSaved={() => void refresh()}
        role={props.role}
        onProductMetaChanged={() => void refresh()}
        local={useLocal ? { items, setItems } : null}
      />

      <AjusteDialog
        open={ajusteOpen}
        onClose={() => setAjusteOpen(false)}
        onSaved={() => void refresh()}
        role={props.role}
        local={useLocal ? { items, setItems } : null}
      />

      <SalidaDialog
        open={salidaOpen}
        onClose={() => setSalidaOpen(false)}
        onSaved={() => void refresh()}
        inventarioItems={items}
        local={useLocal ? { items, setItems } : null}
      />

      <ProductFormDialog
        mode="create"
        title="Nuevo producto"
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSubmit={(v) => void onCreate(v as CreateProductSubmit)}
        onPreviewImage={(url) => setPreviewImage(url)}
      />

      <ProductFormDialog
        mode="edit"
        title="Editar producto"
        open={editing !== null}
        initial={editing ?? undefined}
        onClose={() => setEditing(null)}
        onSubmit={(v) => void onEdit(v as InventoryItem)}
        onPreviewImage={(url) => setPreviewImage(url)}
      />
    </div>
  )
}
