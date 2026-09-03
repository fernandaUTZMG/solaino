/**
 * Ejecuta electron-builder con owner/repo de scripts/github-publish.json
 * (necesario para que el .exe sepa dónde buscar actualizaciones en GitHub).
 */
const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const cfgPath = path.join(__dirname, 'github-publish.json')
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
const owner = String(cfg.owner || '').trim()
const repo = String(cfg.repo || '').trim()

const args = ['electron-builder', ...process.argv.slice(2)]

if (owner && repo && !owner.includes('TU_USUARIO')) {
  args.push(
    '-c.publish.provider=github',
    `-c.publish.owner=${owner}`,
    `-c.publish.repo=${repo}`,
    '-c.publish.releaseType=release',
  )
} else {
  console.warn(
    'Aviso: edita scripts/github-publish.json — sin owner/repo el .exe no podrá buscar actualizaciones en GitHub.',
  )
}

const r = spawnSync('npx', args, { cwd: root, stdio: 'inherit', shell: true, env: process.env })
process.exit(r.status ?? 1)
