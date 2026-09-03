import { getSupabase } from './supabaseClient'
import type { AssemblyChildCandidate } from './designAssemblyDiscovery'
import { buildXtAssemblyGroups } from './bodegaXtAssemblies'

export type AssemblyParseStatus = 'pending' | 'processing' | 'ok' | 'partial' | 'failed' | 'skipped'

export const ASSEMBLY_PARSE_MIGRATION_HINT =
  'Ejecuta supabase/patch_design_version_assembly_parse.sql en Supabase.'

export type DesignVersionAssemblyMeta = {
  assembly_children: Record<string, AssemblyChildCandidate[]> | null
  assembly_parse_status: AssemblyParseStatus | null
  assembly_parse_error: string | null
  assembly_parsed_at: string | null
}

function normalizeChild(raw: Record<string, unknown>, assemblyPath: string): AssemblyChildCandidate | null {
  const label = typeof raw.label === 'string' ? raw.label.trim() : ''
  if (!label) return null
  const sourcePath = typeof raw.sourcePath === 'string' ? raw.sourcePath : null
  const key =
    typeof raw.key === 'string'
      ? raw.key
      : sourcePath ?? `${assemblyPath}::${encodeURIComponent(label)}`
  const rawOrigin = typeof raw.origin === 'string' ? raw.origin : 'internal'
  const allowed: AssemblyChildCandidate['origin'][] = [
    'zip_xt',
    'internal',
    'html',
    'bom_xml',
    'xt_text',
    'step',
  ]
  const origin = allowed.includes(rawOrigin as AssemblyChildCandidate['origin'])
    ? (rawOrigin as AssemblyChildCandidate['origin'])
    : 'internal'
  return {
    key,
    label,
    sourcePath,
    assemblyPath: typeof raw.assemblyPath === 'string' ? raw.assemblyPath : assemblyPath,
    origin,
  }
}

/** Convierte JSON guardado por el worker a Map por ensamblaje. */
export function assemblyChildrenFromVersionJson(
  json: Record<string, unknown> | null | undefined,
): Map<string, AssemblyChildCandidate[]> {
  const map = new Map<string, AssemblyChildCandidate[]>()
  if (!json || typeof json !== 'object') return map
  for (const [asmPath, rawList] of Object.entries(json)) {
    if (!Array.isArray(rawList)) continue
    const children: AssemblyChildCandidate[] = []
    for (const item of rawList) {
      if (!item || typeof item !== 'object') continue
      const c = normalizeChild(item as Record<string, unknown>, asmPath)
      if (c) children.push(c)
    }
    if (children.length > 0) map.set(asmPath, children)
  }
  return map
}

/** Une resultado del worker con detección en el navegador (más piezas gana). */
export function mergeAssemblyChildrenMaps(
  a: Map<string, AssemblyChildCandidate[]>,
  b: Map<string, AssemblyChildCandidate[]>,
): Map<string, AssemblyChildCandidate[]> {
  const out = new Map<string, AssemblyChildCandidate[]>()
  const allKeys = new Set([...a.keys(), ...b.keys()])
  for (const asm of allKeys) {
    const byKey = new Map<string, AssemblyChildCandidate>()
    for (const c of [...(a.get(asm) ?? []), ...(b.get(asm) ?? [])]) {
      byKey.set(c.key, c)
    }
    if (byKey.size > 0) out.set(asm, [...byKey.values()].sort((x, y) => x.label.localeCompare(y.label, 'es')))
  }
  return out
}

export type ParseDesignAssemblyResult = {
  ok: boolean
  skipped?: boolean
  childCount?: number
  methods?: string[]
  warnings?: string[]
  assemblies?: Record<string, AssemblyChildCandidate[]>
  error?: string
  hint?: string
}

/**
 * Llama a la Edge Function que ejecuta el worker Python.
 * Requiere XT_WORKER_URL desplegado en Supabase.
 */
export async function requestDesignAssemblyParse(designVersionId: string): Promise<ParseDesignAssemblyResult> {
  const sb = getSupabase()
  const { data, error } = await sb.functions.invoke('parse-design-assembly', {
    body: { designVersionId },
  })

  if (error) {
    const ctx = (error as { context?: Response }).context
    if (ctx) {
      try {
        const body = (await ctx.json()) as ParseDesignAssemblyResult & { error?: string }
        if (body.skipped) return { ok: false, skipped: true, error: body.error, hint: body.hint }
        return { ok: false, error: body.error ?? error.message }
      } catch {
        /* fall through */
      }
    }
    return { ok: false, error: error.message }
  }

  const res = data as ParseDesignAssemblyResult
  return { ...res, ok: Boolean(res.ok) }
}

export function assemblyChildrenMapFromParseResult(
  assemblies: Record<string, AssemblyChildCandidate[]> | undefined,
): Map<string, AssemblyChildCandidate[]> {
  return assemblyChildrenFromVersionJson(assemblies ?? null)
}

/** Asegura entradas vacías por cada ensamblaje del ZIP (para UI). */
export function ensureAssemblyKeys(
  map: Map<string, AssemblyChildCandidate[]>,
  designZipPaths: string[],
): Map<string, AssemblyChildCandidate[]> {
  const out = new Map(map)
  for (const g of buildXtAssemblyGroups(designZipPaths)) {
    if (!out.has(g.assemblyPath)) out.set(g.assemblyPath, [])
  }
  return out
}
