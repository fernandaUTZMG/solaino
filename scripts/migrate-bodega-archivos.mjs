/**
 * Migración masiva de archivos locales → Supabase Storage + filas en BD.
 *
 * Uso:
 *   node scripts/migrate-bodega-archivos.mjs --manifest migracion.csv --dry-run
 *   node scripts/migrate-bodega-archivos.mjs --manifest migracion.csv
 *
 * Variables (.env.local o entorno):
 *   VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY  (Settings → API → service_role; NO commitear)
 *
 * CSV (delimitador , o ;). Encabezados (minúsculas, con o sin espacios):
 *   folio, tipo, ruta_local [, version] [, nombre_archivo]
 *
 * tipo:
 *   diseno          → project_design_versions (entrega_diseno, en_revision)
 *   info_cliente    → project_design_versions (info_cliente, aprobada)
 *   programacion    → project_machine_versions
 *
 * Ejemplo:
 *   folio,tipo,ruta_local,version
 *   P-2024-001,diseno,C:\archivos\entrega.zip,1
 *   P-2024-001,programacion,C:\archivos\prog.zip,1
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

function readText(p) {
  return fs.readFileSync(p, 'utf8')
}

function parseDotEnv(text) {
  const out = {}
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const k = line.slice(0, eq).trim()
    let v = line.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    if (k) out[k] = v
  }
  return out
}

function loadEnvFromFile(filePath) {
  try {
    const vars = parseDotEnv(readText(filePath))
    for (const [k, v] of Object.entries(vars)) {
      if (process.env[k] === undefined) process.env[k] = v
    }
  } catch {
    // ignore
  }
}

loadEnvFromFile(path.join(ROOT, '.env.local'))
loadEnvFromFile(path.join(ROOT, '.env'))

function detectDelimiter(headerLine) {
  const comma = (headerLine.match(/,/g) ?? []).length
  const semi = (headerLine.match(/;/g) ?? []).length
  return semi >= comma ? ';' : ','
}

function parseCsvLine(line, delim) {
  const out = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      const next = line[i + 1]
      if (inQuotes && next === '"') {
        cur += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
      continue
    }
    if (!inQuotes && ch === delim) {
      out.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  out.push(cur)
  return out
}

function normalizeHeaderKey(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, '_')
}

function parseManifest(filePath) {
  const raw = readText(filePath).replace(/^\uFEFF/, '')
  const lines = raw.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) throw new Error('El CSV debe tener encabezado y al menos una fila')
  const delim = detectDelimiter(lines[0])
  const headers = parseCsvLine(lines[0], delim).map(normalizeHeaderKey)
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i], delim)
    if (cells.every((c) => !String(c).trim())) continue
    const row = {}
    headers.forEach((h, idx) => {
      row[h] = (cells[idx] ?? '').trim()
    })
    rows.push(row)
  }
  return rows
}

function sanitizeFileName(name) {
  return String(name)
    .replace(/[/\\?%*:|"<>]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 180)
}

function guessContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.zip') return 'application/zip'
  if (ext === '.pdf') return 'application/pdf'
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  return 'application/octet-stream'
}

function parseArgs(argv) {
  const out = { manifest: null, dryRun: false }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry-run') out.dryRun = true
    else if (a === '--manifest' && argv[i + 1]) {
      out.manifest = argv[++i]
    } else if (a === '--help' || a === '-h') {
      console.log(readText(fileURLToPath(import.meta.url)).split('*/')[0].replace(/^\/\*\*\n?/, ''))
      process.exit(0)
    }
  }
  return out
}

async function fetchProjectByFolio(sb, folio) {
  const { data, error } = await sb.from('bodega_projects').select('id, folio, status').eq('folio', folio).maybeSingle()
  if (error) throw error
  return data
}

async function nextDesignVersion(sb, projectId, packageCategory) {
  let q = sb.from('project_design_versions').select('version').eq('project_id', projectId)
  try {
    q = q.eq('package_category', packageCategory)
  } catch {
    // ignore
  }
  const { data, error } = await q.order('version', { ascending: false }).limit(1)
  if (error) {
    const { data: d2, error: e2 } = await sb
      .from('project_design_versions')
      .select('version')
      .eq('project_id', projectId)
      .order('version', { ascending: false })
      .limit(1)
    if (e2) throw e2
    const last = d2?.[0]?.version
    return typeof last === 'number' ? last + 1 : 1
  }
  const last = data?.[0]?.version
  return typeof last === 'number' ? last + 1 : 1
}

async function nextMachineVersion(sb, projectId) {
  const { data, error } = await sb
    .from('project_machine_versions')
    .select('version')
    .eq('project_id', projectId)
    .order('version', { ascending: false })
    .limit(1)
  if (error) throw error
  const last = data?.[0]?.version
  return typeof last === 'number' ? last + 1 : 1
}

async function main() {
  const args = parseArgs(process.argv)
  if (!args.manifest) {
    console.error('Falta --manifest ruta.csv')
    process.exit(1)
  }

  const url = process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    console.error('Define VITE_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local')
    process.exit(1)
  }

  const manifestPath = path.resolve(process.cwd(), args.manifest)
  const rows = parseManifest(manifestPath)
  const sb = createClient(url, serviceKey, { auth: { persistSession: false } })

  console.log(`Filas: ${rows.length} | dry-run: ${args.dryRun}`)

  let ok = 0
  let skip = 0
  let fail = 0

  for (const row of rows) {
    const folio = row.folio || row.proyecto_folio
    const tipo = (row.tipo || row.tipo_archivo || '').toLowerCase()
    const localPath = row.ruta_local || row.path || row.archivo
    const versionHint = row.version ? Number(row.version) : null
    const displayName = row.nombre_archivo || (localPath ? path.basename(localPath) : 'archivo')

    if (!folio || !tipo || !localPath) {
      console.warn('SKIP fila incompleta:', row)
      skip++
      continue
    }

    if (!fs.existsSync(localPath)) {
      console.warn(`SKIP no existe: ${localPath}`)
      skip++
      continue
    }

    try {
      const project = await fetchProjectByFolio(sb, folio)
      if (!project) {
        console.warn(`SKIP proyecto no encontrado: ${folio}`)
        skip++
        continue
      }

      const buf = fs.readFileSync(localPath)
      const contentType = guessContentType(localPath)
      const safeName = sanitizeFileName(displayName)
      const uuid = crypto.randomUUID()

      if (tipo === 'diseno' || tipo === 'info_cliente') {
        const cat = tipo === 'info_cliente' ? 'info_cliente' : 'entrega_diseno'
        const folder = cat === 'info_cliente' ? 'info_cliente' : 'diseno'
        const v = versionHint && Number.isFinite(versionHint) ? versionHint : await nextDesignVersion(sb, project.id, cat)
        const storagePath = `${folio}/${folder}/v${v}/${uuid}-${safeName.endsWith('.zip') ? safeName : safeName + '.zip'}`

        if (args.dryRun) {
          console.log(`[dry] ${folio} ${tipo} → ${storagePath}`)
          ok++
          continue
        }

        const { error: upErr } = await sb.storage.from('bodega-proyectos').upload(storagePath, buf, {
          contentType,
          upsert: false,
        })
        if (upErr) throw upErr

        const insertRow = {
          project_id: project.id,
          version: v,
          zip_storage_path: storagePath,
          zip_filename: path.basename(localPath),
          status: cat === 'info_cliente' ? 'aprobada' : 'en_revision',
          package_category: cat,
          manifest: {},
        }
        const { error: insErr } = await sb.from('project_design_versions').insert(insertRow)
        if (insErr) throw insErr
        console.log(`OK diseño ${folio} v${v}`)
        ok++
        continue
      }

      if (tipo === 'programacion') {
        const v = versionHint && Number.isFinite(versionHint) ? versionHint : await nextMachineVersion(sb, project.id)
        const storagePath = `${folio}/programacion/v${v}/${uuid}-${safeName.endsWith('.zip') ? safeName : safeName + '.zip'}`

        if (args.dryRun) {
          console.log(`[dry] ${folio} programacion → ${storagePath}`)
          ok++
          continue
        }

        const { error: upErr } = await sb.storage.from('bodega-proyectos').upload(storagePath, buf, {
          contentType,
          upsert: false,
        })
        if (upErr) throw upErr

        const { error: insErr } = await sb.from('project_machine_versions').insert({
          project_id: project.id,
          version: v,
          zip_storage_path: storagePath,
          zip_filename: path.basename(localPath),
          status: 'en_revision',
        })
        if (insErr) throw insErr
        console.log(`OK programación ${folio} v${v}`)
        ok++
        continue
      }

      console.warn(`SKIP tipo desconocido: ${tipo}`)
      skip++
    } catch (e) {
      console.error(`FAIL ${folio}:`, e instanceof Error ? e.message : e)
      fail++
    }
  }

  console.log(`\nResumen: ok=${ok} skip=${skip} fail=${fail}`)
  if (fail > 0) process.exit(2)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
