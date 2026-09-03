import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  addWeeksToMondayKey,
  formatWeekRangeEs,
  WEEKDAY_LABELS,
  weekMondayKey,
} from '../../lib/bodegaWeekCalendar'
import {
  WEEKLY_PLAN_ACTUAL_HELP,
  WEEKLY_PLAN_STAGES,
  weeklyPlanStageLabelEs,
} from '../../lib/bodegaWeeklyPlanProgress'
import { prioridadRowHighlightClass } from '../../lib/bodegaProjectPrioridad'
import {
  currentWeekMondayKey,
  deleteWeeklyPlanItem,
  fetchWeeklyPlanBundle,
  insertWeeklyPlanItem,
  setWeeklyPlanItemDelay,
  syncWeeklyPlanFromPrioridades,
  updateWeeklyPlanItem,
  weeklyPlanStatusLabelFromProject,
  type BodegaWeeklyPlanBundle,
  type BodegaWeeklyPlanItemEnriched,
  type WeeklyPlanItemInput,
} from '../../lib/bodegaWeeklyPlanRepo'
import { BodegaProjectPrioridadBadge } from './BodegaProjectPrioridadBadge.tsx'
import { weeklyPlanSummaryText } from '../../lib/bodegaWeeklyPlanExport'
import { BodegaWeeklyPlanExportModal } from './BodegaWeeklyPlanExportModal.tsx'
import { BodegaPlanProjectorMiniBar, BodegaPlanProjectorView } from './BodegaPlanProjectorView.tsx'
import { WeeklyPlanFacturaAttach } from './WeeklyPlanFacturaAttach.tsx'
import { downloadWeeklyPlanFacturaFile } from '../../lib/bodegaWeeklyPlanFactura'
import {
  canAccessBodegaPlanTrabajoNav,
  canExportBodegaWeeklyPlan,
  canManageBodegaWeeklyPlan,
  type AppRole,
} from '../../lib/roles'

type Props = {
  role: AppRole
  onOpenProject?: (projectId: string) => void
}

type DeliveryPatch = Pick<WeeklyPlanItemInput, 'fecha_entrega' | 'factura'>

function planItemStatusLabel(it: BodegaWeeklyPlanItemEnriched): string {
  if (it.projectStatus) return weeklyPlanStatusLabelFromProject(it.projectStatus)
  return it.status_label.trim()
}

function PlanStatusBadge(props: { it: BodegaWeeklyPlanItemEnriched }) {
  const label = planItemStatusLabel(props.it)
  const entregado = /entregado/i.test(label)
  return (
    <span
      className={[
        'inline-block max-w-[9rem] rounded-md px-1.5 py-0.5 text-[11px] font-semibold leading-snug',
        entregado ? 'bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200/80' : 'bg-slate-100 text-slate-800',
      ].join(' ')}
      title={
        props.it.project_id
          ? 'Se actualiza solo según el estado del proyecto en bodega'
          : 'Fila manual sin proyecto vinculado'
      }
    >
      {label || '—'}
    </span>
  )
}

function StageCell(props: { planned: number; actual: number; lag: boolean; completed?: boolean }) {
  return (
    <div className="min-w-[4.5rem] text-center">
      <p className="font-mono text-[11px] font-bold tabular-nums text-slate-800">{props.planned}%</p>
      <p
        className={[
          'font-mono text-[11px] tabular-nums',
          props.completed || !props.lag ? 'font-semibold text-emerald-700' : 'font-bold text-rose-700',
        ].join(' ')}
      >
        {props.actual}%
      </p>
    </div>
  )
}

function IconEdit(props: { className?: string }) {
  return (
    <svg className={props.className ?? 'h-3.5 w-3.5'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

function IconFolder(props: { className?: string }) {
  return (
    <svg className={props.className ?? 'h-3.5 w-3.5'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2Z" />
    </svg>
  )
}

function IconAlert(props: { className?: string }) {
  return (
    <svg className={props.className ?? 'h-3.5 w-3.5'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
    </svg>
  )
}

function IconTrash(props: { className?: string }) {
  return (
    <svg className={props.className ?? 'h-3.5 w-3.5'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    </svg>
  )
}

function PlanRowActionBtn(props: {
  label: string
  title?: string
  onClick: () => void
  disabled?: boolean
  tone: 'amber' | 'sky' | 'slate' | 'rose'
  icon: ReactNode
}) {
  const toneCls = {
    amber: 'border-amber-300/80 bg-amber-50 text-amber-950 hover:bg-amber-100/90 focus-visible:ring-amber-400/50',
    sky: 'border-sky-300/80 bg-sky-50 text-sky-950 hover:bg-sky-100/90 focus-visible:ring-sky-400/50',
    slate: 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 focus-visible:ring-slate-400/40',
    rose: 'border-rose-200 bg-white text-rose-700 hover:bg-rose-50 focus-visible:ring-rose-400/40',
  }[props.tone]

  return (
    <button
      type="button"
      title={props.title ?? props.label}
      disabled={props.disabled}
      onClick={props.onClick}
      className={[
        'inline-flex min-h-[28px] items-center justify-center gap-1 rounded-lg border px-2 py-1',
        'text-[10px] font-semibold leading-none shadow-sm transition',
        'focus-visible:outline-none focus-visible:ring-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        toneCls,
      ].join(' ')}
    >
      {props.icon}
      <span>{props.label}</span>
    </button>
  )
}

function PlanRowActions(props: {
  behind: boolean
  canManage: boolean
  busy: boolean
  hasProject: boolean
  onDelay: () => void
  onEdit: () => void
  onOpenProject?: () => void
  onDelete: () => void
}) {
  const hasAny =
    props.behind ||
    props.canManage ||
    (props.hasProject && props.onOpenProject != null)

  if (!hasAny) {
    return <span className="text-[11px] text-slate-400">—</span>
  }

  return (
    <div className="flex min-w-[8.5rem] flex-col gap-1.5">
      <div className="flex flex-wrap gap-1">
        {props.behind ? (
          <PlanRowActionBtn
            label="Motivo"
            title="Registrar motivo de atraso"
            tone="amber"
            icon={<IconAlert />}
            onClick={props.onDelay}
          />
        ) : null}
        {props.canManage ? (
          <PlanRowActionBtn
            label="Editar"
            title="Metas, notas y entrega"
            tone="sky"
            icon={<IconEdit />}
            disabled={props.busy}
            onClick={props.onEdit}
          />
        ) : null}
        {props.hasProject && props.onOpenProject ? (
          <PlanRowActionBtn
            label="Proyecto"
            title="Abrir ficha del proyecto"
            tone="slate"
            icon={<IconFolder />}
            disabled={props.busy}
            onClick={props.onOpenProject}
          />
        ) : null}
      </div>
      {props.canManage ? (
        <PlanRowActionBtn
          label="Quitar del plan"
          title="Eliminar esta fila del plan semanal"
          tone="rose"
          icon={<IconTrash />}
          disabled={props.busy}
          onClick={props.onDelete}
        />
      ) : null}
    </div>
  )
}

function PlanEntregaFacturaCells(props: {
  it: BodegaWeeklyPlanItemEnriched
  canManage: boolean
  showFactura: boolean
  rowBusy: boolean
  onSaveDelivery: (patch: DeliveryPatch) => Promise<void>
  onReload: () => Promise<void>
  onFacturaError: (message: string) => void
}) {
  const { it, canManage, showFactura } = props
  const [fecha, setFecha] = useState(it.fecha_entrega ?? '')
  const [factura, setFactura] = useState(it.factura)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setFecha(it.fecha_entrega ?? '')
    setFactura(it.factura)
  }, [it.id, it.fecha_entrega, it.factura])

  async function saveDelivery() {
    const nextFecha = fecha.trim() || null
    const nextFactura = factura.trim()
    if (nextFecha === (it.fecha_entrega ?? null) && nextFactura === it.factura) {
      return
    }
    setSaving(true)
    try {
      await props.onSaveDelivery({
        fecha_entrega: nextFecha,
        factura: nextFactura,
      })
    } finally {
      setSaving(false)
    }
  }

  const inputCls =
    'w-full min-w-[7rem] rounded-md border border-slate-200 bg-white px-1.5 py-1 text-[11px] shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-400/40 disabled:opacity-60'

  if (!canManage) {
    return (
      <>
        <td className="px-2 py-2 text-slate-700">{it.fecha_entrega ?? '—'}</td>
        <td className="px-2 py-2">
          <PlanStatusBadge it={it} />
        </td>
        {showFactura ? (
          <td className="bg-amber-50/90 px-2 py-2 font-mono text-[11px] text-slate-800">
            <div>{it.factura || '—'}</div>
            {it.factura_archivo_path ? (
              <button
                type="button"
                className="mt-1 text-[10px] font-semibold text-sky-800 underline"
                onClick={() =>
                  void downloadWeeklyPlanFacturaFile(
                    it.factura_archivo_path!,
                    it.factura_archivo_nombre ?? 'factura',
                  ).catch((e) =>
                    props.onFacturaError(e instanceof Error ? e.message : 'No se pudo descargar'),
                  )
                }
              >
                Ver archivo
              </button>
            ) : null}
          </td>
        ) : null}
      </>
    )
  }

  return (
    <>
      <td className="px-2 py-2">
        <label className="sr-only">Fecha de entrega</label>
        <input
          type="date"
          className={inputCls}
          value={fecha}
          disabled={props.rowBusy || saving}
          onChange={(e) => setFecha(e.target.value)}
          onBlur={() => void saveDelivery()}
        />
      </td>
      <td className="px-2 py-2">
        <PlanStatusBadge it={it} />
      </td>
      {showFactura ? (
        <td className="bg-amber-50/90 px-2 py-2">
          <label className="sr-only">Factura</label>
          <input
            type="text"
            className={`${inputCls} bg-amber-50/50`}
            placeholder="No. factura"
            value={factura}
            disabled={props.rowBusy || saving}
            onChange={(e) => setFactura(e.target.value)}
            onBlur={() => void saveDelivery()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void saveDelivery()
            }}
          />
          {saving ? <p className="mt-0.5 text-[9px] text-sky-700">Guardando…</p> : null}
          <WeeklyPlanFacturaAttach
            item={it}
            canManage
            facturaNumero={factura}
            compact
            disabled={props.rowBusy || saving}
            onFacturaNumeroChange={setFactura}
            onReload={props.onReload}
            onError={props.onFacturaError}
          />
        </td>
      ) : null}
    </>
  )
}

function PlanTableRow(props: {
  it: BodegaWeeklyPlanItemEnriched
  rowIndex: number
  canManage: boolean
  busy: boolean
  onDelay: () => void
  onEdit: () => void
  onSaveDelivery: (patch: DeliveryPatch) => Promise<void>
  onReload: () => Promise<void>
  onFacturaError: (message: string) => void
  onOpenProject?: (id: string) => void
  onDelete: () => void
}) {
  const { it } = props
  const behind = it.lagStages.length > 0
  const done = it.projectTerminado
  return (
    <tr
      className={[
        'border-b border-slate-100 align-top',
        done ? 'bg-emerald-50/70 ring-1 ring-inset ring-emerald-200/60' : behind ? 'bg-rose-50/40' : 'hover:bg-slate-50/60',
        !done ? prioridadRowHighlightClass(it.prioridadNivel) : '',
      ].join(' ')}
    >
      <td className="px-2 py-2 font-mono font-bold tabular-nums text-slate-800">{props.rowIndex + 1}</td>
      <td className="px-2 py-2">
        <BodegaProjectPrioridadBadge nivel={it.prioridadNivel} />
        {done ? (
          <span className="mt-1 block rounded-md border border-emerald-400/80 bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-950">
            Finalizado
          </span>
        ) : !it.project_id ? (
          <span className="text-[10px] text-slate-500">Manual</span>
        ) : null}
      </td>
      <td className="px-2 py-2 text-slate-800">{it.cliente || '—'}</td>
      <td className="px-2 py-2 text-slate-700">{it.requisitor || '—'}</td>
      <td className="px-2 py-2 font-mono text-[11px] text-slate-800">{it.po_numero || '—'}</td>
      <td className="px-2 py-2">
        <p className="font-semibold text-slate-900">{it.proyecto_nombre}</p>
        {it.projectFolio ? <p className="font-mono text-[10px] text-slate-500">{it.projectFolio}</p> : null}
        {done ? (
          <p className="mt-1 text-[10px] font-semibold text-emerald-800">Plan semanal cumplido (proyecto entregado)</p>
        ) : null}
      </td>
      {WEEKLY_PLAN_STAGES.map((stage) => (
        <td key={stage} className="px-1 py-2">
          <StageCell
            planned={it[`plan_${stage}_pct` as const]}
            actual={it.actual[stage]}
            lag={it.lagStages.includes(stage)}
            completed={done}
          />
        </td>
      ))}
      <PlanEntregaFacturaCells
        it={it}
        canManage={props.canManage}
        showFactura={props.canManage}
        rowBusy={props.busy}
        onSaveDelivery={props.onSaveDelivery}
        onReload={props.onReload}
        onFacturaError={props.onFacturaError}
      />
      <td className="px-2 py-2 align-top">
        {behind ? (
          <div className="max-w-[10rem]">
            <span className="mb-1 inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-rose-800">
              Atraso
            </span>
            <p
              className="line-clamp-3 text-[11px] leading-snug text-rose-900"
              title={it.delay_reason.trim() || 'Sin motivo registrado'}
            >
              {it.delay_reason.trim() ? (
                it.delay_reason.trim()
              ) : (
                <span className="italic text-rose-600">Sin motivo — pulsa Motivo</span>
              )}
            </p>
          </div>
        ) : done ? (
          <span className="text-[11px] font-medium text-emerald-700">Al día</span>
        ) : (
          <span className="text-[11px] text-slate-400">—</span>
        )}
      </td>
      <td className="px-2 py-2 align-top">
        <PlanRowActions
          behind={behind}
          canManage={props.canManage}
          busy={props.busy}
          hasProject={Boolean(it.project_id)}
          onDelay={props.onDelay}
          onEdit={props.onEdit}
          onOpenProject={
            it.project_id && props.onOpenProject
              ? () => props.onOpenProject!(it.project_id!)
              : undefined
          }
          onDelete={props.onDelete}
        />
      </td>
    </tr>
  )
}

function EditItemModal(props: {
  item: BodegaWeeklyPlanItemEnriched
  canManage: boolean
  busy: boolean
  onClose: () => void
  onSave: (patch: Parameters<typeof updateWeeklyPlanItem>[1]) => Promise<void>
  onReload: () => Promise<void>
  onFacturaError: (message: string) => void
}) {
  const [form, setForm] = useState({
    cliente: props.item.cliente,
    requisitor: props.item.requisitor,
    po_numero: props.item.po_numero,
    po_fecha: props.item.po_fecha ?? '',
    proyecto_nombre: props.item.proyecto_nombre,
    plan_diseno_pct: props.item.plan_diseno_pct,
    plan_programacion_pct: props.item.plan_programacion_pct,
    plan_maquinado_pct: props.item.plan_maquinado_pct,
    plan_armado_pct: props.item.plan_armado_pct,
    fecha_entrega: props.item.fecha_entrega ?? '',
    factura: props.item.factura,
    notes_lun: props.item.notes_lun,
    notes_mar: props.item.notes_mar,
    notes_mie: props.item.notes_mie,
    notes_jue: props.item.notes_jue,
    notes_vie: props.item.notes_vie,
  })

  if (!props.canManage) return null

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/50 p-4 sm:items-center">
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
        role="dialog"
        aria-labelledby="plan-item-edit-title"
      >
        <h2 id="plan-item-edit-title" className="text-[16px] font-bold text-slate-900">
          Editar fila del plan
        </h2>
        <p className="mt-1 text-[12px] text-slate-600">{props.item.proyecto_nombre}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <p className="sm:col-span-2 rounded-lg border border-sky-100 bg-sky-50/80 px-3 py-2 text-[11px] text-sky-950">
            El orden de la fila se toma de la <strong>prioridad del proyecto</strong> en Bodega → Prioridades.
            Usa «Sincronizar con prioridades» para actualizar.
          </p>
          {(
            [
              ['plan_diseno_pct', 'diseno'],
              ['plan_programacion_pct', 'programacion'],
              ['plan_maquinado_pct', 'maquinado'],
              ['plan_armado_pct', 'armado'],
            ] as const
          ).map(([key, stage]) => (
              <label key={key} className="block text-[11px] font-semibold text-slate-700">
                Meta {weeklyPlanStageLabelEs(stage)} %
                <input
                  type="number"
                  min={0}
                  max={100}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-[13px]"
                  value={form[key]}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, [key]: Math.min(100, Math.max(0, Number(e.target.value) || 0)) }))
                  }
                />
              </label>
            ),
          )}
          <label className="block text-[11px] font-semibold text-slate-700 sm:col-span-2">
            Proyecto
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-[13px]"
              value={form.proyecto_nombre}
              onChange={(e) => setForm((f) => ({ ...f, proyecto_nombre: e.target.value }))}
            />
          </label>
          <label className="block text-[11px] font-semibold text-slate-700">
            Cliente
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-[13px]"
              value={form.cliente}
              onChange={(e) => setForm((f) => ({ ...f, cliente: e.target.value }))}
            />
          </label>
          <label className="block text-[11px] font-semibold text-slate-700">
            Requisitor
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-[13px]"
              value={form.requisitor}
              onChange={(e) => setForm((f) => ({ ...f, requisitor: e.target.value }))}
            />
          </label>
          <label className="block text-[11px] font-semibold text-slate-700">
            P.O.
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-[13px]"
              value={form.po_numero}
              onChange={(e) => setForm((f) => ({ ...f, po_numero: e.target.value }))}
            />
          </label>
          <div className="sm:col-span-2 rounded-xl border border-amber-200/90 bg-amber-50/70 p-3 ring-1 ring-amber-100">
            <p className="text-[12px] font-bold text-amber-950">Entrega y facturación</p>
            <p className="mt-0.5 text-[10px] text-amber-900/80">
              Solo supervisor / admin. Aparece en el Excel exportado (columna amarilla).
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block text-[11px] font-semibold text-slate-700">
                Fecha de entrega
                <input
                  type="date"
                  className="mt-1 w-full rounded-lg border border-amber-200/80 bg-white px-2 py-1.5 text-[13px]"
                  value={form.fecha_entrega}
                  onChange={(e) => setForm((f) => ({ ...f, fecha_entrega: e.target.value }))}
                />
              </label>
              <div className="block text-[11px] font-semibold text-slate-700">
                Status (automático)
                <p className="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-[13px] font-medium text-slate-800">
                  <PlanStatusBadge it={props.item} />
                </p>
                <p className="mt-1 text-[10px] font-normal text-slate-500">
                  Sigue el estado del proyecto en bodega (diseño, programación, entregado, etc.).
                </p>
              </div>
              <label className="block text-[11px] font-semibold text-slate-700 sm:col-span-2">
                Factura (número manual)
                <input
                  type="text"
                  className="mt-1 w-full rounded-lg border border-amber-300 bg-amber-50 px-2 py-1.5 font-mono text-[13px]"
                  placeholder="Número de factura"
                  value={form.factura}
                  onChange={(e) => setForm((f) => ({ ...f, factura: e.target.value }))}
                />
              </label>
              <div className="sm:col-span-2">
                <WeeklyPlanFacturaAttach
                  item={props.item}
                  canManage
                  facturaNumero={form.factura}
                  disabled={props.busy}
                  onFacturaNumeroChange={(v) => setForm((f) => ({ ...f, factura: v }))}
                  onReload={props.onReload}
                  onError={props.onFacturaError}
                />
              </div>
            </div>
          </div>
          {WEEKDAY_LABELS.map((day, i) => {
            const key = ['notes_lun', 'notes_mar', 'notes_mie', 'notes_jue', 'notes_vie'][i] as keyof typeof form
            return (
              <label key={day} className="block text-[11px] font-semibold text-slate-700 sm:col-span-2">
                Notas {day}
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-[13px]"
                  value={form[key] as string}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                />
              </label>
            )
          })}
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={props.busy}
            className="min-h-[40px] rounded-xl bg-sky-700 px-4 py-2 text-[13px] font-bold text-white hover:bg-sky-800 disabled:opacity-60"
            onClick={() =>
              void props.onSave({
                ...form,
                po_fecha: form.po_fecha || null,
                fecha_entrega: form.fecha_entrega || null,
                factura: form.factura.trim(),
              })
            }
          >
            {props.busy ? 'Guardando…' : 'Guardar'}
          </button>
          <button
            type="button"
            className="min-h-[40px] rounded-xl border border-slate-200 px-4 py-2 text-[13px] font-semibold text-slate-800"
            onClick={props.onClose}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

function DelayModal(props: {
  item: BodegaWeeklyPlanItemEnriched
  busy: boolean
  onClose: () => void
  onSave: (reason: string, notes: string) => Promise<void>
}) {
  const [reason, setReason] = useState(props.item.delay_reason)
  const [notes, setNotes] = useState(props.item.week_notes)
  const lagLabel = props.item.lagStages.map(weeklyPlanStageLabelEs).join(', ')

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/50 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-2xl border border-amber-200 bg-white p-5 shadow-xl" role="dialog">
        <h2 className="text-[16px] font-bold text-amber-950">Motivo de atraso</h2>
        <p className="mt-1 text-[12px] text-amber-900/90">
          {props.item.proyecto_nombre}
          {lagLabel ? ` · Etapas: ${lagLabel}` : ''}
        </p>
        <label className="mt-4 block text-[11px] font-semibold text-slate-700">
          ¿Por qué no avanzó como estaba planeado?
          <textarea
            rows={3}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-[13px]"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ej. esperando aprobación del cliente, máquina ocupada…"
          />
        </label>
        <label className="mt-3 block text-[11px] font-semibold text-slate-700">
          Notas de la semana
          <textarea
            rows={2}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-[13px]"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={props.busy || !reason.trim()}
            className="min-h-[40px] rounded-xl bg-amber-700 px-4 py-2 text-[13px] font-bold text-white hover:bg-amber-800 disabled:opacity-50"
            onClick={() => void props.onSave(reason.trim(), notes.trim())}
          >
            {props.busy ? 'Guardando…' : 'Guardar'}
          </button>
          <button
            type="button"
            className="min-h-[40px] rounded-xl border border-slate-200 px-4 py-2 text-[13px] font-semibold"
            onClick={props.onClose}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

export function BodegaPlanTrabajoPage(props: Props) {
  const canManage = canManageBodegaWeeklyPlan(props.role)
  const canExport = canExportBodegaWeeklyPlan(props.role)
  /** # + prioridad + 4 datos + 4 etapas + fecha + status + [factura] + atraso + acciones */
  const planTableColSpan = canManage ? 15 : 14
  const [weekStart, setWeekStart] = useState(() => currentWeekMondayKey())
  const [bundle, setBundle] = useState<BodegaWeeklyPlanBundle | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState('')
  const [editItem, setEditItem] = useState<BodegaWeeklyPlanItemEnriched | null>(null)
  const [delayItem, setDelayItem] = useState<BodegaWeeklyPlanItemEnriched | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [copyHint, setCopyHint] = useState<string | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [projectorActive, setProjectorActive] = useState(false)
  const [projectorExpanded, setProjectorExpanded] = useState(false)
  const [projectorRefreshing, setProjectorRefreshing] = useState(false)
  const [lastPlanRefresh, setLastPlanRefresh] = useState<Date | null>(null)
  const [tableScrollW, setTableScrollW] = useState(1180)
  const topScrollRef = useRef<HTMLDivElement>(null)
  const bottomScrollRef = useRef<HTMLDivElement>(null)
  const planTableRef = useRef<HTMLTableElement>(null)
  const scrollSyncingRef = useRef(false)

  const isCurrentWeek = weekStart === weekMondayKey(new Date())

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) {
      setError(null)
      setLoading(true)
    } else {
      setProjectorRefreshing(true)
    }
    try {
      const syncPrioridad =
        !opts?.silent && canManageBodegaWeeklyPlan(props.role) && weekStart === currentWeekMondayKey()
      setBundle(
        await fetchWeeklyPlanBundle(weekStart, {
          syncFromPrioridad: syncPrioridad,
        }),
      )
      setLastPlanRefresh(new Date())
    } catch (e) {
      if (!opts?.silent) {
        setBundle(null)
        setError(e instanceof Error ? e.message : 'No se pudo cargar el plan')
      }
    } finally {
      if (!opts?.silent) setLoading(false)
      else setProjectorRefreshing(false)
    }
  }, [weekStart, props.role])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!projectorActive) return
    const id = window.setInterval(() => {
      void load({ silent: true })
    }, 30_000)
    return () => window.clearInterval(id)
  }, [projectorActive, load])

  function stopProjector() {
    setProjectorActive(false)
    setProjectorExpanded(false)
    if (document.fullscreenElement) {
      void document.exitFullscreen?.().catch(() => {})
    }
  }

  function toggleProjector() {
    if (!projectorActive) {
      setProjectorActive(true)
      setProjectorExpanded(true)
      void load({ silent: true })
      return
    }
    if (projectorExpanded) {
      setProjectorExpanded(false)
      if (document.fullscreenElement) {
        void document.exitFullscreen?.().catch(() => {})
      }
    } else {
      setProjectorExpanded(true)
    }
  }

  const filteredItems = useMemo(() => {
    if (!bundle) return []
    const s = q.trim().toLowerCase()
    if (!s) return bundle.items
    return bundle.items.filter((it) => {
      const hay = `${it.proyecto_nombre} ${it.cliente} ${it.po_numero} ${it.projectFolio ?? ''}`.toLowerCase()
      return hay.includes(s)
    })
  }, [bundle, q])

  const filteredActive = useMemo(
    () => filteredItems.filter((it) => !it.projectTerminado),
    [filteredItems],
  )
  const filteredCompleted = useMemo(
    () => filteredItems.filter((it) => it.projectTerminado),
    [filteredItems],
  )

  useEffect(() => {
    const table = planTableRef.current
    if (!table) return

    const update = () => {
      setTableScrollW(table.scrollWidth)
    }

    update()
    const ro = new ResizeObserver(() => update())
    ro.observe(table)
    return () => ro.disconnect()
  }, [loading, filteredItems.length, filteredActive.length, filteredCompleted.length])

  function syncPlanTableScroll(from: 'top' | 'bottom') {
    if (scrollSyncingRef.current) return
    const top = topScrollRef.current
    const bottom = bottomScrollRef.current
    if (!top || !bottom) return

    scrollSyncingRef.current = true
    try {
      if (from === 'top') {
        bottom.scrollLeft = top.scrollLeft
      } else {
        top.scrollLeft = bottom.scrollLeft
      }
    } finally {
      queueMicrotask(() => {
        scrollSyncingRef.current = false
      })
    }
  }

  if (!canAccessBodegaPlanTrabajoNav(props.role)) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
        No tienes acceso al plan de trabajo de bodega.
      </div>
    )
  }

  async function onSyncPrioridades() {
    if (!bundle || !canManage) return
    setBusy(true)
    setError(null)
    try {
      const r = await syncWeeklyPlanFromPrioridades(bundle.plan.id)
      await load()
      if (r.added === 0 && r.reordered === 0) {
        setError(
          'No hay cambios: asigna prioridad en Bodega → Prioridades a los proyectos activos que quieras en el plan.',
        )
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al sincronizar')
    } finally {
      setBusy(false)
    }
  }

  async function saveItemDelivery(itemId: string, patch: DeliveryPatch) {
    setError(null)
    setBusy(true)
    try {
      await updateWeeklyPlanItem(itemId, patch)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar entrega / factura')
      throw e
    } finally {
      setBusy(false)
    }
  }

  async function onAddManualRow() {
    if (!bundle || !canManage) return
    setBusy(true)
    try {
      const maxOrder = bundle.items.reduce((m, it) => Math.max(m, it.sort_order), -1)
      await insertWeeklyPlanItem(bundle.plan.id, {
        sort_order: maxOrder + 1,
        proyecto_nombre: 'Nuevo trabajo',
      })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al agregar fila')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-5">
      <header className="rounded-2xl border border-sky-200/90 bg-gradient-to-br from-sky-50 via-white to-white px-5 py-5 shadow-sm ring-1 ring-sky-900/[0.04] sm:px-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-sky-800">Bodega</p>
        <h1 className="mt-1 text-[22px] font-bold text-slate-900 sm:text-[24px]">Plan de trabajo bodega</h1>
        <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-slate-600">
          Proyectos con <strong>prioridad</strong> en Bodega → Prioridades (activos arriba,{' '}
          <strong>finalizados abajo en verde</strong>). Metas por etapa vs avance real automático.
          {canManage ? (
            <>
              {' '}
              Como supervisor puedes capturar <strong>fecha de entrega</strong>, <strong>número de factura</strong> y{' '}
              <strong>adjuntar el archivo</strong> (PDF/XML/imagen) en la tabla.
              El <strong>status</strong> se actualiza solo según el avance del proyecto en bodega.
            </>
          ) : null}
        </p>
        <button
          type="button"
          className="mt-3 text-[12px] font-semibold text-sky-800 underline"
          onClick={() => setHelpOpen((v) => !v)}
        >
          {helpOpen ? 'Ocultar' : '¿Cómo se calcula el % real?'}
        </button>
        {helpOpen ? (
          <ul className="mt-2 max-w-3xl space-y-2 rounded-xl border border-sky-100 bg-sky-50/60 px-4 py-3 text-[12px] text-sky-950">
            {WEEKLY_PLAN_ACTUAL_HELP.map((h) => (
              <li key={h.stage}>
                <strong>{weeklyPlanStageLabelEs(h.stage)}:</strong> {h.text}
              </li>
            ))}
            <li>
              <strong>Proyecto terminado:</strong> todas las etapas muestran 100% real; no cuenta como atraso. Sirve
              para que admin vea que ya se entregó y cumplió el plan.
            </li>
          </ul>
        ) : null}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="min-h-[40px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
            onClick={() => setWeekStart((w) => addWeeksToMondayKey(w, -1))}
          >
            ← Semana anterior
          </button>
          <div className="rounded-xl border border-sky-200 bg-white px-4 py-2 text-center shadow-sm">
            <p className="text-[12px] font-bold text-sky-900">{formatWeekRangeEs(weekStart)}</p>
            {isCurrentWeek ? (
              <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-600">Semana actual</p>
            ) : (
              <button
                type="button"
                className="text-[10px] font-semibold text-sky-700 underline"
                onClick={() => setWeekStart(currentWeekMondayKey())}
              >
                Ir a semana actual
              </button>
            )}
          </div>
          <button
            type="button"
            className="min-h-[40px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
            onClick={() => setWeekStart((w) => addWeeksToMondayKey(w, 1))}
          >
            Semana siguiente →
          </button>
        </div>
      </header>

      {bundle && !loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Meta semanal</p>
            <p className="mt-1 font-mono text-[22px] font-bold tabular-nums text-slate-900">
              {bundle.weekSummary.plannedOverallPct}%
            </p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 px-4 py-3 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-800">Avance real</p>
            <p className="mt-1 font-mono text-[22px] font-bold tabular-nums text-emerald-900">
              {bundle.weekSummary.actualOverallPct}%
            </p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50/50 px-4 py-3 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-wide text-amber-900">Con atraso</p>
            <p className="mt-1 font-mono text-[22px] font-bold tabular-nums text-amber-950">
              {bundle.weekSummary.itemsBehind}
            </p>
          </div>
          <div className="rounded-xl border border-rose-200 bg-rose-50/50 px-4 py-3 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-wide text-rose-800">Sin motivo</p>
            <p className="mt-1 font-mono text-[22px] font-bold tabular-nums text-rose-900">
              {bundle.weekSummary.itemsWithoutDelayReason}
            </p>
          </div>
          <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-900">Finalizados</p>
            <p className="mt-1 font-mono text-[22px] font-bold tabular-nums text-emerald-950">
              {bundle.weekSummary.itemsCompleted}
            </p>
            <p className="text-[10px] text-emerald-800">Plan cumplido · entregados</p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          placeholder="Buscar proyecto, cliente, P.O…"
          className="min-h-[40px] flex-1 rounded-xl border border-slate-200 px-3 py-2 text-[13px] shadow-sm sm:max-w-xs"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {canManage ? (
          <>
            <button
              type="button"
              disabled={busy || loading}
              className="min-h-[40px] rounded-xl bg-sky-700 px-4 py-2 text-[13px] font-bold text-white shadow-sm hover:bg-sky-800 disabled:opacity-60"
              onClick={() => void onSyncPrioridades()}
            >
              Sincronizar con prioridades
            </button>
            <button
              type="button"
              disabled={busy || loading}
              className="min-h-[40px] rounded-xl border border-slate-200 bg-white px-4 py-2 text-[13px] font-semibold text-slate-800 shadow-sm disabled:opacity-60"
              onClick={() => void onAddManualRow()}
            >
              + Fila manual
            </button>
          </>
        ) : null}
        {bundle ? (
          <>
            {canExport ? (
              <button
                type="button"
                disabled={loading || busy}
                className="min-h-[40px] rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-[13px] font-semibold text-emerald-900 shadow-sm hover:bg-emerald-100 disabled:opacity-60"
                onClick={() => setExportOpen(true)}
              >
                Exportar Excel / PDF
              </button>
            ) : null}
            <button
              type="button"
              disabled={loading}
              className={[
                'min-h-[40px] rounded-xl px-4 py-2 text-[13px] font-bold shadow-sm disabled:opacity-60',
                projectorActive
                  ? 'border-2 border-violet-500 bg-violet-600 text-white ring-2 ring-violet-300/80'
                  : 'border border-violet-200 bg-violet-50 text-violet-950 hover:bg-violet-100',
              ].join(' ')}
              title={
                projectorActive
                  ? projectorExpanded
                    ? 'Minimizar proyector y seguir en el plan'
                    : 'Mostrar vista proyector'
                  : 'Activar vista proyector (Excel en vivo, cada 30 s)'
              }
              onClick={() => toggleProjector()}
            >
              {projectorActive
                ? projectorExpanded
                  ? '● Proyector activo'
                  : '● Proyector (minimizado)'
                : 'Vista proyector'}
            </button>
            <button
              type="button"
              disabled={loading}
              className="min-h-[40px] rounded-xl border border-slate-200 bg-white px-4 py-2 text-[13px] font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-60"
              onClick={() => {
                const text = weeklyPlanSummaryText(bundle, weekStart)
                void navigator.clipboard?.writeText(text).then(
                  () => {
                    setCopyHint('Resumen copiado al portapapeles')
                    window.setTimeout(() => setCopyHint(null), 2500)
                  },
                  () => setError('No se pudo copiar el resumen al portapapeles'),
                )
              }}
              title="Copia un resumen de la semana para correo o WhatsApp"
            >
              Copiar resumen
            </button>
          </>
        ) : null}
        <button
          type="button"
          disabled={loading}
          className="min-h-[40px] rounded-xl border border-slate-200 px-3 py-2 text-[13px] font-semibold text-slate-700"
          onClick={() => void load()}
        >
          Actualizar
        </button>
      </div>

      {copyHint ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-900">
          {copyHint}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-900">{error}</div>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-slate-200 border-t-sky-700" aria-hidden />
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm ring-1 ring-slate-900/[0.03]">
          <div
            ref={topScrollRef}
            onScroll={() => syncPlanTableScroll('top')}
            className="h-5 w-full overflow-x-scroll overflow-y-hidden border-b border-slate-200/80 bg-slate-50/80 [-webkit-overflow-scrolling:touch]"
            aria-hidden
          >
            <div style={{ width: Math.max(tableScrollW, 1), height: 1 }} />
          </div>
          <div
            ref={bottomScrollRef}
            onScroll={() => syncPlanTableScroll('bottom')}
            className="w-full overflow-x-auto [-webkit-overflow-scrolling:touch]"
          >
          <table
            ref={planTableRef}
            className={`w-full border-collapse text-left text-[12px] ${canManage ? 'min-w-[1180px]' : 'min-w-[1080px]'}`}
          >
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/95">
                <th className="px-2 py-2.5 font-bold text-slate-700">#</th>
                <th className="px-2 py-2.5 font-bold text-slate-700">Prioridad</th>
                <th className="px-2 py-2.5 font-bold text-slate-700">Cliente</th>
                <th className="px-2 py-2.5 font-bold text-slate-700">Requisitor</th>
                <th className="px-2 py-2.5 font-bold text-slate-700">P.O.</th>
                <th className="min-w-[10rem] px-2 py-2.5 font-bold text-slate-700">Proyecto</th>
                {WEEKLY_PLAN_STAGES.map((s) => (
                  <th key={s} className="px-1 py-2.5 text-center font-bold text-slate-700">
                    {weeklyPlanStageLabelEs(s)}
                    <span className="mt-0.5 block text-[9px] font-medium text-slate-500">meta / real</span>
                  </th>
                ))}
                <th className="min-w-[9rem] px-2 py-2.5 font-bold text-slate-700">Fecha entrega</th>
                <th className="min-w-[7rem] px-2 py-2.5 font-bold text-slate-700">Status</th>
                {canManage ? (
                  <th className="min-w-[7rem] bg-amber-50/90 px-2 py-2.5 font-bold text-amber-950">Factura</th>
                ) : null}
                <th className="min-w-[8rem] px-2 py-2.5 font-bold text-slate-700">Atraso</th>
                <th className="min-w-[9rem] px-2 py-2.5 text-left font-bold text-slate-700">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={planTableColSpan} className="px-4 py-10 text-center text-slate-500">
                    {canManage
                      ? 'Sin filas. Asigna prioridad en Bodega → Prioridades y pulsa «Sincronizar con prioridades».'
                      : 'Sin filas en esta semana.'}
                  </td>
                </tr>
              ) : (
                <>
                  {filteredActive.map((it, i) => (
                    <PlanTableRow
                      key={it.id}
                      it={it}
                      rowIndex={i}
                      canManage={canManage}
                      busy={busy}
                      onDelay={() => setDelayItem(it)}
                      onEdit={() => setEditItem(it)}
                      onSaveDelivery={(patch) => saveItemDelivery(it.id, patch)}
                      onReload={load}
                      onFacturaError={setError}
                      onOpenProject={props.onOpenProject}
                      onDelete={() => {
                        if (!confirm('¿Quitar esta fila del plan?')) return
                        setBusy(true)
                        void deleteWeeklyPlanItem(it.id)
                          .then(() => load())
                          .finally(() => setBusy(false))
                      }}
                    />
                  ))}
                  {filteredCompleted.length > 0 && filteredActive.length > 0 ? (
                    <tr className="bg-slate-100/90">
                      <td colSpan={planTableColSpan} className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-600">
                        Proyectos finalizados (plan cumplido)
                      </td>
                    </tr>
                  ) : null}
                  {filteredCompleted.map((it, i) => (
                    <PlanTableRow
                      key={it.id}
                      it={it}
                      rowIndex={filteredActive.length + i}
                      canManage={canManage}
                      busy={busy}
                      onDelay={() => setDelayItem(it)}
                      onEdit={() => setEditItem(it)}
                      onSaveDelivery={(patch) => saveItemDelivery(it.id, patch)}
                      onReload={load}
                      onFacturaError={setError}
                      onOpenProject={props.onOpenProject}
                      onDelete={() => {
                        if (!confirm('¿Quitar esta fila del plan?')) return
                        setBusy(true)
                        void deleteWeeklyPlanItem(it.id)
                          .then(() => load())
                          .finally(() => setBusy(false))
                      }}
                    />
                  ))}
                </>
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {editItem ? (
        <EditItemModal
          item={editItem}
          canManage={canManage}
          busy={busy}
          onClose={() => setEditItem(null)}
          onSave={async (patch) => {
            setBusy(true)
            try {
              await updateWeeklyPlanItem(editItem.id, patch)
              setEditItem(null)
              await load()
            } finally {
              setBusy(false)
            }
          }}
          onReload={load}
          onFacturaError={setError}
        />
      ) : null}

      {delayItem ? (
        <DelayModal
          item={delayItem}
          busy={busy}
          onClose={() => setDelayItem(null)}
          onSave={async (reason, notes) => {
            setBusy(true)
            try {
              await setWeeklyPlanItemDelay(delayItem.id, reason, notes)
              setDelayItem(null)
              await load()
            } finally {
              setBusy(false)
            }
          }}
        />
      ) : null}

      {exportOpen && canExport ? (
        <BodegaWeeklyPlanExportModal
          role={props.role}
          anchorWeekStart={weekStart}
          onClose={() => setExportOpen(false)}
          onError={setError}
        />
      ) : null}

      {projectorActive && bundle && projectorExpanded ? (
        <BodegaPlanProjectorView
          weekStart={weekStart}
          items={bundle.items}
          lastUpdated={lastPlanRefresh}
          refreshing={projectorRefreshing}
          onMinimize={() => {
            setProjectorExpanded(false)
            if (document.fullscreenElement) {
              void document.exitFullscreen?.().catch(() => {})
            }
          }}
          onClose={stopProjector}
        />
      ) : null}

      {projectorActive && bundle && !projectorExpanded ? (
        <BodegaPlanProjectorMiniBar
          lastUpdated={lastPlanRefresh}
          refreshing={projectorRefreshing}
          onExpand={() => setProjectorExpanded(true)}
          onClose={stopProjector}
        />
      ) : null}
    </section>
  )
}
