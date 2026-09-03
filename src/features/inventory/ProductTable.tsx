import { useEffect, useMemo, useRef, useState } from 'react'
import type { InventoryItem } from '../../types/inventory'
import { formatFechaHoraLocal } from '../../lib/formatDateTime'
import { PaginationBar } from '../../ui/PaginationBar.tsx'
import { IconTable } from '../../ui/shellIcons.tsx'

function formatMoney(n: number) {
  if (!Number.isFinite(n)) return ''
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 2,
  }).format(n)
}

/** Iconos estilo Lucide / SF, trazo 1.75 */
function IconCart(props: { className?: string }) {
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
      <circle cx="8" cy="21" r="1" />
      <circle cx="19" cy="21" r="1" />
      <path d="M2.5 2.5h3l2.7 13.5a1.5 1.5 0 0 0 1.5 1.2h9.6a1.5 1.5 0 0 0 1.5-1.2L21.5 7.5h-14" />
    </svg>
  )
}

function IconPencil(props: { className?: string }) {
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
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 19l-4 1 1-4 11.5-11.5Z" />
    </svg>
  )
}

function IconHistory(props: { className?: string }) {
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
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </svg>
  )
}

function IconTrash(props: { className?: string }) {
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
      <path d="M4 7h16" />
      <path d="M10 11v6M14 11v6" />
      <path d="M6 7l1 14a1 1 0 0 0 1 .9h8a1 1 0 0 0 1-.9l1-14" />
      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
    </svg>
  )
}

function stockTone(item: InventoryItem) {
  if (item.stockActual <= 0) return 'danger'
  if (item.stockActual > 0 && item.stockActual < item.stockMinimo) return 'warning'
  return 'ok'
}

function StockPill({ item }: { item: InventoryItem }) {
  const tone = stockTone(item)
  const base =
    'inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-none'

  if (tone === 'danger')
    return (
      <span className={`${base} border-rose-200/80 bg-rose-50 text-rose-800`}>
        <span className="h-2 w-2 shrink-0 rounded-full bg-rose-500" aria-hidden />
        Sin stock
      </span>
    )
  if (tone === 'warning')
    return (
      <span className={`${base} border-amber-200/80 bg-amber-50 text-amber-900`}>
        <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-hidden />
        Bajo
      </span>
    )
  return (
    <span className={`${base} border-emerald-200/80 bg-emerald-50 text-emerald-900`}>
      <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden />
      OK
    </span>
  )
}

function TextInput(props: React.ComponentProps<'input'>) {
  return (
    <input
      {...props}
      className={[
        'min-w-0 w-full max-w-full rounded-md border border-slate-200 bg-white px-1 py-1 text-center text-[12px] font-medium tabular-nums text-slate-900 shadow-sm outline-none sm:rounded-lg sm:px-2 sm:py-1.5 sm:text-[13px]',
        'placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15',
        props.className ?? '',
      ].join(' ')}
    />
  )
}

export type ProductTableExportSelection = {
  selectedIds: string[]
  onToggleRow: (id: string) => void
  onTogglePage: (checked: boolean) => void
}

const th = 'px-2 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.07em] text-blue-100/95 sm:px-2.5 sm:text-[11px]'
const tdBase =
  'border-l border-slate-200/70 px-2 py-2 align-middle text-[12px] text-slate-800 first:border-l-0 sm:px-2.5 sm:py-2.5 sm:text-[13px]'
const tdNum = `${tdBase} bg-slate-100/35`

/** Anchos % — columna Producto más estrecha; más espacio a ubicación, fechas y acciones. */
const COL_PCT_WITH_SEL = [
  2, 5.5, 7, 18, 5, 6, 14, 4.5, 4.5, 6.5, 6.5, 6.5, 3, 11,
] as const
const COL_PCT_NO_SEL = [5.5, 6.5, 20.5, 5, 6, 14, 4.5, 4.5, 6.5, 6.5, 6.5, 3, 11] as const

export function ProductTable(props: {
  items: InventoryItem[]
  totalInventario: number
  page: number
  pageSize: number
  totalFiltered: number
  onPageChange: (page: number) => void
  onEdit?: (item: InventoryItem) => void
  onDelete?: (id: string) => void
  onInlineUpdate?: (item: InventoryItem) => void
  onPreviewImage: (url: string) => void
  onSolicitar?: (item: InventoryItem) => void
  onHistorial?: (item: InventoryItem) => void
  canDelete?: boolean
  exportSelection?: ProductTableExportSelection | null
}) {
  const totalValue = useMemo(() => {
    return props.items.reduce((acc, i) => acc + i.stockActual * i.costoUnitario, 0)
  }, [props.items])

  const totalPages = Math.max(1, Math.ceil(props.totalFiltered / props.pageSize))
  const safePage = Math.min(Math.max(1, props.page), totalPages)

  const topScrollRef = useRef<HTMLDivElement | null>(null)
  const bottomScrollRef = useRef<HTMLDivElement | null>(null)
  const tableRef = useRef<HTMLTableElement | null>(null)
  const [scrollW, setScrollW] = useState(0)
  const syncingRef = useRef(false)

  const sel = props.exportSelection
  const pageIds = useMemo(() => props.items.map((i) => i.id), [props.items])
  const selectedOnPage = useMemo(
    () => (sel ? pageIds.filter((id) => sel.selectedIds.includes(id)).length : 0),
    [sel, pageIds],
  )
  const allPageSelected = pageIds.length > 0 && selectedOnPage === pageIds.length
  const headerCbRef = useRef<HTMLInputElement>(null)

  const showSolicitar = Boolean(props.onSolicitar)
  const showHistorial = Boolean(props.onHistorial)
  const showEdit = Boolean(props.onEdit)
  const showDelete = Boolean(props.canDelete && props.onDelete)
  const actionCount = [showSolicitar, showHistorial, showEdit, showDelete].filter(Boolean).length
  const actionGridCols =
    actionCount <= 1 ? 'grid-cols-1' : actionCount === 2 ? 'grid-cols-2' : actionCount === 3 ? 'grid-cols-3' : 'grid-cols-4'

  useEffect(() => {
    const el = headerCbRef.current
    if (!el || !sel) return
    el.indeterminate = selectedOnPage > 0 && selectedOnPage < pageIds.length
  }, [sel, selectedOnPage, pageIds.length])

  useEffect(() => {
    const table = tableRef.current
    if (!table) return

    const update = () => {
      const next = table.scrollWidth
      setScrollW(next)
    }

    update()

    const ro = new ResizeObserver(() => update())
    ro.observe(table)
    return () => ro.disconnect()
  }, [props.items.length, sel ? sel.selectedIds.length : 0])

  function syncScroll(from: 'top' | 'bottom') {
    if (syncingRef.current) return
    const top = topScrollRef.current
    const bottom = bottomScrollRef.current
    if (!top || !bottom) return

    syncingRef.current = true
    try {
      if (from === 'top') {
        bottom.scrollLeft = top.scrollLeft
      } else {
        top.scrollLeft = bottom.scrollLeft
      }
    } finally {
      queueMicrotask(() => {
        syncingRef.current = false
      })
    }
  }

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-300/50 bg-white shadow-[0_16px_48px_-20px_rgba(4,26,56,0.22)]">
      <div className="flex flex-col gap-1 border-b border-slate-200/80 bg-gradient-to-r from-slate-50 to-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <h2 className="inline-flex items-center gap-2 text-lg font-bold tracking-tight text-section-navy">
          <IconTable className="h-5 w-5 shrink-0 text-blue-800/90" aria-hidden />
          Listado de productos
        </h2>
        <p className="text-[13px] text-slate-600">
          <span className="font-semibold tabular-nums text-slate-900">{props.totalFiltered}</span> coincidencias
          <span className="mx-2 text-slate-300">|</span>
          <span className="tabular-nums text-slate-700">{props.totalInventario}</span> en total
          <span className="mx-2 text-slate-300">|</span>
          Valor en esta página:{' '}
          <span className="font-semibold tabular-nums text-blue-900">{formatMoney(totalValue)}</span>
        </p>
      </div>

      <div
        ref={topScrollRef}
        onScroll={() => syncScroll('top')}
        className="h-5 w-full overflow-x-scroll overflow-y-hidden border-b border-slate-200/70 bg-slate-50/70 [-webkit-overflow-scrolling:touch]"
        aria-hidden
      >
        <div style={{ width: Math.max(scrollW, 1), height: 1 }} />
      </div>

      <div
        ref={bottomScrollRef}
        onScroll={() => syncScroll('bottom')}
        className="w-full overflow-x-auto [-webkit-overflow-scrolling:touch]"
      >
        <table
          ref={tableRef}
          className="table-fixed border-collapse text-left"
          style={{ minWidth: 1400, width: 'max-content' }}
        >
          <colgroup>
            {sel
              ? COL_PCT_WITH_SEL.map((w, i) => <col key={`c-${i}`} style={{ width: `${w}%` }} />)
              : COL_PCT_NO_SEL.map((w, i) => <col key={`c-${i}`} style={{ width: `${w}%` }} />)}
          </colgroup>
          <thead>
            <tr className="divide-x divide-white/10 bg-section-navy shadow-inner">
              {sel ? (
                <th className="px-1.5 py-2.5 text-center align-middle sm:px-2">
                  <input
                    ref={headerCbRef}
                    type="checkbox"
                    checked={allPageSelected}
                    onChange={(e) => sel.onTogglePage(e.target.checked)}
                    className="h-4 w-4 rounded border-white/30 bg-white/10 text-blue-600 focus:ring-2 focus:ring-white/40"
                    title="Seleccionar página para CSV"
                    aria-label="Seleccionar página para exportar CSV"
                  />
                </th>
              ) : null}
              <th className={th}>Estado</th>
              <th className={th}>Código</th>
              <th className={th}>Producto</th>
              <th className={th}>Medida</th>
              <th className={th}>Cód. prod.</th>
              <th className={th}>Ubicación</th>
              <th className={`${th} text-center`}>Cant.</th>
              <th className={`${th} text-center`}>Mín.</th>
              <th className={`${th} text-center`}>Costo</th>
              <th className={th}>Últ. entrada</th>
              <th className={th}>Últ. salida</th>
              <th className={`${th} text-center`}>Img.</th>
              <th className={`${th} pr-2 text-center sm:pr-3`}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {props.items.length === 0 ? (
              <tr>
                <td
                  colSpan={sel ? 13 : 12}
                  className="px-6 py-16 text-center text-[14px] text-slate-500"
                >
                  {props.totalInventario === 0
                    ? 'No hay productos. Usa «Nuevo producto» para agregar el primero.'
                    : 'Ningún producto coincide con la búsqueda.'}
                </td>
              </tr>
            ) : (
              props.items.map((item, idx) => (
                <tr
                  key={item.id}
                  className={[
                    'border-b border-slate-100 transition-colors',
                    idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40',
                    'hover:bg-sky-50/70',
                  ].join(' ')}
                >
                  {sel ? (
                    <td className="px-2 py-2.5 text-center align-middle">
                      <input
                        type="checkbox"
                        checked={sel.selectedIds.includes(item.id)}
                        onChange={() => sel.onToggleRow(item.id)}
                        className="h-4 w-4 rounded border-slate-300 text-blue-700"
                        aria-label={`Incluir ${item.codigo} en exportación`}
                      />
                    </td>
                  ) : null}
                  <td className={tdBase}>
                    <StockPill item={item} />
                  </td>
                  <td className={`${tdBase} font-mono text-[12px] text-slate-700`}>
                    <span className="block break-all">{item.codigo}</span>
                  </td>
                  <td className={`${tdBase} overflow-hidden`}>
                    <div className="truncate font-semibold leading-snug text-slate-900" title={item.nombre}>
                      {item.nombre}
                    </div>
                    {item.descripcion?.trim() ? (
                      <div
                        className="mt-0.5 truncate text-[11px] leading-snug text-slate-500 sm:text-[12px]"
                        title={item.descripcion}
                      >
                        {item.descripcion}
                      </div>
                    ) : (
                      <div className="mt-0.5 text-[11px] text-slate-400">—</div>
                    )}
                  </td>
                  <td className={`${tdBase} text-[12px] text-slate-700`}>
                    {item.medida?.trim() ? <span className="block break-words">{item.medida}</span> : '—'}
                  </td>
                  <td className={`${tdBase} font-mono text-[12px] text-slate-600`}>
                    {item.codigoProducto?.trim() ? <span className="block break-words">{item.codigoProducto}</span> : '—'}
                  </td>
                  <td className={`${tdBase} text-[12px]`}>
                    <div className="font-medium text-slate-800">{item.ubicacion.area}</div>
                    <div className="mt-0.5 text-[12px] text-slate-500">{item.ubicacion.ubicacion}</div>
                  </td>
                  <td className={tdNum}>
                    {props.onInlineUpdate ? (
                      <TextInput
                        type="number"
                        inputMode="numeric"
                        value={item.stockActual}
                        onChange={(e) =>
                          props.onInlineUpdate?.({
                            ...item,
                            stockActual: Number(e.target.value),
                          })
                        }
                      />
                    ) : (
                      <div className="text-center text-[12px] font-semibold tabular-nums text-slate-800">
                        {item.stockActual}
                      </div>
                    )}
                  </td>
                  <td className={tdNum}>
                    {props.onInlineUpdate ? (
                      <TextInput
                        type="number"
                        inputMode="numeric"
                        value={item.stockMinimo}
                        onChange={(e) =>
                          props.onInlineUpdate?.({
                            ...item,
                            stockMinimo: Number(e.target.value),
                          })
                        }
                      />
                    ) : (
                      <div className="text-center text-[12px] font-semibold tabular-nums text-slate-800">
                        {item.stockMinimo}
                      </div>
                    )}
                  </td>
                  <td className={tdNum}>
                    {props.onInlineUpdate ? (
                      <>
                        <TextInput
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          value={item.costoUnitario}
                          onChange={(e) =>
                            props.onInlineUpdate?.({
                              ...item,
                              costoUnitario: Number(e.target.value),
                            })
                          }
                        />
                        <div className="mt-1 text-center text-[11px] font-medium text-slate-500">
                          {formatMoney(item.costoUnitario)}
                        </div>
                      </>
                    ) : (
                      <div className="text-center text-[12px] font-semibold tabular-nums text-slate-800">
                        {formatMoney(item.costoUnitario)}
                      </div>
                    )}
                  </td>
                  <td className={`${tdBase} text-[12px] leading-snug text-slate-600`}>
                    {formatFechaHoraLocal(item.ultimaEntradaISO)}
                  </td>
                  <td className={`${tdBase} text-[12px] leading-snug text-slate-600`}>
                    {formatFechaHoraLocal(item.ultimaSalidaISO)}
                  </td>
                  <td className={`${tdBase} text-center`}>
                    {item.imagenUrl ? (
                      <button
                        type="button"
                        title="Ver imagen"
                        className="mx-auto inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm transition hover:border-blue-400 hover:shadow-md"
                        onClick={() => props.onPreviewImage(item.imagenUrl!)}
                      >
                        <img src={item.imagenUrl} alt="" className="h-8 w-8 rounded-md object-cover sm:h-9 sm:w-9 sm:rounded-lg" />
                      </button>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className={`${tdBase} px-1.5 pr-1.5 sm:px-2 sm:pr-2`}>
                    <div className={['grid w-full min-w-0 justify-items-end gap-1', actionGridCols].join(' ')}>
                      {showHistorial ? (
                        <button
                          type="button"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/35 sm:h-10 sm:w-10"
                          onClick={() => props.onHistorial?.(item)}
                          title="Historial de entradas y salidas"
                          aria-label="Historial de movimientos"
                        >
                          <IconHistory className="h-4 w-4 shrink-0 opacity-90 sm:h-[18px] sm:w-[18px]" />
                        </button>
                      ) : null}
                      {showSolicitar ? (
                        <button
                          type="button"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-blue-200/90 bg-white text-blue-900 shadow-sm transition hover:border-blue-300 hover:bg-blue-50/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/35 sm:h-10 sm:w-10"
                          onClick={() => props.onSolicitar?.(item)}
                          title="Solicitar producto"
                          aria-label="Solicitar producto"
                        >
                          <IconCart className="h-4 w-4 shrink-0 opacity-90 sm:h-[18px] sm:w-[18px]" />
                        </button>
                      ) : null}
                      {props.onEdit ? (
                        <button
                          type="button"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-section-navy text-white shadow-sm transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 sm:h-10 sm:w-10"
                          onClick={() => props.onEdit?.(item)}
                          title="Editar producto"
                          aria-label="Editar producto"
                        >
                          <IconPencil className="h-4 w-4 shrink-0 opacity-95 sm:h-[18px] sm:w-[18px]" />
                        </button>
                      ) : null}
                      {props.canDelete && props.onDelete ? (
                        <button
                          type="button"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-rose-200 bg-white text-rose-700 transition hover:border-rose-300 hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/35 sm:h-10 sm:w-10"
                          onClick={() => {
                            const msg = `¿Estás seguro de eliminar el producto "${item.nombre}" (${item.codigo})?\n\nEsta acción no se puede deshacer.`
                            if (window.confirm(msg)) props.onDelete?.(item.id)
                          }}
                          title="Eliminar producto (solo administrador)"
                          aria-label="Eliminar producto"
                        >
                          <IconTrash className="h-4 w-4 shrink-0 sm:h-[18px] sm:w-[18px]" />
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <PaginationBar
        page={safePage}
        totalPages={totalPages}
        totalItems={props.totalFiltered}
        pageSize={props.pageSize}
        onPageChange={props.onPageChange}
        className="rounded-b-3xl border-t border-slate-200/90 bg-gradient-to-b from-slate-50 to-slate-100/80"
      />
    </section>
  )
}
