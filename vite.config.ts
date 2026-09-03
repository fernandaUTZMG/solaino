import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const projectDir = path.dirname(fileURLToPath(import.meta.url))
const appVersion = JSON.parse(
  fs.readFileSync(path.join(projectDir, 'package.json'), 'utf8'),
) as { version?: string }

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  /** Carpeta del proyecto (donde está este archivo), no `process.cwd()`: así .env.local se encuentra aunque arranques Vite desde otro directorio. */
  const env = loadEnv(mode, projectDir, '')
  const supabaseUrl = env.VITE_SUPABASE_URL?.replace(/\/$/, '') ?? ''
  const rawPort = Number(env.VITE_DEV_PORT || '5273')
  const devPort = Number.isFinite(rawPort) && rawPort > 0 ? rawPort : 5273

  /**
   * El cliente en dev reescribe `https://…supabase.co/functions/v1/…` → `http://localhost:PUERTO/functions/v1/…`.
   * Este proxy reenvía esa ruta al proyecto (mismo path que en Supabase). Evita CORS en OPTIONS.
   */
  const server = {
    host: '127.0.0.1',
    port: devPort,
    strictPort: false,
    ...(supabaseUrl
      ? {
          proxy: {
            '/functions/v1': {
              target: supabaseUrl,
              changeOrigin: true,
              secure: true,
              /** PDF + Edge pueden tardar mucho; el proxy por defecto corta antes. */
              timeout: 180_000,
              proxyTimeout: 180_000,
            },
          },
        }
      : {}),
  }

  return {
    base: './',
    define: {
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion.version ?? '0.0.0'),
    },
    plugins: [react()],
    css: {
      transformer: 'postcss',
    },
    server,
  }
})
