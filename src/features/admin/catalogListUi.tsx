import type { ReactNode } from 'react'
import { formatFechaHoraLocal } from '../../lib/formatDateTime'

export type CatalogRow = { id: string; nombre: string; created_at: string }

function IconBriefcase(props: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
      aria-hidden
    >
      <path d="M10 2h4a2 2 0 0 1 2 2v2H8V4a2 2 0 0 1 2-2Z" />
      <path d="M3 7h18v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
      <path d="M3 12h18" />
    </svg>
  )
}

function IconUser(props: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
      aria-hidden
    >
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

function IconUsersGroup(props: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
      aria-hidden
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

export function CatalogPageHero(props: {
  accent: 'amber' | 'rose' | 'sky'
  title: string
  subtitle: string
  toolbar: ReactNode
}) {
  const { accent, title, subtitle, toolbar } = props
  const glow =
    accent === 'amber'
      ? 'bg-amber-400/15 from-amber-500/20 to-transparent'
      : accent === 'rose'
        ? 'bg-rose-400/15 from-rose-500/20 to-transparent'
        : 'bg-sky-400/15 from-sky-500/20 to-transparent'
  const iconBg =
    accent === 'amber'
      ? 'from-amber-400 to-amber-600 shadow-amber-900/25'
      : accent === 'rose'
        ? 'from-rose-400 to-rose-600 shadow-rose-900/25'
        : 'from-sky-500 to-blue-600 shadow-blue-900/25'
  const borderTint =
    accent === 'amber' ? 'border-amber-200/40' : accent === 'rose' ? 'border-rose-200/40' : 'border-sky-200/40'
  const bgHero =
    accent === 'amber'
      ? 'bg-gradient-to-br from-white via-slate-50/90 to-amber-50/25'
      : accent === 'rose'
        ? 'bg-gradient-to-br from-white via-slate-50/90 to-rose-50/25'
        : 'bg-gradient-to-br from-white via-slate-50/90 to-sky-50/30'

  return (
    <div className={['relative overflow-hidden border-b px-5 py-5 sm:px-6', borderTint, bgHero].join(' ')}>
      <div className={`pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full bg-gradient-to-br ${glow} blur-2xl`} />
      <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 gap-4">
          <div
            className={[
              'flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg ring-2 ring-white/25',
              iconBg,
            ].join(' ')}
          >
            {accent === 'amber' ? (
              <IconBriefcase className="h-7 w-7 opacity-95" />
            ) : accent === 'rose' ? (
              <IconUser className="h-7 w-7 opacity-95" />
            ) : (
              <IconUsersGroup className="h-7 w-7 opacity-95" />
            )}
          </div>
          <div className="min-w-0 pt-0.5">
            <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{title}</h1>
            <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-slate-600">{subtitle}</p>
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">{toolbar}</div>
      </div>
    </div>
  )
}

export function IconPlus(props: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
      aria-hidden
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export function IconSearch(props: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.2-3.2" />
    </svg>
  )
}

export function CatalogAddButton(props: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="group relative inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-gradient-to-br from-[#0f2744] via-section-navy to-[#0a1628] px-5 py-2.5 text-[13px] font-semibold tracking-tight text-white shadow-[0_6px_20px_-4px_rgba(15,39,68,0.55),inset_0_1px_0_rgba(255,255,255,0.12)] ring-1 ring-white/15 transition hover:shadow-[0_8px_28px_-4px_rgba(15,39,68,0.6)] hover:brightness-105 active:translate-y-px sm:w-auto"
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20 transition group-hover:bg-white/15">
        <IconPlus className="h-4 w-4" />
      </span>
      {props.label}
    </button>
  )
}

export function IconPencil(props: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
      aria-hidden
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5Z" />
    </svg>
  )
}

export function IconTrash(props: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
      aria-hidden
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  )
}

export function CatalogSearchField(props: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div className="relative w-full sm:w-[min(100%,20rem)]">
      <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        type="search"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder ?? 'Buscar en el catálogo…'}
        className="w-full rounded-2xl border border-slate-200/90 bg-slate-50/80 py-2.5 pl-10 pr-3 text-[13px] text-slate-900 shadow-inner shadow-slate-200/40 outline-none ring-0 transition placeholder:text-slate-400 focus:border-blue-900/35 focus:bg-white focus:shadow-[0_0_0_3px_rgba(15,39,68,0.08)]"
      />
    </div>
  )
}

export type CatalogAdminRowActions = {
  onEdit: (row: CatalogRow) => void
  onDelete: (row: CatalogRow) => void
  /** Mientras se elimina: id de la fila (deshabilita botones de esa fila). */
  pendingDeleteId: string | null
}

const catalogEditBtnClass =
  'inline-flex h-9 w-9 items-center justify-center rounded-xl border border-sky-200 bg-sky-50 text-sky-600 shadow-sm transition hover:border-sky-400 hover:bg-sky-100 hover:text-sky-800 disabled:pointer-events-none disabled:opacity-40'

const catalogDeleteBtnClass =
  'inline-flex h-9 w-9 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-rose-600 shadow-sm transition hover:border-rose-400 hover:bg-rose-100 hover:text-rose-800 disabled:pointer-events-none disabled:opacity-40'

const catalogHistoryBtnClass =
  'inline-flex h-9 w-9 items-center justify-center rounded-xl border border-violet-200 bg-violet-50 text-violet-600 shadow-sm transition hover:border-violet-400 hover:bg-violet-100 hover:text-violet-800 disabled:pointer-events-none disabled:opacity-40'

export { catalogEditBtnClass, catalogDeleteBtnClass, catalogHistoryBtnClass }

export function CatalogDataTable(props: {
  rows: CatalogRow[]
  loading: boolean
  emptyMessage: string
  accent: 'amber' | 'rose'
  adminRowActions?: CatalogAdminRowActions | null
}) {
  const { rows, loading, emptyMessage, accent, adminRowActions } = props
  const line =
    accent === 'amber'
      ? 'from-amber-500/90 via-amber-400/50 to-transparent'
      : 'from-rose-500/90 via-rose-400/50 to-transparent'

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        <div
          className={[
            'h-9 w-9 animate-spin rounded-full border-2 border-slate-200 border-t-transparent',
            accent === 'amber' ? 'border-t-amber-600' : 'border-t-rose-600',
          ].join(' ')}
          aria-hidden
        />
        <p className="text-[13px] font-medium text-slate-500">Cargando registros…</p>
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-14 text-center">
        <p className="text-[14px] font-medium text-slate-600">{emptyMessage}</p>
        <p className="mt-1 text-[12px] text-slate-400">Usa el botón de arriba para dar de alta el primero.</p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
      <div className={`h-1 bg-gradient-to-r ${line}`} aria-hidden />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[580px] border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-200/90 bg-gradient-to-b from-slate-100/95 to-slate-50/90">
              <th className="px-4 py-3.5 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 sm:px-5">
                Nombre
              </th>
              <th className="hidden px-4 py-3.5 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 sm:table-cell sm:px-5 md:w-[200px]">
                Identificador
              </th>
              <th className="px-4 py-3.5 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 sm:px-5 md:w-[180px]">
                Alta
              </th>
              {adminRowActions ? (
                <th className="w-[1%] whitespace-nowrap px-3 py-3.5 text-right text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 sm:px-4">
                  Acciones
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r, i) => (
              <tr
                key={r.id}
                className={[
                  'group transition-colors hover:bg-slate-50/95',
                  i % 2 === 1 ? 'bg-slate-50/35' : 'bg-white',
                ].join(' ')}
              >
                <td className="px-4 py-3.5 sm:px-5">
                  <div className="flex items-start gap-3">
                    <span
                      className={[
                        'mt-0.5 hidden h-8 w-1 shrink-0 rounded-full sm:block',
                        accent === 'amber' ? 'bg-amber-400/90' : 'bg-rose-400/90',
                      ].join(' ')}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-semibold leading-snug tracking-tight text-slate-900 group-hover:text-slate-950">
                        {r.nombre}
                      </div>
                      <div className="mt-0.5 font-mono text-[10px] font-semibold text-slate-700 sm:hidden">
                        {r.id.slice(0, 8)}…
                      </div>
                    </div>
                  </div>
                </td>
                <td className="hidden px-4 py-3.5 sm:table-cell sm:px-5">
                  <span className="inline-block rounded-lg bg-slate-100 px-2 py-1 font-mono text-[11px] font-bold tracking-tight text-slate-900 ring-1 ring-slate-200/80">
                    {r.id.slice(0, 8)}…
                  </span>
                </td>
                <td className="px-4 py-3.5 text-[13px] font-bold tabular-nums text-slate-900 sm:px-5">
                  {formatFechaHoraLocal(r.created_at)}
                </td>
                {adminRowActions ? (
                  <td className="whitespace-nowrap px-2 py-2 text-right sm:px-3">
                    <div className="inline-flex items-center justify-end gap-1">
                      <button
                        type="button"
                        title="Editar"
                        disabled={adminRowActions.pendingDeleteId != null}
                        onClick={() => adminRowActions.onEdit(r)}
                        className={catalogEditBtnClass}
                      >
                        <IconPencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        title="Eliminar"
                        disabled={adminRowActions.pendingDeleteId != null}
                        onClick={() => adminRowActions.onDelete(r)}
                        className={catalogDeleteBtnClass}
                      >
                        {adminRowActions.pendingDeleteId === r.id ? (
                          <span
                            className={[
                              'inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-transparent',
                              accent === 'amber' ? 'border-t-amber-600' : 'border-t-rose-600',
                            ].join(' ')}
                            aria-hidden
                          />
                        ) : (
                          <IconTrash className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-2.5 text-center text-[11px] font-medium uppercase tracking-wide text-slate-400 sm:text-left sm:px-5">
        {rows.length} {rows.length === 1 ? 'registro' : 'registros'}
      </div>
    </div>
  )
}
