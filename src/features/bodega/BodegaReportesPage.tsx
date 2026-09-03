import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AppRole } from '../../lib/roles'
import { downloadBodegaReportesPdf } from '../../lib/bodegaReportesPdf'
import type { BodegaOcReportGroup, BodegaProjectReportRow, BodegaReportesBundle } from '../../lib/bodegaReportesRepo'
import { fetchBodegaReportesBundle } from '../../lib/bodegaReportesRepo'
import { bodegaProjectStatusLabelEs } from '../../lib/bodegaProjectsRepo'
import {
  OrdenProjectTimeGrid,
  OrdenTimeLegend,
  OrdenTimeSegmentsBar,
  OrdenTimesSummaryLine,
} from './BodegaOrdenTimesUi.tsx'

type TabId = 'proyectos' | 'oc'

function formatDateEs(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  try {
    return d.toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return iso.slice(0, 10)
  }
}

function formatDateTimeEs(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  try {
    return d.toLocaleString('es-MX', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function ProjectReportCard(props: { row: BodegaProjectReportRow; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(props.defaultOpen ?? false)
  const p = props.row.project
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm ring-1 ring-slate-900/[0.03]">
      <button
        type="button"
        className="flex w-full flex-wrap items-start justify-between gap-3 px-4 py-3.5 text-left transition hover:bg-slate-50/80"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[14px] font-bold text-slate-900">{p.folio}</p>
          <p className="mt-0.5 truncate text-[12px] text-slate-600" title={p.nombre}>
            {p.nombre}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            OC {p.orden?.trim() || '—'} · {p.empresa || p.cliente}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-800">
            {bodegaProjectStatusLabelEs(p.status)}
          </span>
          <span className="text-[13px] font-black tabular-nums text-emerald-800">{p.avance_pct}%</span>
        </div>
      </button>
      {open ? (
        <div className="space-y-4 border-t border-slate-100 px-4 py-4">
          <div className="grid gap-2 text-[12px] text-slate-600 sm:grid-cols-2">
            <p>
              <span className="font-semibold text-slate-800">Inicio proyecto:</span>{' '}
              {formatDateEs(p.fecha_inicio)}
            </p>
            <p>
              <span className="font-semibold text-slate-800">Término:</span> {formatDateEs(p.fecha_termino)}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Tiempos por reloj (lun–vie 8:00–17:30)
            </p>
            <div className="mt-2">
              <OrdenTimeSegmentsBar times={props.row.times} />
            </div>
            <div className="mt-2">
              <OrdenProjectTimeGrid times={props.row.times} compact />
            </div>
            <div className="mt-2">
              <OrdenTimesSummaryLine times={props.row.times} />
            </div>
          </div>
          {p.design_contratiempo_notes ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-amber-900">Contratiempo / retraso</p>
              <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-amber-950">
                {p.design_contratiempo_notes}
              </p>
            </div>
          ) : null}
          {props.row.activityNotes.length > 0 ? (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Historial y notas</p>
              <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto">
                {props.row.activityNotes.map((n) => (
                  <li key={n.id} className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2">
                    <p className="text-[10px] font-semibold text-slate-500">
                      {formatDateTimeEs(n.created_at)} · {n.typeLabel} · {n.authorLabel}
                    </p>
                    <p className="mt-0.5 text-[12px] leading-snug text-slate-800">{n.comment}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-[12px] text-slate-500">Sin notas en el historial de actividad.</p>
          )}
        </div>
      ) : null}
    </article>
  )
}

function OcReportCard(props: { group: BodegaOcReportGroup }) {
  const [open, setOpen] = useState(false)
  const g = props.group
  return (
    <article className="overflow-hidden rounded-2xl border-2 border-indigo-200/80 bg-white shadow-sm">
      <div className="bg-indigo-700 px-4 py-3 text-white">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-mono text-[16px] font-bold">OC {g.numero}</p>
            <p className="text-[11px] text-indigo-100">
              Escaneada / registrada: {formatDateEs(g.ocFecha)}
            </p>
            <p className="mt-0.5 truncate text-[12px] font-medium text-indigo-50">{g.empresaNombre}</p>
          </div>
          <div className="text-right text-[11px]">
            <p className="font-bold tabular-nums">{g.avgAvancePct}% prom.</p>
            <p className="text-indigo-100">
              {g.nTerminados}/{g.nProjects} terminados
            </p>
          </div>
        </div>
      </div>
      <div className="space-y-3 p-4">
        <div>
          <p className="text-[10px] font-bold uppercase text-slate-600">Suma de tiempos (todos los folios)</p>
          <div className="mt-2">
            <OrdenTimeSegmentsBar times={g.timesSum} />
          </div>
          <div className="mt-2">
            <OrdenProjectTimeGrid times={g.timesSum} compact />
          </div>
          <OrdenTimesSummaryLine times={g.timesSum} />
        </div>
        <button
          type="button"
          className="w-full rounded-lg border border-indigo-200 bg-indigo-50 py-2 text-[12px] font-bold text-indigo-900 hover:bg-indigo-100"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? 'Ocultar proyectos' : `Ver ${g.nProjects} proyecto(s) y notas`}
        </button>
        {open ? (
          <div className="space-y-3 border-t border-slate-100 pt-3">
            {g.projects.map((pr) => (
              <ProjectReportCard key={pr.project.id} row={pr} />
            ))}
          </div>
        ) : null}
      </div>
    </article>
  )
}

export function BodegaReportesPage(_props: { role: AppRole }) {
  const [tab, setTab] = useState<TabId>('oc')
  const [bundle, setBundle] = useState<BodegaReportesBundle | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [pdfBusy, setPdfBusy] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setBundle(await fetchBodegaReportesBundle())
    } catch (e) {
      setBundle(null)
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los reportes')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const filteredProjects = useMemo(() => {
    if (!bundle) return []
    const s = q.trim().toLowerCase()
    return bundle.projects.filter((row) => {
      if (statusFilter !== 'all' && row.project.status !== statusFilter) return false
      if (!s) return true
      const blob = `${row.project.folio} ${row.project.nombre} ${row.project.orden} ${row.project.empresa} ${row.project.cliente}`.toLowerCase()
      return blob.includes(s)
    })
  }, [bundle, q, statusFilter])

  const filteredOc = useMemo(() => {
    if (!bundle) return []
    const s = q.trim().toLowerCase()
    return bundle.ocGroups.filter((g) => {
      if (!s) return true
      const blob = `${g.numero} ${g.empresaNombre} ${g.solicitante} ${g.projects.map((p) => p.project.folio).join(' ')}`.toLowerCase()
      return blob.includes(s)
    })
  }, [bundle, q])

  async function onExportPdf() {
    if (!bundle || pdfBusy) return
    setPdfBusy(true)
    try {
      const ocForPdf =
        tab === 'oc'
          ? filteredOc
          : bundle.ocGroups.filter((g) =>
              g.projects.some((pr) => filteredProjects.some((fp) => fp.project.id === pr.project.id)),
            )
      const filterNote =
        q.trim() || (tab === 'proyectos' && statusFilter !== 'all')
          ? `Filtro aplicado: ${q.trim() ? `búsqueda «${q.trim()}»` : ''}${q.trim() && statusFilter !== 'all' ? ' · ' : ''}${statusFilter !== 'all' ? `estado ${statusFilter}` : ''}`
          : ''
      await downloadBodegaReportesPdf({
        bundle,
        ocGroups: ocForPdf,
        filterNote: filterNote || undefined,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo generar el PDF')
    } finally {
      setPdfBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <header className="overflow-hidden rounded-2xl border border-slate-200/90 bg-gradient-to-br from-section-navy via-section-navy to-blue-950 text-white shadow-md">
        <div className="px-5 py-5 sm:px-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-200/90">Bodega</p>
          <h1 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">Reportes de tiempos y notas</h1>
          <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-blue-100/95">
            Tiempos medidos con los relojes de cada etapa (diseño, programación, maquinado, perfilado, detallado,
            armado). Solo cuentan minutos hábiles de <strong>lunes a viernes, 8:00 a 17:30</strong>. La fecha de la OC
            es la del escaneo/registro del PDF; cada proyecto acumula su propio tiempo si trabajan varios a la vez.
            Usa <strong>Exportar PDF</strong> para el informe con logo SOLAINO, estadísticas, tiempos por OC y notas de
            contratiempos.
          </p>
          {bundle ? (
            <p className="mt-2 text-[11px] text-blue-200/80">
              Actualizado: {formatDateTimeEs(bundle.loadedAt)}
            </p>
          ) : null}
        </div>
        <div className="border-t border-white/10 bg-black/15 px-5 py-3 sm:px-6">
          <OrdenTimeLegend compact />
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={[
            'rounded-xl px-4 py-2 text-[13px] font-semibold transition',
            tab === 'oc' ? 'bg-section-navy text-white shadow-md' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
          ].join(' ')}
          onClick={() => setTab('oc')}
        >
          Por orden de compra
        </button>
        <button
          type="button"
          className={[
            'rounded-xl px-4 py-2 text-[13px] font-semibold transition',
            tab === 'proyectos'
              ? 'bg-section-navy text-white shadow-md'
              : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
          ].join(' ')}
          onClick={() => setTab('proyectos')}
        >
          Por proyecto (folio)
        </button>
        <div className="ml-auto flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[13px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
            disabled={loading}
            onClick={() => void reload()}
          >
            {loading ? 'Cargando…' : 'Actualizar'}
          </button>
          <button
            type="button"
            className="rounded-xl bg-emerald-600 px-4 py-2 text-[13px] font-bold text-white shadow-md hover:bg-emerald-700 disabled:opacity-50"
            disabled={loading || !bundle || pdfBusy}
            onClick={() => void onExportPdf()}
          >
            {pdfBusy ? 'Generando PDF…' : 'Exportar PDF'}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
        <label className="min-w-[12rem] flex-1">
          <span className="text-[11px] font-bold uppercase text-slate-500">Buscar</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={tab === 'oc' ? 'OC, empresa, folio…' : 'Folio, nombre, OC…'}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-[14px] outline-none focus:ring-2 focus:ring-blue-500/30"
          />
        </label>
        {tab === 'proyectos' ? (
          <label>
            <span className="text-[11px] font-bold uppercase text-slate-500">Estado</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="mt-1 block min-w-[10rem] rounded-xl border border-slate-200 px-3 py-2 text-[14px]"
            >
              <option value="all">Todos</option>
              <option value="en_diseno">En diseño</option>
              <option value="en_programacion">En programación</option>
              <option value="terminado">Terminado</option>
            </select>
          </label>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-[14px] text-rose-900">{error}</div>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-16 text-center text-[14px] text-slate-600">
          Cargando tiempos y notas…
        </div>
      ) : tab === 'oc' ? (
        filteredOc.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center text-[14px] text-slate-600">
            Sin órdenes que coincidan con el filtro.
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {filteredOc.map((g) => (
              <OcReportCard key={g.key} group={g} />
            ))}
          </div>
        )
      ) : filteredProjects.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center text-[14px] text-slate-600">
          Sin proyectos que coincidan con el filtro.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filteredProjects.map((row) => (
            <ProjectReportCard key={row.project.id} row={row} />
          ))}
        </div>
      )}
    </div>
  )
}
