/**
 * Invoca el worker XT para extraer piezas de ensamblajes .x_T y guarda el resultado en project_design_versions.
 *
 * Secrets (Dashboard → Edge Functions):
 * - XT_WORKER_URL  (ej. http://host.docker.internal:8090 o https://tu-vps:8090)
 * - XT_WORKER_SECRET (opcional, mismo que en el worker Python)
 *
 * Despliegue: supabase functions deploy parse-design-assembly
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { createBodegaDownloadSignedUrl } from '../_shared/bodegaSignedUrl.ts'

const cors: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, prefer, x-supabase-authorization',
  'Access-Control-Max-Age': '86400',
}

type AssemblyChildJson = {
  key: string
  label: string
  sourcePath: string | null
  assemblyPath: string
  origin: string
}

function readManifestPaths(manifest: Record<string, unknown> | null): string[] | null {
  if (!manifest) return null
  const raw = manifest.entryPaths
  if (!Array.isArray(raw)) return null
  const paths = raw.filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
  return paths.length > 0 ? paths : null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const workerUrl = (Deno.env.get('XT_WORKER_URL') ?? '').trim().replace(/\/$/, '')
  const workerSecret = (Deno.env.get('XT_WORKER_SECRET') ?? '').trim()

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return new Response(JSON.stringify({ error: 'Missing Supabase env' }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  if (!workerUrl) {
    return new Response(
      JSON.stringify({
        error: 'XT_WORKER_URL no configurado',
        hint: 'Despliega services/xt-assembly-worker y define el secret en Supabase.',
        skipped: true,
      }),
      { status: 503, headers: { ...cors, 'Content-Type': 'application/json' } },
    )
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser()
  if (userErr || !user) {
    return new Response(JSON.stringify({ error: 'No autorizado' }), {
      status: 401,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  let body: { designVersionId?: string }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'JSON inválido' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const designVersionId = body.designVersionId?.trim()
  if (!designVersionId) {
    return new Response(JSON.stringify({ error: 'designVersionId requerido' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const admin = createClient(supabaseUrl, serviceKey)

  const { data: version, error: vErr } = await admin
    .from('project_design_versions')
    .select('id, zip_storage_path, manifest, assembly_parse_status')
    .eq('id', designVersionId)
    .maybeSingle()

  if (vErr || !version) {
    return new Response(JSON.stringify({ error: 'Versión de diseño no encontrada' }), {
      status: 404,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  await admin
    .from('project_design_versions')
    .update({ assembly_parse_status: 'processing', assembly_parse_error: null })
    .eq('id', designVersionId)

  const signed = await createBodegaDownloadSignedUrl({
    supabaseAdmin: admin,
    logicalBucket: 'bodega-proyectos',
    path: version.zip_storage_path,
    expiresSec: 3600,
  })

  if (!signed?.url) {
    await admin
      .from('project_design_versions')
      .update({
        assembly_parse_status: 'failed',
        assembly_parse_error: 'No signed URL',
        assembly_parsed_at: new Date().toISOString(),
      })
      .eq('id', designVersionId)
    return new Response(JSON.stringify({ error: 'No se pudo firmar el ZIP' }), {
      status: 502,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const entryPaths = readManifestPaths(version.manifest as Record<string, unknown> | null)

  const workerHeaders: Record<string, string> = { 'Content-Type': 'application/json' }
  if (workerSecret) workerHeaders['X-Worker-Secret'] = workerSecret

  let workerJson: {
    status?: string
    assemblies?: Record<string, AssemblyChildJson[]>
    methods?: string[]
    warnings?: string[]
    childCount?: number
    detail?: string
  }

  try {
    const workerRes = await fetch(`${workerUrl}/v1/parse-zip`, {
      method: 'POST',
      headers: workerHeaders,
      body: JSON.stringify({
        zipUrl: signed.url,
        entryPaths,
      }),
    })
    workerJson = await workerRes.json()
    if (!workerRes.ok) {
      throw new Error(workerJson.detail ?? `Worker HTTP ${workerRes.status}`)
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Worker error'
    await admin
      .from('project_design_versions')
      .update({
        assembly_parse_status: 'failed',
        assembly_parse_error: msg,
        assembly_parsed_at: new Date().toISOString(),
      })
      .eq('id', designVersionId)
    return new Response(JSON.stringify({ error: msg }), {
      status: 502,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  const assemblies = workerJson.assemblies ?? {}
  const childCount = workerJson.childCount ?? Object.values(assemblies).flat().length
  const parseStatus = childCount > 0 ? (workerJson.status === 'ok' ? 'ok' : 'partial') : 'partial'
  const parseError =
    childCount === 0 && workerJson.warnings?.length
      ? workerJson.warnings.join(' ')
      : null

  const { error: upErr } = await admin
    .from('project_design_versions')
    .update({
      assembly_children: assemblies,
      assembly_parse_status: parseStatus,
      assembly_parse_error: parseError,
      assembly_parsed_at: new Date().toISOString(),
    })
    .eq('id', designVersionId)

  if (upErr) {
    return new Response(
      JSON.stringify({
        error: upErr.message,
        hint: 'Aplica la migración 20260520120000_design_version_assembly_parse.sql',
      }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } },
    )
  }

  return new Response(
    JSON.stringify({
      ok: true,
      designVersionId,
      assemblyParseStatus: parseStatus,
      childCount,
      methods: workerJson.methods ?? [],
      warnings: workerJson.warnings ?? [],
      assemblies,
    }),
    { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } },
  )
})
