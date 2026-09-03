/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_VERSION: string
  readonly VITE_SUPABASE_URL: string | undefined
  readonly VITE_SUPABASE_ANON_KEY: string | undefined
  readonly VITE_SUPABASE_STORAGE_BUCKET: string | undefined
  readonly VITE_SUPABASE_DISABLE_FUNCTIONS_PROXY: string | undefined
  readonly VITE_USE_R2_STORAGE: string | undefined
  readonly VITE_BODEGA_SKIP_UPLOAD_SIZE_CAP: string | undefined
  readonly VITE_BODEGA_MAX_STORAGE_UPLOAD_MB: string | undefined
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

type SolainoDesktopLoginRemember = {
  load: () => Promise<{ username: string; password: string } | null>
  save: (username: string, password: string) => Promise<unknown>
  clear: () => Promise<unknown>
}

type SolainoDesktopUpdaterStatus = {
  state: 'checking' | 'available' | 'downloading' | 'downloaded' | 'idle' | 'error'
  version?: string
  currentVersion?: string
  percent?: number
  message?: string
}

type SolainoDesktopUpdater = {
  getVersion: () => Promise<string>
  check: () => Promise<boolean>
  install: () => Promise<boolean>
  onStatus: (handler: (status: SolainoDesktopUpdaterStatus) => void) => () => void
}

interface Window {
  solainoDesktop?: {
    isDesktop: boolean
    loginRemember: SolainoDesktopLoginRemember
    updater?: SolainoDesktopUpdater
  }
}
