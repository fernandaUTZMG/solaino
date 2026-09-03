import { useEffect, useState } from 'react'
import type { CatalogOpt } from '../../lib/ordenCompraPdfExtract'
import {
  ensureCatalogIdByName,
  fetchEmpresaCatalog,
  fetchRequisitorCatalog,
  updateOrdenCompraCatalog,
} from '../../lib/bodegaOrdenCatalog'
import type { OrdenCompraRow } from '../../lib/bodegaOrdenes'

export function OrdenCompraCatalogEditModal(props: {
  oc: OrdenCompraRow
  empresaOpts: CatalogOpt[]
  requisitorOpts: CatalogOpt[]
  onClose: () => void
  onSaved: (next: { empresaOpts: CatalogOpt[]; requisitorOpts: CatalogOpt[] }) => void
}) {
  const [empresaOpts, setEmpresaOpts] = useState<CatalogOpt[]>(props.empresaOpts)
  const [requisitorOpts, setRequisitorOpts] = useState<CatalogOpt[]>(props.requisitorOpts)
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [catalogNotice, setCatalogNotice] = useState<string | null>(null)
  const [empresaId, setEmpresaId] = useState(props.oc.empresa_id ?? '')
  const [requisitorId, setRequisitorId] = useState(props.oc.requisitor_id ?? '')
  const [empresaManual, setEmpresaManual] = useState('')
  const [requisitorManual, setRequisitorManual] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setEmpresaOpts(props.empresaOpts)
    setRequisitorOpts(props.requisitorOpts)
  }, [props.empresaOpts, props.requisitorOpts])

  useEffect(() => {
    let cancelled = false
    setCatalogLoading(true)
    setCatalogNotice(null)
    ;(async () => {
      try {
        const [emp, req] = await Promise.all([fetchEmpresaCatalog(), fetchRequisitorCatalog()])
        if (cancelled) return
        setEmpresaOpts(emp)
        setRequisitorOpts(req)
        const parts: string[] = []
        if (emp.length === 0) {
          parts.push('No hay empresas en catálogo (usa el campo manual o pide al admin que cargue empresas).')
        }
        if (req.length === 0) {
          parts.push('No hay requisitores en catálogo (usa el campo manual, ej. Fernando Arreola).')
        }
        if (parts.length) setCatalogNotice(parts.join(' '))
      } catch (e) {
        if (!cancelled) {
          setCatalogNotice(
            e instanceof Error
              ? `No se pudo cargar catálogos: ${e.message}`
              : 'No se pudo cargar catálogos. Revisa permisos en Supabase (empresas / requisitores).',
          )
        }
      } finally {
        if (!cancelled) setCatalogLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    setEmpresaId(props.oc.empresa_id ?? '')
    setRequisitorId(props.oc.requisitor_id ?? '')
    setEmpresaManual('')
    setRequisitorManual('')
    setError(null)
  }, [props.oc.id, props.oc.empresa_id, props.oc.requisitor_id])

  async function submit() {
    setError(null)
    setBusy(true)
    try {
      let empOpts = empresaOpts
      let reqOpts = requisitorOpts
      let eid = empresaId || null
      let rid = requisitorId || null

      if (empresaManual.trim()) {
        eid = (await ensureCatalogIdByName('empresas', empresaManual, empOpts)) || null
        empOpts = await fetchEmpresaCatalog()
      }
      if (requisitorManual.trim()) {
        rid = (await ensureCatalogIdByName('requisitores', requisitorManual, reqOpts)) || null
        reqOpts = await fetchRequisitorCatalog()
      }

      await updateOrdenCompraCatalog(props.oc.id, { empresaId: eid, requisitorId: rid })
      props.onSaved({ empresaOpts: empOpts, requisitorOpts: reqOpts })
      props.onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-[2px]"
        aria-label="Cerrar"
        onClick={() => props.onClose()}
      />
      <div className="relative flex max-h-[min(90vh,640px)] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-blue-950/25 bg-white shadow-2xl">
        <div className="shrink-0 border-b border-blue-950/25 bg-section-navy px-5 py-4 text-white">
          <div className="text-lg font-bold">Editar orden de compra</div>
          <p className="mt-1 font-mono text-sm text-blue-100/90">{props.oc.numero}</p>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          {error ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-900">{error}</p>
          ) : null}
          {catalogNotice ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-snug text-amber-950">
              {catalogNotice}
            </p>
          ) : null}
          {catalogLoading ? (
            <p className="text-[13px] text-slate-600">Cargando catálogos de empresa y requisitor…</p>
          ) : null}
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Empresa (catálogo)</span>
            <select
              value={empresaId}
              onChange={(e) => setEmpresaId(e.target.value)}
              disabled={catalogLoading}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-950/45 focus:ring-2 focus:ring-section-navy/20 disabled:opacity-60"
            >
              <option value="">— Sin empresa —</option>
              {empresaOpts.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              O empresa manual (nueva en catálogo)
            </span>
            <input
              value={empresaManual}
              onChange={(e) => setEmpresaManual(e.target.value)}
              placeholder="Ej. nombre de cliente si no está en la lista"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-950/45 focus:ring-2 focus:ring-section-navy/20"
            />
          </label>
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Requisitor (catálogo)</span>
            <select
              value={requisitorId}
              onChange={(e) => setRequisitorId(e.target.value)}
              disabled={catalogLoading}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-950/45 focus:ring-2 focus:ring-section-navy/20 disabled:opacity-60"
            >
              <option value="">— Sin requisitor —</option>
              {requisitorOpts.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              O requisitor manual (nuevo en catálogo)
            </span>
            <input
              value={requisitorManual}
              onChange={(e) => setRequisitorManual(e.target.value)}
              placeholder="Ej. Fernando Arreola"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-950/45 focus:ring-2 focus:ring-section-navy/20"
            />
          </label>
          <p className="text-[12px] leading-snug text-slate-600">
            Si el PDF no detectó al requisitor al adjuntar la orden, elige uno del catálogo o escribe el nombre manual.
            El manual crea la entrada en catálogo y la vincula a esta OC.
          </p>
        </div>
        <div className="shrink-0 flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800"
            onClick={() => props.onClose()}
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy}
            className="rounded-xl bg-section-navy px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
            onClick={() => void submit()}
          >
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
