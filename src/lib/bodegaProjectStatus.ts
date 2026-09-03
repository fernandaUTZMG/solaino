import { getSupabase } from './supabaseClient'
import { insertProjectActivity } from './projectActivityRepo'

export async function supervisorSetProjectStatus(args: {
  projectId: string
  status: string
  comment?: string | null
  designVersionId?: string | null
}): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb.rpc('bodega_set_project_status', {
    p_project_id: args.projectId,
    p_status: args.status,
    p_comment: args.comment ?? null,
    p_design_version_id: args.designVersionId ?? null,
  })
  if (error) {
    console.error('[bodega_set_project_status]', error)
    throw new Error(rpcErrorMessage(error))
  }
}

export async function programadoraSolicitaCierreRevision(projectId: string): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb.rpc('bodega_programadora_solicita_cierre', { p_project_id: projectId })
  if (error) {
    console.error('[bodega_programadora_solicita_cierre]', error)
    throw new Error(rpcErrorMessage(error))
  }
}

/** Nota visible en historial sin cambiar avance ni estado. */
export async function saveProjectNote(projectId: string, comment: string): Promise<void> {
  const text = comment.trim()
  if (!text) throw new Error('Escribe una nota antes de guardar.')
  await insertProjectActivity({
    projectId,
    type: 'project_note',
    payload: { comment: text },
  })
}

export async function setProjectAvanceManual(args: {
  projectId: string
  avancePct: number
  comment?: string | null
}): Promise<void> {
  const sb = getSupabase()
  const pct = Math.trunc(Math.round(Number(args.avancePct)))
  const { error } = await sb.rpc('bodega_set_avance_manual', {
    p_project_id: args.projectId,
    p_avance_pct: pct,
    p_comment: args.comment ?? null,
  })
  if (error) {
    console.error('[bodega_set_avance_manual]', error)
    let msg = rpcErrorMessage(error)
    if (/PGRST202|schema cache|could not find.*function/i.test(msg)) {
      msg +=
        ' En Supabase → SQL Editor ejecuta supabase/patch_bodega_avance_manual_rpc.sql. Luego: NOTIFY pgrst, \'reload schema\'; o Ajustes del proyecto → API → «Reload schema».'
    }
    throw new Error(msg)
  }
}

/** Texto útil de errores PostgREST / Postgres (a veces `details` trae el SQLERRM y `message` es genérico). */
function rpcErrorMessage(err: unknown): string {
  if (err == null) return 'Error desconocido (null).'
  if (typeof err === 'string') return err
  if (typeof err !== 'object') return String(err)
  const e = err as Record<string, unknown>
  const message = e.message != null ? String(e.message).trim() : ''
  const details = e.details != null ? String(e.details).trim() : ''
  const hint = e.hint != null && String(e.hint) !== 'null' ? String(e.hint).trim() : ''
  const code = e.code != null ? String(e.code).trim() : ''
  const parts = [details || message, details && message && message !== details ? message : '', hint]
    .map((s) => (typeof s === 'string' ? s.trim() : ''))
    .filter(Boolean)
  const base = parts.length ? [...new Set(parts)].join(' — ') : JSON.stringify(err)
  return code ? `${base} [${code}]` : base
}

export async function bulkCreateProjectsFromOcPdf(ordenCompraId: string): Promise<{ created: number; skipped: number; lines: number }> {
  const id = String(ordenCompraId ?? '').trim()
  if (!id) throw new Error('Falta el identificador de la orden de compra.')

  const sb = getSupabase()
  const { data, error } = await sb.rpc('bodega_bulk_create_projects_from_oc', { p_orden_compra_id: id })
  if (error) {
    // Ayuda a depurar en consola (F12) cuando solo se ve "400" en la pestaña Red.
    console.error('[bodega_bulk_create_projects_from_oc]', error)
    const msg = rpcErrorMessage(error)
    const extra =
      /solo administrador|administrador o encargado|rol de bodega|is_bodega/i.test(msg)
        ? ' Si ya actualizaste el SQL, en Supabase: Project Settings → API → «Reload schema» (o ejecuta NOTIFY pgrst, \'reload schema\';).'
        : /PGRST202|schema cache|could not find.*function/i.test(msg)
          ? ' En Supabase: Project Settings → API → «Reload schema», o ejecuta en SQL Editor: NOTIFY pgrst, \'reload schema\';'
          : /42703|column.*does not exist|undefined column/i.test(msg)
            ? ' Falta migración: ejecuta supabase/_archive/reference/schema_bodega_machine_evidence.sql (p. ej. columna cotizacion_linea_idx).'
            : /23514|check constraint|violates check constraint/i.test(msg)
              ? ' Conflicto de status en bodega_projects: ejecuta supabase/_archive/reference/schema_bodega_versions.sql.'
              : ''
    throw new Error(msg + extra)
  }
  let o: Record<string, unknown> = {}
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    o = data as Record<string, unknown>
  } else if (typeof data === 'string') {
    try {
      o = JSON.parse(data) as Record<string, unknown>
    } catch {
      o = {}
    }
  }
  return {
    created: typeof o.created === 'number' ? o.created : Number(o.created) || 0,
    skipped: typeof o.skipped === 'number' ? o.skipped : Number(o.skipped) || 0,
    lines: typeof o.lines === 'number' ? o.lines : Number(o.lines) || 0,
  }
}

