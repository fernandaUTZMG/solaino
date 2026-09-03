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

function toNumber(v) {
  const s = String(v ?? '').trim()
  if (!s) return 0
  // If it uses thousands separators, remove common ones.
  const cleaned = s.replace(/[\s,]/g, '')
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : 0
}

function toStringClean(v) {
  return String(v ?? '').trim()
}

function usage() {
  console.log(
    [
      'Uso:',
      '  node scripts/import-inventario-csv.mjs --apply <csv1> <csv2> ...',
      '',
      'Flags:',
      '  --apply    Ejecuta cambios (por default es dry-run)',
      '  --limit N  Limita filas procesadas (para pruebas)',
      '',
      'Variables de entorno:',
      '  SUPABASE_URL                 (opcional si existe VITE_SUPABASE_URL)',
      '  SUPABASE_SERVICE_ROLE_KEY    (recomendado para migración; evita RLS)',
      '  VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (solo lectura; puede fallar por RLS)',
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

  if (files.length === 0) {
    usage()
    process.exit(1)
  }

  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  const repoRoot = path.resolve(__dirname, '..')
  loadEnvFromFile(path.join(repoRoot, '.env.local'))
  loadEnvFromFile(path.join(repoRoot, '.env'))

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY

  if (!url) {
    throw new Error('Falta SUPABASE_URL o VITE_SUPABASE_URL.')
  }
  const key = serviceKey || anonKey
  if (!key) {
    throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY (recomendado) o VITE_SUPABASE_ANON_KEY.')
  }

  if (!serviceKey) {
    console.warn(
      [
        'AVISO: No se detectó SUPABASE_SERVICE_ROLE_KEY.',
        'La migración podría fallar por RLS si usas la key pública (anon/publishable).',
        '',
        'Recomendado: exporta SUPABASE_SERVICE_ROLE_KEY en tu terminal antes de correr el script.',
      ].join('\n'),
    )
  }

  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  /** @type {{codigo:string, nombre:string, stock_actual:number, ubicacion_area:string, ubicacion_detalle:string, medida:string|null, codigo_producto:string|null, source:string, row:number}[]} */
  const rows = []

  for (const f of files) {
    const text = readText(f)
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
    if (lines.length === 0) continue
    const delim = detectDelimiter(lines[0])
    const header = parseCsvLine(lines[0], delim).map(normalizeHeaderKey)
    const idx = Object.fromEntries(header.map((h, i) => [h, i]))

    const hasCore = 'codigo' in idx && 'nombre' in idx && 'stock_actual' in idx
    if (!hasCore) {
      throw new Error(`Archivo ${f}: faltan columnas base. Requiere: codigo, nombre, stock_actual. Encabezado: ${header.join(', ')}`)
    }

    // Dos formatos soportados:
    // - Nuevo: ubicacion_area + ubicacion_detalle
    // - Legacy: medida + codigo_producto (sin ubicación)
    const hasUbic = 'ubicacion_area' in idx && 'ubicacion_detalle' in idx
    const hasLegacy = 'medida' in idx || 'codigo_producto' in idx
    if (!hasUbic && !hasLegacy) {
      throw new Error(
        `Archivo ${f}: no reconozco el formato. Debe traer ubicacion_area/ubicacion_detalle o medida/codigo_producto. Encabezado: ${header.join(', ')}`,
      )
    }

    const max = limit ? Math.min(lines.length - 1, limit) : lines.length - 1
    for (let i = 1; i <= max; i++) {
      const cols = parseCsvLine(lines[i], delim)
      const codigo = toStringClean(cols[idx.codigo]).toUpperCase()
      const nombre = toStringClean(cols[idx.nombre])
      if (!codigo || !nombre) continue
      const stock_actual = toNumber(cols[idx.stock_actual])

      const ubicacion_area = hasUbic ? toStringClean(cols[idx.ubicacion_area]) : 'Almacén principal'
      const ubicacion_detalle = hasUbic ? toStringClean(cols[idx.ubicacion_detalle]) : ''
      const medida = 'medida' in idx ? toStringClean(cols[idx.medida]) : ''
      const codigo_producto = 'codigo_producto' in idx ? toStringClean(cols[idx.codigo_producto]) : ''
      rows.push({
        codigo,
        nombre,
        stock_actual,
        ubicacion_area,
        ubicacion_detalle,
        medida: medida ? medida : null,
        codigo_producto: codigo_producto ? codigo_producto : null,
        source: path.basename(f),
        row: i + 1,
      })
    }
  }

  // Duplicados en el lote
  const seen = new Map()
  const dup = []
  for (const r of rows) {
    if (seen.has(r.codigo)) dup.push({ codigo: r.codigo, a: seen.get(r.codigo), b: r })
    else seen.set(r.codigo, r)
  }
  if (dup.length) {
    console.error('ERROR: códigos duplicados en los CSV. Corrige antes de importar.')
    for (const d of dup.slice(0, 20)) {
      console.error(
        `- ${d.codigo}: ${d.a.source} (fila ${d.a.row}) y ${d.b.source} (fila ${d.b.row})`,
      )
    }
    process.exit(2)
  }

  const codigos = Array.from(new Set(rows.map((r) => r.codigo)))

  /** @type {Map<string,string>} codigo -> id */
  const existing = new Map()
  const batchSize = 200
  for (let i = 0; i < codigos.length; i += batchSize) {
    const chunk = codigos.slice(i, i + batchSize)
    const { data, error } = await sb.from('productos').select('id,codigo').in('codigo', chunk)
    if (error) throw error
    for (const x of data ?? []) {
      if (x?.codigo && x?.id) existing.set(String(x.codigo).toUpperCase(), String(x.id))
    }
  }

  const nowIso = new Date().toISOString()

  const inserts = []
  const updates = []
  for (const r of rows) {
    const payload = {
      codigo: r.codigo,
      nombre: r.nombre,
      medida: r.medida ?? null,
      cantidad_por_pza: null,
      codigo_producto: r.codigo_producto ?? null,
      descripcion: null,
      categoria_id: 'cat_componentes',
      stock_actual: r.stock_actual,
      stock_minimo: 0,
      stock_maximo: null,
      unidad: 'piezas',
      ubicacion_area: r.ubicacion_area || 'Almacén principal',
      ubicacion_detalle: r.ubicacion_detalle || '',
      costo_unitario: 0,
      proveedor_id: null,
      part_number: null,
      fabricante: null,
      especificaciones: null,
      lote: null,
      fecha_caducidad: null,
      estado: 'Disponible',
      imagen_url: null,
      datasheet_url: null,
      ultima_entrada: r.stock_actual > 0 ? nowIso : null,
      ultima_salida: null,
    }

    const id = existing.get(r.codigo)
    if (id) updates.push({ id, ...payload })
    else inserts.push(payload)
  }

  console.log(`Filas leídas: ${rows.length}`)
  console.log(`Códigos únicos: ${codigos.length}`)
  console.log(`A insertar: ${inserts.length}`)
  console.log(`A actualizar: ${updates.length}`)
  console.log(`Modo: ${apply ? 'APPLY (escribe en BD)' : 'DRY-RUN (no escribe)'}`)

  if (!apply) return

  // Insertar
  for (let i = 0; i < inserts.length; i += batchSize) {
    const chunk = inserts.slice(i, i + batchSize)
    const { error } = await sb.from('productos').insert(chunk)
    if (error) throw error
    console.log(`Insertados: ${Math.min(i + chunk.length, inserts.length)}/${inserts.length}`)
  }

  // Actualizar por id (en lotes; Supabase no tiene update bulk con diferentes valores, así que hacemos upsert con id)
  for (let i = 0; i < updates.length; i += batchSize) {
    const chunk = updates.slice(i, i + batchSize)
    const { error } = await sb.from('productos').upsert(chunk, { onConflict: 'id' })
    if (error) throw error
    console.log(`Actualizados: ${Math.min(i + chunk.length, updates.length)}/${updates.length}`)
  }

  console.log('OK: migración terminada.')
}

main().catch((err) => {
  console.error(err?.message || err)
  process.exit(1)
})

