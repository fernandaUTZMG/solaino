import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

function readText(p) {
  return fs.readFileSync(p, 'utf8')
}

function parseDotEnv(text) {
  /** @type {Record<string,string>} */
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
    const txt = readText(filePath)
    const vars = parseDotEnv(txt)
    for (const [k, v] of Object.entries(vars)) {
      if (process.env[k] === undefined) process.env[k] = v
    }
  } catch {
    // ignore
  }
}

function detectDelimiter(headerLine) {
  const comma = (headerLine.match(/,/g) ?? []).length
  const semi = (headerLine.match(/;/g) ?? []).length
  if (semi === 0 && comma === 0) return ','
  return semi >= comma ? ';' : ','
}

function parseCsvLine(line, delim) {
  /** @type {string[]} */
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
    .replace(/\s+/g, '_')
}

function toStringClean(v) {
  return String(v ?? '').trim()
}

function usage() {
  console.log(
    [
      'Uso:',
      '  node scripts/delete-productos-from-csv.mjs [--apply] <archivo.csv>',
      '',
      'Requisitos:',
      '  - El CSV debe incluir una columna "codigo"',
      '  - Recomendado: SUPABASE_SERVICE_ROLE_KEY en el entorno (PowerShell: $env:SUPABASE_SERVICE_ROLE_KEY=...)',
      '',
      'Flags:',
      '  --apply    Ejecuta borrado (por default es dry-run)',
      '  --limit N  Limita filas leídas del CSV (para pruebas)',
    ].join('\n'),
  )
}

async function main() {
  const argv = process.argv.slice(2)
  const apply = argv.includes('--apply')
  const limitIdx = argv.indexOf('--limit')
  const limit = limitIdx !== -1 ? Number(argv[limitIdx + 1]) : undefined
  const skip = new Set(['--apply', '--limit'])
  if (limitIdx !== -1 && limitIdx + 1 < argv.length) skip.add(argv[limitIdx + 1])
  const files = argv.filter((a) => !skip.has(a))

  if (files.length !== 1) {
    usage()
    process.exit(1)
  }

  const csvPath = files[0]

  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  const repoRoot = path.resolve(__dirname, '..')
  loadEnvFromFile(path.join(repoRoot, '.env.local'))
  loadEnvFromFile(path.join(repoRoot, '.env'))

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY

  if (!url) throw new Error('Falta SUPABASE_URL o VITE_SUPABASE_URL.')
  const key = serviceKey || anonKey
  if (!key) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY (recomendado) o VITE_SUPABASE_ANON_KEY.')

  if (!serviceKey) {
    console.warn(
      [
        'AVISO: No se detectó SUPABASE_SERVICE_ROLE_KEY.',
        'El borrado puede fallar por RLS si usas la key pública.',
      ].join('\n'),
    )
  }

  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  const text = readText(csvPath)
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length === 0) throw new Error('CSV vacío.')

  const delim = detectDelimiter(lines[0])
  const header = parseCsvLine(lines[0], delim).map(normalizeHeaderKey)
  const idx = Object.fromEntries(header.map((h, i) => [h, i]))
  if (!('codigo' in idx)) {
    throw new Error(`Falta columna "codigo". Encabezado: ${header.join(', ')}`)
  }

  const max = limit ? Math.min(lines.length - 1, limit) : lines.length - 1
  /** @type {string[]} */
  const codigos = []
  for (let i = 1; i <= max; i++) {
    const cols = parseCsvLine(lines[i], delim)
    const c = toStringClean(cols[idx.codigo]).toUpperCase()
    if (c) codigos.push(c)
  }

  const uniq = Array.from(new Set(codigos))
  console.log(`CSV: ${path.basename(csvPath)}`)
  console.log(`Códigos en CSV (filas): ${codigos.length}`)
  console.log(`Códigos únicos: ${uniq.length}`)

  /** @type {Map<string,string>} */
  const idByCodigo = new Map()
  const batchSize = 200
  for (let i = 0; i < uniq.length; i += batchSize) {
    const chunk = uniq.slice(i, i + batchSize)
    const { data, error } = await sb.from('productos').select('id,codigo').in('codigo', chunk)
    if (error) throw error
    for (const x of data ?? []) {
      if (x?.codigo && x?.id) idByCodigo.set(String(x.codigo).toUpperCase(), String(x.id))
    }
  }

  const missing = uniq.filter((c) => !idByCodigo.has(c))
  const ids = uniq.map((c) => idByCodigo.get(c)).filter(Boolean)

  console.log(`Encontrados en BD: ${ids.length}`)
  console.log(`No encontrados en BD: ${missing.length}`)
  if (missing.length) {
    console.log('Primeros no encontrados:')
    for (const m of missing.slice(0, 30)) console.log(`- ${m}`)
  }

  console.log(`Modo: ${apply ? 'APPLY (borra)' : 'DRY-RUN (no borra)'}`)
  if (!apply) return

  // 1) solicitudes (si existen)
  for (let i = 0; i < ids.length; i += batchSize) {
    const chunk = ids.slice(i, i + batchSize)
    const { error } = await sb.from('solicitudes').delete().in('producto_id', chunk)
    if (error) {
      // Si la tabla no existe en algún proyecto, no bloqueamos el borrado completo.
      const msg = error.message || ''
      if (msg.toLowerCase().includes('relation') && msg.toLowerCase().includes('does not exist')) continue
      if (msg.toLowerCase().includes('could not find the table')) continue
      throw new Error(`No se pudo borrar solicitudes: ${error.message}`)
    }
  }

  // 2) movimientos
  for (let i = 0; i < ids.length; i += batchSize) {
    const chunk = ids.slice(i, i + batchSize)
    const { error } = await sb.from('movimientos').delete().in('producto_id', chunk)
    if (error) throw new Error(`No se pudo borrar movimientos: ${error.message}`)
  }

  // 3) productos
  for (let i = 0; i < ids.length; i += batchSize) {
    const chunk = ids.slice(i, i + batchSize)
    const { error } = await sb.from('productos').delete().in('id', chunk)
    if (error) throw new Error(`No se pudo borrar productos: ${error.message}`)
  }

  console.log('OK: borrado terminado.')
}

main().catch((err) => {
  console.error(err?.message || err)
  process.exit(1)
})
