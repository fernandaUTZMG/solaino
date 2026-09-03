import { getSupabase } from './supabaseClient'

export type SolicitudStatus = 'pendiente' | 'aprobada' | 'rechazada' | 'entregada'

export type SolicitudRow = {
  id: string
  producto_id: string
  cantidad: number | string
  nota: string | null
  status: SolicitudStatus
  requested_by: string
  created_at: string
  updated_at: string
}

export async function insertSolicitud(args: {
  productoId: string
  cantidad: number
  nota?: string
}): Promise<void> {
  const sb = getSupabase()
  const { data: auth } = await sb.auth.getUser()
  const uid = auth.user?.id
  if (!uid) throw new Error('No hay sesión iniciada.')
  const row = {
    producto_id: args.productoId,
    cantidad: args.cantidad,
    nota: args.nota?.trim() ? args.nota.trim() : null,
    requested_by: uid,
  }
  const { error } = await sb.from('solicitudes').insert(row)
  if (error) throw error
}

export async function fetchSolicitudesMine(): Promise<SolicitudRow[]> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('solicitudes')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data as SolicitudRow[] | null) ?? []
}

export async function fetchSolicitudesAll(): Promise<SolicitudRow[]> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('solicitudes')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data as SolicitudRow[] | null) ?? []
}

export async function updateSolicitudStatus(id: string, status: SolicitudStatus): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb.from('solicitudes').update({ status }).eq('id', id)
  if (error) throw error
}

export async function deleteSolicitud(id: string): Promise<void> {
  const sb = getSupabase()
  const { error } = await sb.from('solicitudes').delete().eq('id', id)
  if (error) throw error
}

