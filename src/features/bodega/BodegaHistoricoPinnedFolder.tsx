import type { BodegaHistoricFileRow } from '../../lib/bodegaHistoricRepo'
import { formatHistoricFileSize } from '../../lib/bodegaHistoricStorage'
import { relativePathWithinHistoricoArea } from '../../lib/bodegaHistoricPath'
import type { BodegaHistoricoArea } from '../../lib/bodegaHistoricTypes'

type Props = {
  title: string
  subtitle: string
  accent: 'programacion' | 'sky'
  area: BodegaHistoricoArea
  files: BodegaHistoricFileRow[]
  searchQuery: string
  onSearchChange: (q: string) => void
  searchPlaceholder: string
  canDelete: boolean
  onDownload: (row: BodegaHistoricFileRow) => void
  onDelete: (row: BodegaHistoricFileRow) => void
}

const ACCENT = {
  programacion: {
    border: 'border-programacion-200',
    header: 'bg-gradient-to-r from-programacion-50 to-white',
    badge: 'bg-programacion-100 text-programacion-950',
    icon: 'text-programacion-700',
    ring: 'focus:ring-programacion-300/40',
  },
  sky: {
    border: 'border-sky-200',
    header: 'bg-gradient-to-r from-sky-50 to-white',
    badge: 'bg-sky-100 text-sky-950',
    icon: 'text-sky-700',
    ring: 'focus:ring-sky-300/40',
  },
} as const

function folderHint(area: BodegaHistoricoArea, row: BodegaHistoricFileRow): string | null {
  const rel = relativePathWithinHistoricoArea(area, row.storagePath)
  if (!rel) return null
  const parts = rel.split('/').filter(Boolean)
  if (parts.length <= 1) return null
  return parts.slice(0, -1).join(' / ')
}

export function BodegaHistoricoPinnedFolder(props: Props) {
  const tone = ACCENT[props.accent]

  return (
    <section className={`overflow-hidden rounded-2xl border shadow-sm ${tone.border}`}>
      <div className={`border-b px-4 py-3 sm:px-5 ${tone.header}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className={`mt-0.5 text-2xl leading-none ${tone.icon}`} aria-hidden>
              📁
            </span>
            <div>
              <h3 className="text-[15px] font-bold text-slate-900">{props.title}</h3>
              <p className="mt-0.5 text-[12px] leading-snug text-slate-600">{props.subtitle}</p>
            </div>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold tabular-nums ${tone.badge}`}>
            {props.files.length} archivo{props.files.length === 1 ? '' : 's'}
          </span>
        </div>
        <label className="mt-3 block">
          <span className="sr-only">Buscar en {props.title}</span>
          <input
            type="search"
            value={props.searchQuery}
            onChange={(e) => props.onSearchChange(e.target.value)}
            placeholder={props.searchPlaceholder}
            className={`mt-0 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] shadow-sm outline-none focus:ring-2 ${tone.ring}`}
          />
        </label>
      </div>

      {props.files.length === 0 ? (
        <p className="px-4 py-8 text-center text-[13px] text-slate-500 sm:px-5">
          {props.searchQuery.trim()
            ? 'Ningún archivo coincide con la búsqueda en esta carpeta.'
            : 'Sin archivos de este tipo en el histórico aún.'}
        </p>
      ) : (
        <ul className="max-h-[min(50vh,28rem)] divide-y divide-slate-100 overflow-y-auto">
          {props.files.map((row) => {
            const hint = folderHint(props.area, row)
            return (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 hover:bg-slate-50/80 sm:px-5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-slate-900" title={row.displayName}>
                    {row.displayName}
                  </p>
                  {hint ? (
                    <p className="truncate font-mono text-[10px] text-slate-500" title={hint}>
                      {hint}
                    </p>
                  ) : null}
                  <p className="text-[10px] text-slate-400">{formatHistoricFileSize(row.fileSize)}</p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    className="rounded-lg bg-sky-700 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-sky-800"
                    onClick={() => props.onDownload(row)}
                  >
                    Abrir
                  </button>
                  {props.canDelete ? (
                    <button
                      type="button"
                      className="rounded-lg border border-rose-200 px-2.5 py-1 text-[11px] font-semibold text-rose-800 hover:bg-rose-50"
                      onClick={() => props.onDelete(row)}
                    >
                      Eliminar
                    </button>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
