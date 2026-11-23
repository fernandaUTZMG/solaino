import { getSupabase } from './supabaseClient'

import { createSignedUrlForBodegaStorage, BODEGA_PROYECTOS_BUCKET } from './bodegaObjectStorage'
import { invokeBodegaR2Storage } from './bodegaR2Storage'

import {

  bodegaPiecePhotosSupportsPieceId,

  isPostgrestMissingColumnError,

  piecePhotosMissingPieceIdMessage,

} from './bodegaPiecesSchema'



export type ProjectPiecePhotoRow = {

  id: string

  project_id: string

  piece_id: string | null

  storage_path: string

  filename: string

  uploaded_by: string | null

  created_at: string

}



const LEGACY_SELECT = 'id, project_id, storage_path, filename, uploaded_by, created_at'

const FULL_SELECT = `${LEGACY_SELECT}, piece_id`



async function fetchPiecePhotosLegacy(projectId: string): Promise<ProjectPiecePhotoRow[]> {

  const sb = getSupabase()

  const { data, error } = await sb

    .from('project_piece_photos')

    .select(LEGACY_SELECT)

    .eq('project_id', projectId)

    .order('created_at', { ascending: false })

  if (error) throw error

  return (

    (data as Omit<ProjectPiecePhotoRow, 'piece_id'>[] | null)?.map((r) => ({

      ...r,

      piece_id: null,

    })) ?? []

  )

}



export async function fetchPiecePhotos(projectId: string): Promise<ProjectPiecePhotoRow[]> {

  const hasPieceId = await bodegaPiecePhotosSupportsPieceId()

  if (!hasPieceId) return fetchPiecePhotosLegacy(projectId)



  const sb = getSupabase()

  const { data, error } = await sb

    .from('project_piece_photos')

    .select(FULL_SELECT)

    .eq('project_id', projectId)

    .order('created_at', { ascending: false })

  if (error) {

    if (isPostgrestMissingColumnError(error, 'piece_id')) {

      return fetchPiecePhotosLegacy(projectId)

    }

    throw error

  }

  return (data as ProjectPiecePhotoRow[] | null) ?? []

}



export async function updatePiecePhotoPaths(args: {

  id: string

  storagePath: string

  filename: string

}): Promise<void> {

  const sb = getSupabase()

  const { error } = await sb

    .from('project_piece_photos')

    .update({ storage_path: args.storagePath, filename: args.filename })

    .eq('id', args.id)

  if (error) throw error

}



/** Foto del armado completo del proyecto. No pertenece a una sola pieza. */
export async function insertProjectArmadoPhoto(payload: {
  projectId: string
  storagePath: string
  filename: string
}): Promise<void> {
  const sb = getSupabase()
  const row: Record<string, unknown> = {
    project_id: payload.projectId,
    storage_path: payload.storagePath,
    filename: payload.filename,
    uploaded_by: (await sb.auth.getUser()).data.user?.id ?? null,
    piece_id: null,
  }
  const { error } = await sb.from('project_piece_photos').insert(row)
  if (error) throw error
}

async function removeStoredProjectPhoto(storagePath: string): Promise<void> {
  const path = storagePath.trim()
  if (!path) return
  try {
    await invokeBodegaR2Storage({ action: 'delete', bucket: 'bodega-proyectos', path })
    return
  } catch {
    const sb = getSupabase()
    await sb.storage.from(BODEGA_PROYECTOS_BUCKET).remove([path])
  }
}

/** Quita la foto del armado del proyecto. No borra fotos de una pieza. */
export async function deleteProjectArmadoPhoto(photo: Pick<ProjectPiecePhotoRow, 'id' | 'storage_path'>): Promise<void> {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('project_piece_photos')
    .delete()
    .eq('id', photo.id)
    .is('piece_id', null)
    .select('id')
  if (error) throw new Error(error.message || 'No se quitó la foto')
  if (!data?.length) throw new Error('No se pudo quitar la foto. Solo el encargado, el admin o quien la subió pueden quitarla.')
  await removeStoredProjectPhoto(photo.storage_path).catch(() => undefined)
}

/** Deja la foto nueva en el mismo registro y borra el archivo anterior. */
export async function replaceProjectArmadoPhotoRecord(args: {
  id: string
  storagePath: string
  filename: string
  previousPath: string
}): Promise<void> {
  await updatePiecePhotoPaths({ id: args.id, storagePath: args.storagePath, filename: args.filename })
  if (args.previousPath && args.previousPath !== args.storagePath) {
    await removeStoredProjectPhoto(args.previousPath).catch(() => undefined)
  }
}

export async function insertPiecePhoto(payload: {

  projectId: string

  pieceId: string

  storagePath: string

  filename: string

}): Promise<void> {

  const hasPieceId = await bodegaPiecePhotosSupportsPieceId()

  if (!hasPieceId) {

    throw new Error(piecePhotosMissingPieceIdMessage())

  }



  const sb = getSupabase()

  const row: Record<string, unknown> = {

    project_id: payload.projectId,

    storage_path: payload.storagePath,

    filename: payload.filename,

    uploaded_by: (await sb.auth.getUser()).data.user?.id ?? null,

    piece_id: payload.pieceId,

  }

  const { error } = await sb.from('project_piece_photos').insert(row)

  if (error) {

    if (isPostgrestMissingColumnError(error, 'piece_id')) {

      throw new Error(piecePhotosMissingPieceIdMessage())

    }

    throw error

  }

}



export async function createSignedUrlForPiecePhoto(storagePath: string, expiresSec = 3600): Promise<string | null> {
  return createSignedUrlForBodegaStorage(BODEGA_PROYECTOS_BUCKET, storagePath, expiresSec)
}


