import { useEffect, useMemo, useState } from 'react'

import type { MyProfile } from '../../lib/auth'
import { fetchMyProfile } from '../../lib/auth'
import { getSupabase } from '../../lib/supabaseClient'
import type { ProjectActivityRow } from '../../lib/projectActivityRepo'
import { activityAuthorDisplayLabel, fetchActivityActorLabels } from '../../lib/projectActivityActor'

import { deliveryTabTheme, type BodegaDeliveryTabId } from './bodegaDeliveryTabTheme.ts'
import {
  ACTIVITY_FILTER_OPTIONS,
  activityBadgeClass,
  activityTypeLabel,
  filterActivitiesByCategory,
  filtersWithResults,
  type ActivityHistorialFilter,
} from './projectActivityHistorialFilters.ts'

function activityPayloadComment(payload: unknown): string | null {
  if (payload == null || typeof payload !== 'object') return null
  const c = (payload as { comment?: unknown }).comment
  return typeof c === 'string' && c.trim() ? c.trim() : null
}

type Props = {
  tab: BodegaDeliveryTabId
  activities: ProjectActivityRow[]
  formatDateTime: (d: Date) => string
  variant?: 'standalone' | 'embedded'
}

function ActivityHistorialFilters(props: {
  filter: ActivityHistorialFilter
  onFilterChange: (f: ActivityHistorialFilter) => void
  availableFilters: ActivityHistorialFilter[]
  shown: number
  total: number
  tab: BodegaDeliveryTabId
}) {
  const theme = deliveryTabTheme(props.tab)
  const activeOption = ACTIVITY_FILTER_OPTIONS.find((o) => o.id === props.filter)

  return (
    <div className="border-b border-slate-100 px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Filtrar por tipo</p>
        <p className="text-[11px] font-medium text-slate-600">
          {props.shown === props.total ? (
            <>
              {props.total} registro{props.total === 1 ? '' : 's'}
            </>
          ) : (
            <>
              Mostrando <span className="font-bold text-slate-900">{props.shown}</span> de {props.total}
            </>
          )}
        </p>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Filtrar historial de actividad">
        {ACTIVITY_FILTER_OPTIONS.filter((o) => props.availableFilters.includes(o.id)).map((o) => {
          const active = props.filter === o.id
          return (
            <button
              key={o.id}
              type="button"
              title={o.description}
              aria-pressed={active}
              className={[
                'rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition outline-none focus-visible:ring-2',
                active
                  ? props.tab === 'diseno'
                    ? 'border-pink-500 bg-pink-600 text-white shadow-sm shadow-pink-300/40 focus-visible:ring-pink-400/50'
                    : 'border-section-navy/40 bg-section-navy text-white shadow-sm focus-visible:ring-blue-900/30'
                  : [
                      'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50',
                      theme.historialHover,
                    ].join(' '),
              ].join(' ')}
              onClick={() => props.onFilterChange(o.id)}
            >
              {o.label}
            </button>
          )
        })}
      </div>
      {activeOption && props.filter !== 'todos' ? (
        <p className="mt-2 text-[11px] leading-snug text-slate-500">{activeOption.description}</p>
      ) : null}
    </div>
  )
}

export function BodegaProjectActivityHistorial(props: Props) {
  const embedded = props.variant === 'embedded'
  const [open, setOpen] = useState(embedded)
  const [filter, setFilter] = useState<ActivityHistorialFilter>('todos')
  const [actorLabels, setActorLabels] = useState<Map<string, string>>(() => new Map())
  const [myUserId, setMyUserId] = useState<string | null>(null)
  const [myProfile, setMyProfile] = useState<MyProfile | null>(null)
  const theme = deliveryTabTheme(props.tab)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const sb = getSupabase()
      const { data } = await sb.auth.getUser()
      const uid = data.user?.id ?? null
      const profile = await fetchMyProfile()
      if (!cancelled) {
        setMyUserId(uid)
        setMyProfile(profile)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const actorIdsKey = useMemo(
    () =>
      [...new Set(props.activities.map((a) => a.actor_id).filter((id): id is string => Boolean(id)))].sort().join(','),
    [props.activities],
  )

  useEffect(() => {
    let cancelled = false
    const ids = actorIdsKey ? actorIdsKey.split(',') : []
    void fetchActivityActorLabels(ids).then((m) => {
      if (!cancelled) setActorLabels(m)
    })
    return () => {
      cancelled = true
    }
  }, [actorIdsKey])

  const availableFilters = useMemo(() => filtersWithResults(props.activities), [props.activities])

  const filteredActivities = useMemo(
    () => filterActivitiesByCategory(props.activities, filter),
    [props.activities, filter],
  )

  const total = props.activities.length
  const count = filteredActivities.length

  const list = (
    <div
      className={[
        embedded ? 'border-0 bg-transparent' : 'mt-4 overflow-hidden rounded-xl border bg-white',
        !embedded ? theme.historialList : '',
      ].join(' ')}
    >
      {count === 0 ? (
        <p className="px-4 py-10 text-center text-[13px] text-slate-500 sm:px-6">
          {total === 0
            ? 'Sin eventos registrados aún. Las notas y avances aparecerán aquí.'
            : 'Ningún evento coincide con este filtro. Prueba «Todos» u otra categoría.'}
        </p>
      ) : (
        <ul
          className={[
            'divide-y divide-slate-100',
            embedded
              ? 'max-h-[min(420px,50vh)] overflow-y-auto overscroll-contain px-4 py-2 sm:px-5'
              : 'max-h-[min(320px,45vh)] overflow-y-auto overscroll-contain',
          ].join(' ')}
        >
          {filteredActivities.map((a, idx) => {
            const note = activityPayloadComment(a.payload)
            const author = activityAuthorDisplayLabel(a, { profileLabels: actorLabels, myUserId, myProfile })
            const isLast = idx === count - 1
            return (
              <li
                key={a.id}
                className={[
                  'relative flex gap-3 py-3.5 sm:gap-4',
                  embedded ? '' : ['px-5 sm:px-6', theme.historialHover].join(' '),
                ].join(' ')}
              >
                {embedded ? (
                  <div className="flex w-5 shrink-0 flex-col items-center pt-1" aria-hidden>
                    <span
                      className={[
                        'h-2.5 w-2.5 rounded-full border-2',
                        isLast ? 'border-pink-500 bg-pink-500' : 'border-slate-300 bg-white',
                      ].join(' ')}
                    />
                    {!isLast ? <span className="mt-1 w-px flex-1 bg-slate-200" /> : null}
                  </div>
                ) : null}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <span className="font-mono text-[11px] font-medium text-slate-500">
                        {props.formatDateTime(new Date(a.created_at))}
                      </span>
                      <p className="mt-0.5 text-[12px] font-semibold text-slate-800">
                        Por: <span className="text-slate-900">{author}</span>
                      </p>
                    </div>
                    <span
                      className={[
                        'inline-flex w-fit shrink-0 rounded-md border px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide',
                        activityBadgeClass(a.type),
                      ].join(' ')}
                    >
                      {activityTypeLabel(a.type)}
                    </span>
                  </div>
                  {note ? (
                    <p className="mt-2 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 text-[13px] leading-relaxed text-slate-800">
                      {note}
                    </p>
                  ) : (
                    <p className="mt-1 text-[12px] italic text-slate-400">Sin comentario en el registro.</p>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )

  if (embedded) {
    return (
      <div className="flex h-full min-h-[280px] flex-col">
        <div className="border-b border-slate-100 px-4 py-3 sm:px-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Historial</p>
          <p className="mt-0.5 text-[14px] font-bold text-slate-900">Actividad del proyecto</p>
          <p className="mt-1 text-[12px] text-slate-600">
            Subidas, avances manuales y cambios de estado
          </p>
        </div>
        <ActivityHistorialFilters
          filter={filter}
          onFilterChange={setFilter}
          availableFilters={availableFilters}
          shown={count}
          total={total}
          tab={props.tab}
        />
        <div className="min-h-0 flex-1">{list}</div>
      </div>
    )
  }

  return (
    <section className={theme.section}>
      <div className="p-4 sm:p-5">
        <button
          type="button"
          aria-expanded={open}
          className={[
            'flex min-h-[52px] w-full items-center justify-between gap-3 rounded-xl border-2 px-4 py-3 text-left transition outline-none focus-visible:ring-2',
            open ? theme.historialButtonOpen : theme.historialButton,
          ].join(' ')}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="min-w-0">
            <span className="block text-[11px] font-bold uppercase tracking-[0.12em] opacity-80">
              Registro de actividad
            </span>
            <span className="mt-0.5 block text-[15px] font-bold">Historial del proyecto</span>
            <span className="mt-1 block text-[12px] font-medium opacity-85">
              Subidas, avances y cambios de estado
              {total > 0 ? ` · ${total} evento${total === 1 ? '' : 's'}` : ''}
            </span>
          </span>
          <span
            className={[
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-current/20 bg-white/50 text-[18px] font-bold leading-none',
              open ? 'rotate-180' : '',
            ].join(' ')}
            aria-hidden
          >
            ▾
          </span>
        </button>
        {open ? (
          <>
            <ActivityHistorialFilters
              filter={filter}
              onFilterChange={setFilter}
              availableFilters={availableFilters}
              shown={count}
              total={total}
              tab={props.tab}
            />
            {list}
          </>
        ) : null}
      </div>
    </section>
  )
}
