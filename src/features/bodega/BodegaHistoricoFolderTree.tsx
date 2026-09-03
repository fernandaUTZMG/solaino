import type { BodegaHistoricFileRow } from '../../lib/bodegaHistoricRepo'
import type { HistoricFolderNode } from '../../lib/bodegaHistoricTree'
import { formatHistoricFileSize } from '../../lib/bodegaHistoricStorage'

function FileRow(props: {
  row: BodegaHistoricFileRow
  canDelete: boolean
  onDownload: () => void
  onDelete: () => void
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 bg-white px-2.5 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-slate-900" title={props.row.displayName}>
          {props.row.displayName}
        </p>
        <p className="text-[10px] text-slate-500">{formatHistoricFileSize(props.row.fileSize)}</p>
      </div>
      <div className="flex shrink-0 gap-1.5">
        <button
          type="button"
          className="rounded-lg bg-sky-700 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-sky-800"
          onClick={props.onDownload}
        >
          Abrir
        </button>
        {props.canDelete ? (
          <button
            type="button"
            className="rounded-lg border border-rose-200 px-2.5 py-1 text-[11px] font-semibold text-rose-800 hover:bg-rose-50"
            onClick={props.onDelete}
          >
            Eliminar
          </button>
        ) : null}
      </div>
    </li>
  )
}

function FolderNodeView(props: {
  node: HistoricFolderNode
  depth: number
  defaultOpen: boolean
  canDelete: boolean
  onDownload: (row: BodegaHistoricFileRow) => void
  onDelete: (row: BodegaHistoricFileRow) => void
}) {
  const hasChildren = props.node.folders.length > 0 || props.node.files.length > 0
  if (!hasChildren) return null

  const isRoot = props.depth === 0 && props.node.name === '(raíz)'
  const label = isRoot ? 'Archivos sueltos' : props.node.name

  return (
    <details
      className="rounded-xl border border-slate-200/90 bg-slate-50/60"
      open={props.defaultOpen || props.depth < 2}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="text-lg leading-none text-amber-600" aria-hidden>
          📁
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-slate-800">{label}</span>
        <span className="rounded-full bg-slate-200/90 px-2 py-0.5 text-[10px] font-bold tabular-nums text-slate-700">
          {props.node.fileCount}
        </span>
      </summary>
      <div className="space-y-2 border-t border-slate-200/70 px-2 py-2 sm:px-3">
        {props.node.folders.map((sub) => (
          <FolderNodeView
            key={sub.relPath || sub.name}
            node={sub}
            depth={props.depth + 1}
            defaultOpen={props.depth < 1}
            canDelete={props.canDelete}
            onDownload={props.onDownload}
            onDelete={props.onDelete}
          />
        ))}
        {props.node.files.length > 0 ? (
          <ul className="space-y-1">
            {props.node.files.map((row) => (
              <FileRow
                key={row.id}
                row={row}
                canDelete={props.canDelete}
                onDownload={() => props.onDownload(row)}
                onDelete={() => props.onDelete(row)}
              />
            ))}
          </ul>
        ) : null}
      </div>
    </details>
  )
}

export function BodegaHistoricoFolderTree(props: {
  nodes: HistoricFolderNode[]
  canDelete: boolean
  onDownload: (row: BodegaHistoricFileRow) => void
  onDelete: (row: BodegaHistoricFileRow) => void
}) {
  if (props.nodes.length === 0) return null
  return (
    <div className="space-y-2">
      {props.nodes.map((node) => (
        <FolderNodeView
          key={node.relPath || node.name}
          node={node}
          depth={0}
          defaultOpen
          canDelete={props.canDelete}
          onDownload={props.onDownload}
          onDelete={props.onDelete}
        />
      ))}
    </div>
  )
}
