import {
  ORDEN_TIME_SEGMENTS,
  ordenSegmentMinutes,
  type ProjectOrdenTimeBreakdown,
} from '../../lib/bodegaProjectOrdenTimes'
import { formatBusinessMinutesShort } from '../../lib/bodegaProjectPhaseDurations'
import type { ProjectPrioridadNivel } from '../../lib/bodegaProjectPrioridad'
import { OrdenTimeSegmentsBar } from './BodegaOrdenTimesUi.tsx'
import { BodegaProjectPrioridadBadge } from './BodegaProjectPrioridadBadge.tsx'
import { BodegaProjectPrioridadControl } from './BodegaProjectPrioridadControl.tsx'

export type OrdenTablaFiltro = 'cerradas' | 'curso' | 'todas'

export type OrdenTablaProyecto = {
  id: string
  folio: string
  pct: number
  estadoLabel: string
  estadoTone: string
  prioridadNivel: ProjectPrioridadNivel
  times: ProjectOrdenTimeBreakdown
}

export type OrdenTablaFila = {
  key: string
  numero: string
  empresaNombre: string
  solicitante: string
  nTotal: number
  nDone: number
  avgPct: number
  times: ProjectOrdenTimeBreakdown
  cerrada: boolean
  cierreTexto: string | null
  diasPromedio: number
  tienePartidas: boolean
  proyectos: OrdenTablaProyecto[]
}

function AvanceBar(props: { pct: number }) {
  const p = Math.min(100, Math.max(0, Math.round(props.pct)))
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-slate-200"
      role="progressbar"
      aria-valuenow={p}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="h-full rounded-full bg-emerald-600" style={{ width: `${p}%` }} />
    </div>
  )
}

function ResumenCard(props: { titulo: string; valor: string; nota: string; acento: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className={['h-2.5 w-2.5 shrink-0 rounded-full', props.acento].join(' ')} aria-hidden />
        <p className="text-[12px] font-semibold text-slate-500">{props.titulo}</p>
      </div>
      <p className="mt-1.5 text-2xl font-bold tabular-nums tracking-tight text-slate-900">{props.valor}</p>
      <p className="mt-1 text-[12px] leading-snug text-slate-500">{props.nota}</p>
    </div>
  )
}

function TiempoEtapaChips(props: { times: ProjectOrdenTimeBreakdown }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {ORDEN_TIME_SEGMENTS.map((s) => {
        const mins = ordenSegmentMinutes(props.times, s.key)
        if (mins < 1) return null
        return (
          <span
            key={s.key}
            className={['inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold', s.borderClass, s.bgClass, s.textClass].join(
              ' ',
            )}
          >
            {s.label}
            <span className="tabular-nums">{formatBusinessMinutesShort(mins)}</span>
          </span>
        )
      })}
    </div>
  )
}

function ColumnChart(props: { rows: { label: string; value: number }[]; max: number; barClass: string }) {
  const maxV = Math.max(1, props.max)
  return (
    <div className="mt-3 flex h-36 items-end gap-1 overflow-x-auto border-b border-slate-200 pb-1">
      {props.rows.map((d) => {
        const pct = d.value <= 0 ? 0 : Math.max((d.value / maxV) * 100, 8)
        return (
          <div key={d.label} className="flex h-full min-w-[2.25rem] flex-1 flex-col items-center justify-end">
            <span className="mb-1 text-[11px] font-semibold tabular-nums text-slate-700">{d.value > 0 ? d.value : ''}</span>
            <div className="relative h-24 w-3 rounded-full bg-slate-100">
              <div className={['absolute bottom-0 left-0 right-0 rounded-full', props.barClass].join(' ')} style={{ height: `${pct}%` }} />
            </div>
            <p className="mt-1.5 line-clamp-2 w-full text-center text-[10px] font-medium leading-tight text-slate-500" title={d.label}>
              {d.label}
            </p>
          </div>
        )
      })}
    </div>
  )
}

export function BodegaOrdenTab(props: {
  filas: OrdenTablaFila[]
  filtro: OrdenTablaFiltro
  onFiltro: (f: OrdenTablaFiltro) => void
  conteos: { cerradas: number; curso: number }
  detalleKey: string | null
  onToggleDetalle: (key: string) => void
  resumen: {
    cerradasCount: number
    terminadosCount: number
    activosCount: number
    diasPromedioTerminados: number
  }
  tiempoTotal: ProjectOrdenTimeBreakdown
  cargandoTiempos: boolean
  hayFiltroActivo: boolean
  onOpenInfo: () => void
  onVerPartidas: (key: string) => void
  canEditPrioridad: boolean
  prioridadBusyId: string | null
  onChangePrioridad: (projectId: string, nivel: ProjectPrioridadNivel) => void
  estadisticas: {
    chartProyectosMes: { label: string; value: number }[]
    chartOcsMes: { label: string; value: number }[]
    chartProyectosAño: { label: string; value: number }[]
    maxChart: number
    maxAño: number
    semanaProyectos: number
    semanaOcs: number
    mesProyectos: number
    mesOcs: number
    añoProyectos: number
    añoOcs: number
  }
  estadisticasOpen: boolean
  onToggleEstadisticas: () => void
}) {
  const { filtro, filas, detalleKey } = props

  const tabs: Array<{ id: OrdenTablaFiltro; label: string; count: number; hint: string }> = [
    { id: 'cerradas', label: 'Cerradas', count: props.conteos.cerradas, hint: 'Todos los proyectos ya terminaron' },
    { id: 'curso', label: 'En curso', count: props.conteos.curso, hint: 'Todavía tienen proyectos abiertos' },
    { id: 'todas', label: 'Todas', count: props.conteos.cerradas + props.conteos.curso, hint: 'En curso y cerradas juntas' },
  ]

  const vacioTitulo = props.hayFiltroActivo
    ? 'Ninguna orden coincide con la búsqueda'
    : filtro === 'curso'
      ? 'No hay órdenes en curso'
      : filtro === 'cerradas'
        ? 'Aún no hay órdenes cerradas'
        : 'No hay órdenes para mostrar'

  const vacioNota = props.hayFiltroActivo
    ? 'Prueba otro texto o quita el filtro de orden.'
    : filtro === 'curso'
      ? 'Cuando una orden tenga proyectos sin terminar, aparece aquí.'
      : 'Una orden se cierra cuando todos sus proyectos quedan en Terminado.'

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-sky-100 bg-sky-50/80 px-4 py-3">
        <p className="text-[15px] font-bold text-slate-900">Seguimiento de órdenes</p>
        <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-slate-600">
          Aquí ves cada orden de compra con su avance, cuánto tiempo se trabajó y si ya se cerró. Abre una orden para
          ver sus proyectos y el tiempo de cada etapa (diseño, programación, maquinado, taller).
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ResumenCard
          titulo="Órdenes cerradas"
          valor={String(props.resumen.cerradasCount)}
          nota="Ya terminaron todos sus proyectos."
          acento="bg-emerald-600"
        />
        <ResumenCard
          titulo="Proyectos terminados"
          valor={String(props.resumen.terminadosCount)}
          nota={
            props.resumen.activosCount === 1
              ? 'Queda 1 proyecto en curso.'
              : `Quedan ${props.resumen.activosCount} proyectos en curso.`
          }
          acento="bg-slate-700"
        />
        <ResumenCard
          titulo="Tiempo trabajado"
          valor={formatBusinessMinutesShort(props.tiempoTotal.totalTrackedMin)}
          nota="Suma de los relojes, solo horario laboral."
          acento="bg-violet-600"
        />
        <ResumenCard
          titulo="Días por proyecto"
          valor={props.resumen.diasPromedioTerminados > 0 ? `${props.resumen.diasPromedioTerminados} d` : '—'}
          nota="Promedio de inicio a cierre, en días de calendario."
          acento="bg-sky-600"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex flex-wrap rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                title={t.hint}
                className={[
                  'rounded-lg px-3 py-1.5 text-[13px] font-semibold transition',
                  filtro === t.id ? 'bg-section-navy text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100',
                ].join(' ')}
                onClick={() => props.onFiltro(t.id)}
              >
                {t.label}
                <span
                  className={[
                    'ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums',
                    filtro === t.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600',
                  ].join(' ')}
                >
                  {t.count}
                </span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {props.cargandoTiempos ? (
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[12px] font-semibold text-slate-500">
                Cargando tiempos…
              </span>
            ) : null}
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[12px] font-semibold text-amber-900">
              El reloj cuenta lun–vie de 8:00 a 17:30
            </span>
            <button
              type="button"
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-slate-700 shadow-sm hover:bg-slate-100"
              onClick={props.onOpenInfo}
            >
              Cómo se miden los tiempos
            </button>
          </div>
        </div>

        {filas.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-[15px] font-semibold text-slate-800">{vacioTitulo}</p>
            <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-slate-600">{vacioNota}</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filas.map((f) => {
              const abierta = detalleKey === f.key
              return (
                <li key={f.key} className={abierta ? 'bg-sky-50/40' : 'bg-white'}>
                  <div className="flex flex-col gap-3 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={[
                            'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-bold',
                            f.cerrada
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                              : 'border-indigo-200 bg-indigo-50 text-indigo-800',
                          ].join(' ')}
                        >
                          <span className={['h-2 w-2 rounded-full', f.cerrada ? 'bg-emerald-600' : 'bg-indigo-600'].join(' ')} aria-hidden />
                          {f.cerrada ? 'Cerrada' : 'En curso'}
                        </span>
                        {f.tienePartidas ? (
                          <button
                            type="button"
                            className="font-mono text-[16px] font-bold text-blue-800 underline decoration-blue-300 underline-offset-2 hover:text-blue-950"
                            title="Ver las partidas de esta orden"
                            onClick={() => props.onVerPartidas(f.key)}
                          >
                            {f.numero}
                          </button>
                        ) : (
                          <span className="font-mono text-[16px] font-bold text-slate-900">{f.numero}</span>
                        )}
                      </div>
                      <p className="mt-1 truncate text-[14px] font-semibold text-slate-800">{f.empresaNombre}</p>
                      <p className="truncate text-[13px] text-slate-500">Solicitante: {f.solicitante || '—'}</p>
                    </div>

                    <div className="grid min-w-0 flex-1 grid-cols-2 gap-3 sm:grid-cols-4 lg:max-w-xl">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Proyectos</p>
                        <p className="mt-0.5 text-[15px] font-bold tabular-nums text-slate-900">
                          {f.nDone}/{f.nTotal}
                        </p>
                        <p className="text-[11px] text-slate-500">terminados</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Avance</p>
                        <p className="mt-0.5 text-[15px] font-bold tabular-nums text-emerald-800">{f.avgPct}%</p>
                        <AvanceBar pct={f.avgPct} />
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Tiempo</p>
                        <p className="mt-0.5 text-[15px] font-bold tabular-nums text-slate-900">
                          {formatBusinessMinutesShort(f.times.totalTrackedMin)}
                        </p>
                        {f.times.hasOpenInterval ? (
                          <p className="text-[11px] font-bold text-sky-700">Reloj abierto</p>
                        ) : (
                          <p className="text-[11px] text-slate-500">registrado</p>
                        )}
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                          {f.cerrada ? 'Cierre' : 'Estado'}
                        </p>
                        {f.cierreTexto ? (
                          <>
                            <p className="mt-0.5 text-[13px] font-semibold tabular-nums text-slate-800">{f.cierreTexto}</p>
                            {f.diasPromedio > 0 ? (
                              <p className="text-[11px] text-slate-500">{f.diasPromedio} días por proyecto</p>
                            ) : null}
                          </>
                        ) : (
                          <p className="mt-0.5 text-[13px] font-semibold text-indigo-800">Sigue abierta</p>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      className="inline-flex shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-[13px] font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
                      onClick={() => props.onToggleDetalle(f.key)}
                      aria-expanded={abierta}
                    >
                      {abierta ? 'Ocultar proyectos' : 'Ver proyectos y tiempos'}
                    </button>
                  </div>

                  {abierta ? (
                    <div className="border-t border-sky-100 bg-white px-4 py-4">
                      <p className="mb-3 text-[13px] font-semibold text-slate-700">
                        Proyectos de {f.numero}
                        <span className="ml-2 font-normal text-slate-500">
                          {f.proyectos.length === 1 ? '1 folio' : `${f.proyectos.length} folios`}
                        </span>
                      </p>
                      <ul className="space-y-3">
                        {f.proyectos.map((p) => (
                          <li key={p.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 sm:p-4">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-mono text-[14px] font-bold text-slate-900">{p.folio}</span>
                                  <BodegaProjectPrioridadBadge nivel={p.prioridadNivel} />
                                  <span className={['rounded-full border px-2 py-0.5 text-[11px] font-semibold', p.estadoTone].join(' ')}>
                                    {p.estadoLabel}
                                  </span>
                                </div>
                                <div className="mt-2 flex max-w-xs items-center gap-2">
                                  <span className="text-[12px] font-bold tabular-nums text-emerald-800">{p.pct}%</span>
                                  <AvanceBar pct={p.pct} />
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Total del folio</p>
                                <p className="text-[16px] font-bold tabular-nums text-slate-900">
                                  {formatBusinessMinutesShort(p.times.totalTrackedMin)}
                                </p>
                              </div>
                            </div>
                            <div className="mt-3">
                              {p.times.totalTrackedMin < 1 ? (
                                <p className="text-[12px] text-slate-500">Todavía no hay tiempo de reloj en este folio.</p>
                              ) : (
                                <TiempoEtapaChips times={p.times} />
                              )}
                            </div>
                            {props.canEditPrioridad ? (
                              <div className="mt-3">
                                <BodegaProjectPrioridadControl
                                  compact
                                  nivel={p.prioridadNivel}
                                  canEdit
                                  busy={props.prioridadBusyId === p.id}
                                  onChange={(nivel) => props.onChangePrioridad(p.id, nivel)}
                                />
                              </div>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                        <div className="flex flex-wrap items-end justify-between gap-2">
                          <p className="text-[13px] font-semibold text-slate-700">Total de la orden</p>
                          <p className="text-[16px] font-bold tabular-nums text-slate-900">
                            {formatBusinessMinutesShort(f.times.totalTrackedMin)}
                          </p>
                        </div>
                        <div className="mt-2">
                          <OrdenTimeSegmentsBar times={f.times} className="h-3" />
                        </div>
                        <div className="mt-2">
                          <TiempoEtapaChips times={f.times} />
                        </div>
                      </div>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50"
          onClick={props.onToggleEstadisticas}
          aria-expanded={props.estadisticasOpen}
        >
          <span>
            <span className="block text-[14px] font-bold text-slate-900">Estadísticas de cierre</span>
            <span className="block text-[12px] text-slate-500">Cuántos proyectos y órdenes se cerraron por semana, mes y año.</span>
          </span>
          <span className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[12px] font-semibold text-slate-600 shadow-sm">
            {props.estadisticasOpen ? 'Ocultar' : 'Ver'}
          </span>
        </button>

        {props.estadisticasOpen ? (
          <div className="space-y-4 border-t border-slate-200 bg-slate-50/60 p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { titulo: 'Esta semana', p: props.estadisticas.semanaProyectos, o: props.estadisticas.semanaOcs },
                { titulo: 'Este mes', p: props.estadisticas.mesProyectos, o: props.estadisticas.mesOcs },
                { titulo: 'Este año', p: props.estadisticas.añoProyectos, o: props.estadisticas.añoOcs },
              ].map((b) => (
                <div key={b.titulo} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-[12px] font-semibold text-slate-500">{b.titulo}</p>
                  <div className="mt-2 flex items-end gap-6">
                    <div>
                      <p className="text-2xl font-bold tabular-nums text-slate-900">{b.p}</p>
                      <p className="text-[12px] text-slate-500">proyectos terminados</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold tabular-nums text-emerald-700">{b.o}</p>
                      <p className="text-[12px] text-slate-500">órdenes cerradas</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-[14px] font-bold text-slate-900">Proyectos terminados por mes</h3>
                <p className="mt-0.5 text-[12px] text-slate-500">Últimos 12 meses</p>
                <ColumnChart rows={props.estadisticas.chartProyectosMes} max={props.estadisticas.maxChart} barClass="bg-sky-600" />
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-[14px] font-bold text-slate-900">Órdenes cerradas por mes</h3>
                <p className="mt-0.5 text-[12px] text-slate-500">Últimos 12 meses</p>
                <ColumnChart rows={props.estadisticas.chartOcsMes} max={props.estadisticas.maxChart} barClass="bg-emerald-600" />
              </div>
            </div>

            {props.estadisticas.chartProyectosAño.length > 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-[14px] font-bold text-slate-900">Proyectos terminados por año</h3>
                <p className="mt-0.5 text-[12px] text-slate-500">Acumulado anual</p>
                <div className="max-w-xl">
                  <ColumnChart rows={props.estadisticas.chartProyectosAño} max={props.estadisticas.maxAño} barClass="bg-violet-600" />
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
