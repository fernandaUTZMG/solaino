import { useMemo } from 'react'

/** Páginas visibles con elipsis (estilo estándar). */
function pageItems(current: number, total: number): (number | 'gap')[] {
  if (total <= 1) return [1]
  if (total <= 9) return Array.from({ length: total }, (_, i) => i + 1)

  const delta = 1
  const range: number[] = []
  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || (i >= current - delta && i <= current + delta)) range.push(i)
  }

  const out: (number | 'gap')[] = []
  let prev: number | null = null
  for (const i of range) {
    if (prev != null) {
      if (i - prev === 2) out.push(prev + 1)
      else if (i - prev > 2) out.push('gap')
    }
    out.push(i)
    prev = i
  }
  return out
}

const btnBase =
  'inline-flex h-8 min-w-[2rem] items-center justify-center rounded-lg border text-[12px] font-semibold transition disabled:pointer-events-none disabled:opacity-40'

export function PaginationBar(props: {
  page: number
  totalPages: number
  totalItems: number
  pageSize: number
  onPageChange: (page: number) => void
  className?: string
}) {
  const totalPages = Math.max(1, props.totalPages)
  const safePage = Math.min(Math.max(1, props.page), totalPages)
  const start = props.totalItems === 0 ? 0 : (safePage - 1) * props.pageSize + 1
  const end = Math.min(safePage * props.pageSize, props.totalItems)

  const items = useMemo(() => pageItems(safePage, totalPages), [safePage, totalPages])

  return (
    <div
      className={[
        'flex flex-col gap-3 border-t border-slate-200/90 bg-slate-50/80 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4',
        props.className ?? '',
      ].join(' ')}
    >
      <p className="text-center text-[12px] leading-snug text-slate-600 sm:text-left">
        <span className="tabular-nums text-slate-900">{start}</span>
        <span className="text-slate-400">–</span>
        <span className="tabular-nums text-slate-900">{end}</span>
        <span className="text-slate-500"> de </span>
        <span className="font-semibold tabular-nums text-slate-900">{props.totalItems}</span>
        <span className="hidden text-slate-400 sm:inline"> · </span>
        <span className="block text-[11px] text-slate-500 sm:inline sm:text-[12px]">
          Página {safePage} de {totalPages}
        </span>
      </p>

      <nav className="flex flex-wrap items-center justify-center gap-1 sm:justify-end" aria-label="Paginación">
        <button
          type="button"
          className={`${btnBase} border-transparent px-2 text-slate-600 hover:bg-white hover:text-slate-900`}
          disabled={safePage <= 1}
          onClick={() => props.onPageChange(1)}
          title="Primera página"
        >
          ««
        </button>
        <button
          type="button"
          className={`${btnBase} border-slate-200 bg-white px-2.5 text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50`}
          disabled={safePage <= 1}
          onClick={() => props.onPageChange(safePage - 1)}
        >
          Anterior
        </button>

        <div className="mx-0.5 hidden items-center gap-0.5 sm:flex">
          {items.map((x, i) =>
            x === 'gap' ? (
              <span key={`g-${i}`} className="px-1 text-[12px] font-medium text-slate-400">
                …
              </span>
            ) : (
              <button
                key={x}
                type="button"
                className={[
                  btnBase,
                  'min-w-[2.25rem] border-transparent px-2',
                  x === safePage
                    ? 'bg-blue-900 text-white shadow-sm hover:bg-blue-800'
                    : 'text-slate-600 hover:bg-white hover:text-slate-900',
                ].join(' ')}
                onClick={() => props.onPageChange(x)}
              >
                {x}
              </button>
            ),
          )}
        </div>

        <span className="px-1 text-[12px] font-semibold tabular-nums text-slate-500 sm:hidden">
          {safePage}/{totalPages}
        </span>

        <button
          type="button"
          className={`${btnBase} border-slate-200 bg-white px-2.5 text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50`}
          disabled={safePage >= totalPages}
          onClick={() => props.onPageChange(safePage + 1)}
        >
          Siguiente
        </button>
        <button
          type="button"
          className={`${btnBase} border-transparent px-2 text-slate-600 hover:bg-white hover:text-slate-900`}
          disabled={safePage >= totalPages}
          onClick={() => props.onPageChange(totalPages)}
          title="Última página"
        >
          »»
        </button>
      </nav>
    </div>
  )
}
