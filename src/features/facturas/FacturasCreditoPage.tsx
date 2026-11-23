import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  POR_VENCER_DIAS,
  facturaAlerta,
  facturaAlertaLabel,
  limitePagoIso,
  todayIsoMexico,
  type FacturaAlerta,
  type FacturaStatus,
} from '../../lib/facturasCreditoDue'
import {
  attachFacturaCreditoArchivo,
  clearFacturaCreditoArchivo,
  deleteFacturaCredito,
  facturaCreditoArchivoAccept,
  fetchFacturasCredito,
  insertFacturaCredito,
  openFacturaCreditoArchivo,
  saveFacturaProveedor,
  updateFacturaCredito,
  type FacturaCreditoRow,
  type FacturaProveedorRow,
} from '../../lib/facturasCreditoRepo'
import { downloadFacturasCreditoExcel } from '../../lib/facturasCreditoExcel'
import { downloadFacturasCreditoPdf, type FacturaCreditoPdfRow } from '../../lib/facturasCreditoPdf'
import { canAccessFacturasCreditoNav, type AppRole } from '../../lib/roles'

type Filtro = 'pendientes' | 'por_vencer' | 'vencidas' | 'pagadas' | 'todas'

type Draft = {
  id: string | null
  proveedorId: string
  diasCredito: string
  descripcion: string
  factura: string
  monto: string
  fechaFactura: string
  fechaPago: string
  status: FacturaStatus
}

type ProveedorDraft = { nombre: string; diasCredito: string }

const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })

function formatMoney(value: number | null): string {
  if (value == null || Number.isNaN(value)) return '—'
  return money.format(value)
}

function formatIso(iso: string | null): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d}/${m}/${y}`
}

function emptyDraft(): Draft {
  return {
    id: null,
    proveedorId: '',
    diasCredito: '',
    descripcion: '',
    factura: '',
    monto: '',
    fechaFactura: todayIsoMexico(),
    fechaPago: '',
    status: 'PENDIENTE',
  }
}

function draftFromRow(row: FacturaCreditoRow): Draft {
  return {
    id: row.id,
    proveedorId: row.proveedor_id,
    diasCredito: row.proveedor?.dias_credito == null ? '' : String(row.proveedor.dias_credito),
    descripcion: row.descripcion,
    factura: row.factura,
    monto: row.monto_neto == null ? '' : String(row.monto_neto),
    fechaFactura: row.fecha_factura ?? '',
    fechaPago: row.fecha_pago ?? '',
    status: row.status,
  }
}

function alertaTone(alerta: FacturaAlerta): string {
  switch (alerta) {
    case 'vencida':
      return 'bg-rose-50 text-rose-900 border-rose-200'
    case 'por_vencer':
      return 'bg-amber-50 text-amber-950 border-amber-200'
    case 'pagada':
      return 'bg-emerald-50 text-emerald-900 border-emerald-200'
    default:
      return 'bg-slate-50 text-slate-700 border-slate-200'
  }
}

export function FacturasCreditoPage(props: { role: AppRole }) {
  if (!canAccessFacturasCreditoNav(props.role)) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 shadow-sm">
        Este apartado solo lo ven el encargado y los administradores.
      </div>
    )
  }

  const [facturas, setFacturas] = useState<FacturaCreditoRow[]>([])
  const [proveedores, setProveedores] = useState<FacturaProveedorRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('pendientes')
  const [proveedorId, setProveedorId] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [proveedorDraft, setProveedorDraft] = useState<ProveedorDraft | null>(null)
  const [proveedorError, setProveedorError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [exportBusy, setExportBusy] = useState<'excel' | 'pdf' | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [archivoMenu, setArchivoMenu] = useState<{ id: string; top: number; left: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const fileTargetId = useRef<string | null>(null)
  const today = todayIsoMexico()

  const load = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true)
      setError(null)
    }
    try {
      const data = await fetchFacturasCredito()
      setFacturas(data.facturas)
      setProveedores(data.proveedores)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las facturas')
      if (!silent) setFacturas([])
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!archivoMenu) return
    function close() {
      setArchivoMenu(null)
    }
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [archivoMenu])

  function pickArchivo(id: string) {
    fileTargetId.current = id
    setArchivoMenu(null)
    const input = fileRef.current
    if (!input) return
    input.value = ''
    input.click()
  }

  async function onArchivoPicked(file: File | null) {
    const id = fileTargetId.current
    if (!file || !id) return
    setBusy(true)
    setError(null)
    try {
      await attachFacturaCreditoArchivo(id, file)
      await load(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo adjuntar el archivo')
    } finally {
      setBusy(false)
    }
  }

  async function onOpenArchivo(row: FacturaCreditoRow) {
    const path = row.archivo_path?.trim()
    if (!path) return
    setArchivoMenu(null)
    setError(null)
    try {
      await openFacturaCreditoArchivo(path, row.archivo_nombre?.trim() || 'factura')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo abrir el archivo')
    }
  }

  async function onClearArchivo(id: string) {
    setArchivoMenu(null)
    setBusy(true)
    setError(null)
    try {
      await clearFacturaCreditoArchivo(id)
      await load(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo quitar el archivo')
    } finally {
      setBusy(false)
    }
  }

  const enriched = useMemo(() => {
    return facturas.map((row) => {
      const dias = row.proveedor?.dias_credito ?? null
      const limite = limitePagoIso({
        fechaFactura: row.fecha_factura,
        fechaPago: row.fecha_pago,
        diasCredito: dias,
        status: row.status,
      })
      const alerta = facturaAlerta({ status: row.status, limite, today })
      return { row, dias, limite, alerta }
    })
  }, [facturas, today])

  const counts = useMemo(() => {
    let vencidas = 0
    let porVencer = 0
    let pendientes = 0
    let pagadas = 0
    for (const item of enriched) {
      if (item.alerta === 'pagada') pagadas++
      else pendientes++
      if (item.alerta === 'vencida') vencidas++
      if (item.alerta === 'por_vencer') porVencer++
    }
    return { vencidas, porVencer, pendientes, pagadas, todas: enriched.length }
  }, [enriched])

  const visible = useMemo(() => {
    const text = q.trim().toLowerCase()
    return enriched
      .filter((item) => {
        if (proveedorId && item.row.proveedor_id !== proveedorId) return false
        if (filtro === 'pendientes' && item.alerta === 'pagada') return false
        if (filtro === 'por_vencer' && item.alerta !== 'por_vencer') return false
        if (filtro === 'vencidas' && item.alerta !== 'vencida') return false
        if (filtro === 'pagadas' && item.alerta !== 'pagada') return false
        if (!text) return true
        const blob = `${item.row.proveedor?.nombre ?? ''} ${item.row.descripcion} ${item.row.factura}`.toLowerCase()
        return blob.includes(text)
      })
      .sort((a, b) => {
        if (a.alerta === 'pagada' && b.alerta !== 'pagada') return 1
        if (b.alerta === 'pagada' && a.alerta !== 'pagada') return -1
        return (a.limite ?? '9999').localeCompare(b.limite ?? '9999')
      })
  }, [enriched, filtro, proveedorId, q])

  function onProveedorChange(id: string) {
    if (!draft) return
    const proveedor = proveedores.find((p) => p.id === id)
    setDraft({
      ...draft,
      proveedorId: id,
      diasCredito: proveedor?.dias_credito == null ? '' : String(proveedor.dias_credito),
    })
  }

  async function onSaveProveedor() {
    if (!proveedorDraft) return
    setProveedorError(null)
    const nombre = proveedorDraft.nombre.trim()
    if (!nombre) {
      setProveedorError('Escribe el nombre del proveedor.')
      return
    }
    const diasRaw = proveedorDraft.diasCredito.trim()
    const diasCredito = diasRaw === '' ? null : Number(diasRaw)
    if (diasCredito != null && (!Number.isInteger(diasCredito) || diasCredito < 0)) {
      setProveedorError('Los días de crédito tienen que ser un número entero.')
      return
    }
    setBusy(true)
    try {
      await saveFacturaProveedor({ nombre, diasCredito })
      setProveedorDraft(null)
      await load()
    } catch (e) {
      setProveedorError(e instanceof Error ? e.message : 'No se guardó el proveedor')
    } finally {
      setBusy(false)
    }
  }

  async function onSave() {
    if (!draft) return
    setFormError(null)
    const descripcion = draft.descripcion.trim()
    const factura = draft.factura.trim()
    if (!descripcion && !factura) {
      setFormError('Escribe la descripción o el número de factura.')
      return
    }
    const diasRaw = draft.diasCredito.trim()
    const diasCredito = diasRaw === '' ? null : Number(diasRaw)
    if (diasCredito != null && (!Number.isInteger(diasCredito) || diasCredito < 0)) {
      setFormError('Los días de crédito tienen que ser un número entero.')
      return
    }
    const montoRaw = draft.monto.trim().replace(/,/g, '')
    const montoNeto = montoRaw === '' ? null : Number(montoRaw)
    if (montoNeto != null && Number.isNaN(montoNeto)) {
      setFormError('El monto neto no es un número.')
      return
    }
    setBusy(true)
    try {
      const proveedorId = draft.proveedorId
      if (!proveedorId) {
        setFormError('Elige el proveedor. Si es nuevo, usa el botón Nuevo proveedor.')
        setBusy(false)
        return
      }
      const current = proveedores.find((p) => p.id === proveedorId)
      if (current && current.dias_credito !== diasCredito) {
        await saveFacturaProveedor({ id: proveedorId, nombre: current.nombre, diasCredito })
      }
      const input = {
        proveedorId,
        descripcion,
        factura,
        montoNeto,
        fechaFactura: draft.fechaFactura || null,
        fechaPago: draft.fechaPago || null,
        status: draft.status,
      }
      if (draft.id) await updateFacturaCredito(draft.id, input)
      else await insertFacturaCredito(input)
      setDraft(null)
      await load()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'No se guardó la factura')
    } finally {
      setBusy(false)
    }
  }

  async function onMarkPaid(row: FacturaCreditoRow) {
    setBusy(true)
    setError(null)
    try {
      await updateFacturaCredito(row.id, {
        proveedorId: row.proveedor_id,
        descripcion: row.descripcion,
        factura: row.factura,
        montoNeto: row.monto_neto,
        fechaFactura: row.fecha_factura,
        fechaPago: row.fecha_pago ?? today,
        status: 'PAGADA',
      })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se marcó como pagada')
    } finally {
      setBusy(false)
    }
  }

  async function onDelete(row: FacturaCreditoRow) {
    if (!window.confirm(`¿Quitar la factura ${row.factura || row.descripcion}?`)) return
    setBusy(true)
    setError(null)
    try {
      await deleteFacturaCredito(row.id)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se eliminó la factura')
    } finally {
      setBusy(false)
    }
  }

  function exportRows(): FacturaCreditoPdfRow[] {
    return enriched.map((item) => ({
      proveedor: item.row.proveedor?.nombre ?? '',
      descripcion: item.row.descripcion,
      factura: item.row.factura,
      monto: item.row.monto_neto,
      fechaFactura: item.row.fecha_factura,
      dias: item.dias,
      limite: item.limite,
      fechaPago: item.row.fecha_pago,
      alerta: item.alerta,
      archivo: Boolean(item.row.archivo_path),
    }))
  }

  async function onExport(kind: 'excel' | 'pdf') {
    setExportBusy(kind)
    setError(null)
    try {
      const rows = exportRows()
      if (kind === 'excel') await downloadFacturasCreditoExcel(rows)
      else await downloadFacturasCreditoPdf(rows)
      setExportOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : kind === 'excel' ? 'No se pudo descargar el Excel' : 'No se pudo descargar el PDF')
    } finally {
      setExportBusy(null)
    }
  }

  const chips: Array<{ id: Filtro; label: string; n: number }> = [
    { id: 'pendientes', label: 'Pendientes', n: counts.pendientes },
    { id: 'por_vencer', label: `Por vencer · ${POR_VENCER_DIAS} días`, n: counts.porVencer },
    { id: 'vencidas', label: 'Vencidas', n: counts.vencidas },
    { id: 'pagadas', label: 'Pagadas', n: counts.pagadas },
    { id: 'todas', label: 'Todas', n: counts.todas },
  ]

  return (
    <div className="space-y-4">
      <header className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Producción</p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Facturas crédito</h1>
            <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-slate-600">
              El límite de pago es la fecha de la factura más los días de crédito del proveedor. Por vencer son las que
              vencen en los próximos {POR_VENCER_DIAS} días.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={loading || exportBusy != null}
              className="min-h-[40px] rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-[13px] font-semibold text-emerald-900 shadow-sm hover:bg-emerald-100 disabled:opacity-60"
              onClick={() => setExportOpen(true)}
            >
              Exportar Excel / PDF
            </button>
            <button
              type="button"
              className="min-h-[42px] rounded-xl border border-slate-300 bg-white px-4 py-2 text-[13px] font-bold text-slate-800 shadow-sm hover:bg-slate-50"
              onClick={() => {
                setProveedorError(null)
                setProveedorDraft({ nombre: '', diasCredito: '' })
              }}
            >
              Nuevo proveedor
            </button>
            <button
              type="button"
              className="min-h-[42px] rounded-xl bg-section-navy px-4 py-2 text-[13px] font-bold text-white shadow-sm hover:brightness-110"
              onClick={() => {
                setFormError(null)
                setDraft(emptyDraft())
              }}
            >
              Nuevo dato
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <button
            key={chip.id}
            type="button"
            className={[
              'rounded-xl border px-3 py-2 text-[13px] font-semibold',
              filtro === chip.id
                ? 'border-section-navy bg-section-navy text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
            ].join(' ')}
            onClick={() => setFiltro(chip.id)}
          >
            {chip.label} <span className="tabular-nums">{chip.n}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="min-w-[14rem] flex-1">
          <span className="text-[11px] font-bold uppercase text-slate-500">Buscar</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Proveedor, factura o descripción"
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-[14px] outline-none focus:ring-2 focus:ring-blue-500/30"
          />
        </label>
        <label className="min-w-[14rem]">
          <span className="text-[11px] font-bold uppercase text-slate-500">Proveedor</span>
          <select
            value={proveedorId}
            onChange={(e) => setProveedorId(e.target.value)}
            className="mt-1 block w-full rounded-xl border border-slate-200 px-3 py-2 text-[14px]"
          >
            <option value="">Todos</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
                {p.dias_credito == null ? '' : ` · ${p.dias_credito} días`}
              </option>
            ))}
          </select>
        </label>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept={facturaCreditoArchivoAccept()}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null
          void onArchivoPicked(file)
        }}
      />

      {archivoMenu ? (
        <>
        <button
          type="button"
          className="fixed inset-0 z-40 cursor-default"
          aria-label="Cerrar"
          onClick={() => setArchivoMenu(null)}
        />
        <div
          className="fixed z-50 min-w-[11rem] rounded-xl border border-slate-200 bg-white p-1 text-left shadow-lg"
          style={{ top: archivoMenu.top, left: archivoMenu.left }}
        >
          <button
            type="button"
            className="block w-full rounded-lg px-3 py-2 text-left text-[13px] font-semibold text-slate-800 hover:bg-slate-50"
            onClick={() => {
              const row = facturas.find((item) => item.id === archivoMenu.id)
              if (row) void onOpenArchivo(row)
            }}
          >
            Ver archivo
          </button>
          <button
            type="button"
            className="block w-full rounded-lg px-3 py-2 text-left text-[13px] font-semibold text-slate-800 hover:bg-slate-50"
            onClick={() => pickArchivo(archivoMenu.id)}
          >
            Cambiar archivo
          </button>
          <button
            type="button"
            className="block w-full rounded-lg px-3 py-2 text-left text-[13px] font-semibold text-rose-700 hover:bg-rose-50"
            onClick={() => void onClearArchivo(archivoMenu.id)}
          >
            Quitar archivo
          </button>
        </div>
        </>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-900">{error}</div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <p className="px-4 py-10 text-center text-[14px] text-slate-600">Cargando facturas…</p>
        ) : visible.length === 0 ? (
          <p className="px-4 py-10 text-center text-[14px] text-slate-600">No hay facturas con ese filtro.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full text-left text-[13px]">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-bold">Proveedor</th>
                  <th className="px-3 py-2 font-bold">Descripción</th>
                  <th className="px-3 py-2 font-bold">Factura</th>
                  <th className="px-3 py-2 font-bold">Monto</th>
                  <th className="px-3 py-2 font-bold">Fecha factura</th>
                  <th className="px-3 py-2 font-bold">Días</th>
                  <th className="px-3 py-2 font-bold">Límite</th>
                  <th className="px-3 py-2 font-bold">Fecha de pago</th>
                  <th className="px-3 py-2 font-bold">Estado</th>
                  <th className="px-3 py-2 font-bold" />
                </tr>
              </thead>
              <tbody>
                {visible.map(({ row, dias, limite, alerta }) => (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="max-w-[220px] px-3 py-2 font-semibold text-slate-900">{row.proveedor?.nombre}</td>
                    <td className="max-w-[260px] px-3 py-2 text-slate-700">{row.descripcion || '—'}</td>
                    <td className="max-w-[180px] px-3 py-2 font-mono text-[12px] text-slate-800">{row.factura || '—'}</td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">{formatMoney(row.monto_neto)}</td>
                    <td className="whitespace-nowrap px-3 py-2">{formatIso(row.fecha_factura)}</td>
                    <td className="px-3 py-2 tabular-nums">{dias == null ? '—' : dias}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-semibold">{formatIso(limite)}</td>
                    <td className="whitespace-nowrap px-3 py-2">{formatIso(row.fecha_pago)}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded-lg border px-2 py-1 text-[11px] font-bold ${alertaTone(alerta)}`}>
                        {facturaAlertaLabel(alerta)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      <button
                        type="button"
                        disabled={busy}
                        title={row.archivo_nombre?.trim() || 'Adjuntar archivo'}
                        aria-label={row.archivo_path ? 'Archivo adjunto' : 'Adjuntar archivo'}
                        className={[
                          'mr-2 inline-flex h-7 w-7 items-center justify-center rounded-lg border align-middle disabled:opacity-50',
                          row.archivo_path
                            ? 'border-sky-300 bg-sky-50 text-section-navy'
                            : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-800',
                        ].join(' ')}
                        onClick={(e) => {
                          if (!row.archivo_path) {
                            pickArchivo(row.id)
                            return
                          }
                          const rect = e.currentTarget.getBoundingClientRect()
                          setArchivoMenu((cur) =>
                            cur?.id === row.id
                              ? null
                              : { id: row.id, top: rect.bottom + 4, left: Math.max(8, rect.right - 180) },
                          )
                        }}
                      >
                        <PaperclipIcon filled={Boolean(row.archivo_path)} />
                      </button>
                      {alerta !== 'pagada' ? (
                        <button
                          type="button"
                          disabled={busy}
                          className="mr-2 text-[12px] font-bold text-emerald-800 hover:underline disabled:opacity-50"
                          onClick={() => void onMarkPaid(row)}
                        >
                          Pagada
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="mr-2 text-[12px] font-bold text-section-navy hover:underline"
                        onClick={() => {
                          setFormError(null)
                          setDraft(draftFromRow(row))
                        }}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        className="text-[12px] font-bold text-rose-700 hover:underline disabled:opacity-50"
                        onClick={() => void onDelete(row)}
                      >
                        Quitar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {proveedorDraft ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <h2 className="text-[18px] font-bold text-slate-900">Nuevo proveedor</h2>
            <p className="mt-1 text-[13px] text-slate-600">
              Queda en la lista para usarlo al capturar una factura. Los días de crédito arman el límite de pago.
            </p>
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="text-[11px] font-bold uppercase text-slate-500">Nombre</span>
                <input
                  value={proveedorDraft.nombre}
                  onChange={(e) => setProveedorDraft({ ...proveedorDraft, nombre: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-[14px]"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-bold uppercase text-slate-500">Días de crédito</span>
                <input
                  value={proveedorDraft.diasCredito}
                  onChange={(e) => setProveedorDraft({ ...proveedorDraft, diasCredito: e.target.value })}
                  inputMode="numeric"
                  placeholder="Ej. 15"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-[14px]"
                />
              </label>
              {proveedorError ? <p className="text-[13px] text-rose-700">{proveedorError}</p> : null}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-xl border border-slate-200 px-4 py-2 text-[13px] font-semibold text-slate-700"
                onClick={() => setProveedorDraft(null)}
                disabled={busy}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="rounded-xl bg-section-navy px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50"
                onClick={() => void onSaveProveedor()}
                disabled={busy}
              >
                {busy ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {draft ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-4 sm:items-center">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
            <h2 className="text-[18px] font-bold text-slate-900">{draft.id ? 'Editar factura' : 'Nuevo dato'}</h2>
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="text-[11px] font-bold uppercase text-slate-500">Proveedor</span>
                <select
                  value={draft.proveedorId}
                  onChange={(e) => onProveedorChange(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-[14px]"
                >
                  <option value="">Elegir…</option>
                  {proveedores.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-[11px] font-bold uppercase text-slate-500">Días de crédito</span>
                <input
                  value={draft.diasCredito}
                  onChange={(e) => setDraft({ ...draft, diasCredito: e.target.value })}
                  inputMode="numeric"
                  placeholder="Ej. 15"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-[14px]"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-bold uppercase text-slate-500">Descripción</span>
                <input
                  value={draft.descripcion}
                  onChange={(e) => setDraft({ ...draft, descripcion: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-[14px]"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-bold uppercase text-slate-500">Factura</span>
                <input
                  value={draft.factura}
                  onChange={(e) => setDraft({ ...draft, factura: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-[14px]"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-bold uppercase text-slate-500">Monto neto</span>
                <input
                  value={draft.monto}
                  onChange={(e) => setDraft({ ...draft, monto: e.target.value })}
                  inputMode="decimal"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-[14px]"
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-[11px] font-bold uppercase text-slate-500">Fecha factura</span>
                  <input
                    type="date"
                    value={draft.fechaFactura}
                    onChange={(e) => setDraft({ ...draft, fechaFactura: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-[14px]"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] font-bold uppercase text-slate-500">Fecha de pago</span>
                  <input
                    type="date"
                    value={draft.fechaPago}
                    onChange={(e) => setDraft({ ...draft, fechaPago: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-[14px]"
                  />
                </label>
              </div>
              <label className="block">
                <span className="text-[11px] font-bold uppercase text-slate-500">Estatus</span>
                <select
                  value={draft.status}
                  onChange={(e) => setDraft({ ...draft, status: e.target.value as FacturaStatus })}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-[14px]"
                >
                  <option value="PENDIENTE">Pendiente</option>
                  <option value="VENCIDA">Vencida</option>
                  <option value="PAGADA">Pagada</option>
                </select>
              </label>
              {formError ? <p className="text-[13px] text-rose-700">{formError}</p> : null}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-xl border border-slate-200 px-4 py-2 text-[13px] font-semibold text-slate-700"
                onClick={() => setDraft(null)}
                disabled={busy}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="rounded-xl bg-section-navy px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50"
                onClick={() => void onSave()}
                disabled={busy}
              >
                {busy ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {exportOpen ? (
        <div className="fixed inset-0 z-[130] flex items-end justify-center bg-slate-950/50 p-4 sm:items-center">
          <div
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
            role="dialog"
            aria-labelledby="facturas-export-title"
          >
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 id="facturas-export-title" className="text-[17px] font-bold text-slate-900">
                Exportar facturas crédito
              </h2>
              <p className="mt-1 text-[12px] text-slate-600">
                Se descargan todas las facturas, con proveedor, monto, límite de crédito y estado.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 border-t border-slate-100 p-4">
              <button
                type="button"
                disabled={exportBusy != null}
                className="min-h-[42px] flex-1 rounded-xl bg-emerald-700 px-4 py-2 text-[13px] font-bold text-white hover:bg-emerald-800 disabled:opacity-60"
                onClick={() => void onExport('excel')}
              >
                {exportBusy === 'excel' ? 'Exportando…' : 'Descargar Excel'}
              </button>
              <button
                type="button"
                disabled={exportBusy != null}
                className="min-h-[42px] flex-1 rounded-xl bg-section-navy px-4 py-2 text-[13px] font-bold text-white hover:brightness-110 disabled:opacity-60"
                onClick={() => void onExport('pdf')}
              >
                {exportBusy === 'pdf' ? 'Exportando…' : 'Descargar PDF'}
              </button>
              <button
                type="button"
                disabled={exportBusy != null}
                className="min-h-[42px] w-full rounded-xl border border-slate-200 px-4 py-2 text-[13px] font-semibold text-slate-800 sm:w-auto"
                onClick={() => setExportOpen(false)}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function PaperclipIcon(props: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={props.filled ? 2.4 : 2} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"
      />
    </svg>
  )
}
