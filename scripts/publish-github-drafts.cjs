/**
 * Publica releases en borrador (Draft) en GitHub.
 * Uso:
 *   $env:GH_TOKEN="ghp_..."
 *   npm run github:publish-drafts
 */
const fs = require('fs')
const path = require('path')

const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN
if (!token) {
  console.error('Falta GH_TOKEN. Ejemplo: $env:GH_TOKEN="ghp_..."')
  process.exit(1)
}

const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'github-publish.json'), 'utf8'))
const owner = String(cfg.owner || '').trim()
const repo = String(cfg.repo || '').trim()

function formatGhError(data, status) {
  const parts = [data?.message || `HTTP ${status}`]
  if (Array.isArray(data?.errors) && data.errors.length) {
    for (const e of data.errors) {
      parts.push(`  - ${e.resource ?? 'error'}: ${e.code ?? ''} ${e.field ?? ''} ${e.message ?? JSON.stringify(e)}`.trim())
    }
  }
  return parts.join('\n')
}

async function gh(pathname, options = {}) {
  const res = await fetch(`https://api.github.com${pathname}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'SOLAINO-publish-script',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers || {}),
    },
  })
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { message: text }
  }
  if (!res.ok) {
    const err = new Error(formatGhError(data, res.status))
    err.status = res.status
    err.data = data
    throw err
  }
  return data
}

function semverKey(tag = '') {
  const m = String(tag).replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)/)
  if (!m) return 0
  return Number(m[1]) * 1_000_000 + Number(m[2]) * 1_000 + Number(m[3])
}

async function publishDraft(draft, makeLatest) {
  const body = {
    draft: false,
    name: draft.name || draft.tag_name || 'Release',
  }
  if (draft.body != null) body.body = draft.body
  if (makeLatest) body.make_latest = true

  return gh(`/repos/${owner}/${repo}/releases/${draft.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function main() {
  const releases = await gh(`/repos/${owner}/${repo}/releases?per_page=20`)
  const drafts = releases.filter((r) => r.draft).sort((a, b) => semverKey(b.tag_name) - semverKey(a.tag_name))

  if (drafts.length === 0) {
    console.log('No hay releases en borrador.')
    const published = releases.filter((r) => !r.draft)
    if (published.length) {
      console.log('Publicados:')
      for (const r of published) {
        console.log(`  - ${r.tag_name} ${r.name || ''}`)
      }
    }
    return
  }

  console.log(`Encontrados ${drafts.length} borrador(es).`)

  for (let i = 0; i < drafts.length; i++) {
    const draft = drafts[i]
    const makeLatest = i === 0
    console.log(`\nPublicando ${draft.tag_name} (id ${draft.id})${makeLatest ? ' como Latest' : ''}…`)

    try {
      await publishDraft(draft, makeLatest)
      console.log(`✓ ${draft.tag_name} publicado`)
      continue
    } catch (err) {
      console.warn(`Aviso: falló con make_latest=${makeLatest}`)
      console.warn(formatGhError(err.data, err.status))
    }

    try {
      await publishDraft(draft, false)
      console.log(`✓ ${draft.tag_name} publicado (sin Latest)`)
    } catch (err) {
      console.error(`No se pudo publicar ${draft.tag_name}:`)
      console.error(formatGhError(err.data, err.status))
      const emptyRepo = JSON.stringify(err.data || '').includes('Repository is empty')
      if (emptyRepo) {
        console.error('\nEl repo de GitHub está VACÍO (sin commits). Ejecuta primero:')
        console.error('  npm run github:init-repo')
        console.error('Luego vuelve a ejecutar:')
        console.error('  npm run github:publish-drafts')
      } else {
        console.error('\nPrueba en GitHub:')
        console.error(`1. Borra el borrador ${draft.tag_name} (Discard draft)`)
        console.error('2. Vuelve a ejecutar npm run github:publish-drafts')
      }
      process.exit(1)
    }
  }

  console.log('\nListo. Verifica:')
  console.log(`https://github.com/${owner}/${repo}/releases`)
}

main().catch((err) => {
  console.error('Error:', err.message)
  process.exit(1)
})
