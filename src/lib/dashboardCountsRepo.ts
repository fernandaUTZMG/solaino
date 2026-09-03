import { getSupabase } from './supabaseClient'

async function safeCount(table: string): Promise<number | null> {
  const sb = getSupabase()
  const { count, error } = await sb.from(table).select('*', { count: 'exact', head: true })
  if (error) return null
  return typeof count === 'number' ? count : null
}

export type AdminDashboardCounts = {
  users: number | null
  empresas: number | null
  requisitores: number | null
  cotizaciones: number | null
}

export async function fetchAdminDashboardCounts(): Promise<AdminDashboardCounts> {
  const users = await safeCount('profiles')
  const requisitores = await safeCount('requisitores')
  const empresas = await safeCount('empresas')
  // Estas tablas todavía no existen en el proyecto; evitamos llamadas 404.
  // Cuando se creen, habilitamos sus conteos.
  return { users, empresas, requisitores, cotizaciones: null }
}

