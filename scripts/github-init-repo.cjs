/**
 * Crea el primer commit en GitHub (repo vacío → releases no se pueden publicar).
 * Uso:
 *   $env:GH_TOKEN="ghp_..."
 *   npm run github:init-repo
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

async function gh(pathname, options = {}) {
  const res = await fetch(`https://api.github.com${pathname}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'SOLAINO-init-repo',
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
  return { ok: res.ok, status: res.status, data }
}

async function main() {
  const info = await gh(`/repos/${owner}/${repo}`)
  if (!info.ok) {
    console.error('No se pudo leer el repo:', info.data?.message || info.status)
    process.exit(1)
  }

  if (info.data.size > 0) {
    console.log(`El repo ya tiene contenido (size=${info.data.size}). No hace falta inicializar.`)
    return
  }

  console.log('Repo vacío. Creando README.md en main…')

  const content = Buffer.from(
    '# SOLAINO\n\nRepositorio de releases del inventario SOLAINO (Windows).\n\nLos instaladores se publican en [Releases](../../releases).\n',
    'utf8',
  ).toString('base64')

  const put = await gh(`/repos/${owner}/${repo}/contents/README.md`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'Initial commit — habilitar GitHub Releases',
      content,
      branch: 'main',
    }),
  })

  if (!put.ok) {
    console.error('Error al crear README:', put.data?.message || put.status)
    if (Array.isArray(put.data?.errors)) {
      for (const e of put.data.errors) console.error(' ', e.message || e)
    }
    process.exit(1)
  }

  console.log('✓ Repo inicializado con README.md en main')
  console.log('\nSiguiente paso:')
  console.log('  npm run github:publish-drafts')
}

main().catch((err) => {
  console.error('Error:', err.message)
  process.exit(1)
})
