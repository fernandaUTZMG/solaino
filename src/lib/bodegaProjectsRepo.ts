import { getSupabase } from './supabaseClient'
import { parsePrioridadFromRow, type ProjectPrioridadNivel } from './bodegaProjectPrioridad'

export type BodegaProjectStatus =
  | 'pendiente'
  | 'en_diseno'
  | 'revision_diseno'
  | 'modificacion_diseno'
  | 'diseno_parcial'
  | 'diseno_aprobado'
  | 'en_programacion'
  | 'revision_programacion'
  | 'terminado'

export type BodegaProjectListRow = {
  id: string
  folio: string
  orden: string | null
  orden_compra_id: string | null
  cotizacion_linea_idx: number | null
  cliente: string
  empresa: string | null
  nombre: string
  status: BodegaProjectStatus
  avance_pct: number
  fecha_inicio: string
  fecha_termino: string | null
  design_contratiempo_notes: string | null
  prioridadNivel: ProjectPrioridadNivel
  created_at: string
  updated_at: string | null
}

export function bodegaProjectStatusLabelEs(s: BodegaProjectStatus): string {
  if (s === 'pendiente') return 'Pendiente'
  if (s === 'en_diseno') return 'En diseño'
  if (s === 'revision_diseno') return 'Revisión diseño'
  if (s === 'modificacion_diseno') return 'Modificación diseño'
  if (s === 'diseno_parcial') return 'Diseño parcial'
  if (s === 'diseno_aprobado') return 'Diseño aprobado'
  if (s === 'en_programacion') return 'En programación'
  if (s === 'revision_programacion') return 'Revisión programación'
  return 'Terminado'
}

function clampPct(n: unknown): number {
  const v = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(v)) return 0
  return Math.min(100, Math.max(0, Math.round(v)))
}

function mapRow(r: Record<string, unknown>): BodegaProjectListRow {
  const rawLine = r.cotizacion_linea_idx
  const lineIdx =
    rawLine != null && String(rawLine).trim() !== '' ? Math.round(Number(rawLine)) : null
  return {
    id: String(r.id ?? ''),
    folio: String(r.folio ?? ''),
    orden: r.orden != null ? String(r.orden) : null,
    orden_compra_id: r.orden_compra_id != null ? String(r.orden_compra_id) : null,
    cotizacion_linea_idx: lineIdx != null && Number.isFinite(lineIdx) ? lineIdx : null,
    cliente: String(r.cliente ?? ''),
    empresa: r.empresa != null ? String(r.empresa) : null,
    nombre: String(r.nombre ?? ''),
    status: (String(r.status ?? 'pendiente') as BodegaProjectStatus) || 'pendiente',
    avance_pct: clampPct(r.avance_pct),
    fecha_inicio: String(r.fecha_inicio ?? r.created_at ?? ''),
    fecha_termino: r.fecha_termino != null ? String(r.fecha_termino) : null,
    design_contratiempo_notes:
      r.design_contratiempo_notes != null && String(r.design_contratiempo_notes).trim() !== ''
        ? String(r.design_contratiempo_notes).trim()
        : null,
    prioridadNivel: parsePrioridadFromRow(r),
    created_at: String(r.created_at ?? ''),
    updated_at: r.updated_at != null ? String(r.updated_at) : null,
  }
}

const SELECT_FULL = `
  id, folio, orden, orden_compra_id, cotizacion_linea_idx, cliente, empresa, nombre,
  status, avance_pct, fecha_inicio, fecha_termino, design_contratiempo_notes,
  prioridad_nivel, prioridad, created_at, updated_at
`

const SELECT_NO_LINE = `
  id, folio, orden, orden_compra_id, cliente, empresa, nombre,
  status, avance_pct, fecha_inicio, fecha_termino, design_contratiempo_notes,
  prioridad_nivel, prioridad, created_at, updated_at
`

const SELECT_BASE = `
  id, folio, orden, cliente, empresa, nombre,
  status, avance_pct, fecha_inicio, fecha_termino, design_contratiempo_notes,
  prioridad_nivel, prioridad, created_at, updated_at
`

export async function fetchAllBodegaProjectsForReportes(): Promise<BodegaProjectListRow[]> {
  const sb = getSupabase()
  const tries = [SELECT_FULL, SELECT_NO_LINE, SELECT_BASE]
  for (const sel of tries) {
    const { data, error } = await sb
      .from('bodega_projects')
      .select(sel)
      .order('created_at', { ascending: false })
    if (!error) {
      return ((data as unknown as Record<string, unknown>[]) ?? []).map(mapRow)
    }
    const msg = [error.message, error.details].filter(Boolean).join(' ')
    if (!/\bdoes not exist\b/i.test(msg) && !/column/i.test(msg)) throw error
  }
  const { data, error } = await sb
    .from('bodega_projects')
    .select('id, folio, orden, cliente, empresa, nombre, status, avance_pct, fecha_inicio, fecha_termino, created_at, updated_at')
    .order('created_at', { ascending: false })
  if (error) throw error
  return ((data as unknown as Record<string, unknown>[]) ?? []).map((r) => ({
    ...mapRow(r),
    design_contratiempo_notes: null,
    orden_compra_id: null,
    cotizacion_linea_idx: null,
  }))
}
