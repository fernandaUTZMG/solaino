import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { isSupabaseConfigured } from '../env'

const FUNCTIONS_V1 = '/functions/v1/'

/**
 * En desarrollo, reescribe las URLs que apuntan a `…/functions/v1/*` hacia el mismo origen
 * (`http://localhost:PUERTO/functions/v1/*`). Vite proxifica esa ruta a `VITE_SUPABASE_URL`,
 * evitando CORS en el preflight OPTIONS.
 */
function createFunctionsDevProxyFetch(): typeof fetch {
  const root = globalThis.fetch.bind(globalThis)
  return (input: RequestInfo | URL, init?: RequestInit) => {
    const href =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url
    const at = href.indexOf(FUNCTIONS_V1)
    if (at !== -1) {
      const tail = href.slice(at + FUNCTIONS_V1.length)
      const proxied = `${window.location.origin}${FUNCTIONS_V1}${tail}`
      if (input instanceof Request) {
        return root(new Request(proxied, input))
      }
      return root(proxied, init)
    }
    return root(input as RequestInfo, init)
  }
}

let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase no está configurado (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')
  }
  const url = import.meta.env.VITE_SUPABASE_URL as string
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string
  if (!client) {
    const disableFnProxy = import.meta.env.VITE_SUPABASE_DISABLE_FUNCTIONS_PROXY === '1'
    const useDevFunctionsProxy =
      import.meta.env.DEV &&
      !disableFnProxy &&
      typeof window !== 'undefined' &&
      Boolean(window.location?.origin)
    client = createClient(
      url,
      key,
      useDevFunctionsProxy ? { global: { fetch: createFunctionsDevProxyFetch() } } : undefined,
    )
  }
  return client
}
