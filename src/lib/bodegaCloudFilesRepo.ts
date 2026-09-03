import { getSupabase } from './supabaseClient'
import { moveBodegaStorageObject, BODEGA_PROYECTOS_BUCKET } from './bodegaObjectStorage'
import { updateDesignVersionZipPaths } from './designVersionsRepo'
import { updateMachineVersionZipPaths } from './machineVersionsRepo'
import { updatePiecePhotoPaths } from './piecePhotosRepo'
import { updateProgrammingPieceFile } from './bodegaPiecesRepo'
import { sanitizeStorageFileName } from './bodegaOrdenes'
import type { AppRole } from './roles'

export type CloudFileKind = 'diseno' | 'info_cliente' | 'programacion' | 'maquinado' | 'foto' | 'accesorios'

/** Tabla/columna de origen (para renombrar y listar adjuntos por pieza). */
export type CloudFileRecordSource =
  | 'design_version'
  | 'machine_version'
  | 'piece_photo'
  | 'piece_programming'
  | 'piece_maquinado_time_sheet'
  | 'piece_maquinado_real_sheet'
  | 'piece_accesorio'

export type BodegaCloudFileRow = {
  id: string
  source: CloudFileRecordSource
  kind: CloudFileKind
  projectId: string
  folio: string
  proyectoNombre: string
  /** Texto de empresa para agrupar (proyecto.empresa, o empresa de la OC, o cliente). */
  empresaDisplay: string
  /** Número de orden de compra vinculada, si existe. */
  ordenCompraNumero: string | null
  storagePath: string
  displayName: string
  createdAt: string | null
}

function embedOne<T>(v: T | T[] | null | undefined): T | undefined {
  if (v == null) return undefined
  return Array.isArray(v) ? v[0] : v
}

function projectJoin(row: unknown): {
  folio: string
  nombre: string
  empresaDisplay: string
  ordenCompraNumero: string | null
} {
  const j = (row as { bodega_projects?: unknown }).bodega_projects
  const p = embedOne(j as { folio?: string; nombre?: string; empresa?: string | null; cliente?: string | null; bodega_ordenes_compra?: unknown } | undefined)
  if (!p) return { folio: '', nombre: '', empresaDisplay: 'Sin empresa', ordenCompraNumero: null }
  const folio = String(p.folio ?? '')
  const nombre = String(p.nombre ?? '')
  const empresaProyecto = String(p.empresa ?? '').trim()
  const cliente = String(p.cliente ?? '').trim()
  const oc = embedOne(p.bodega_ordenes_compra as { numero?: string | null; empresas?: unknown } | undefined)
  const ocNum = oc?.numero != null && String(oc.numero).trim() ? String(oc.numero).trim() : null
  const em = embedOne(oc?.empresas as { nombre?: string | null } | undefined)
  const empresaOc = em?.nombre != null ? String(em.nombre).trim() : ''
  const empresaDisplay =
    empresaProyecto || empresaOc || (cliente ? `Cliente: ${cliente}` : '') || 'Sin empresa'
  return { folio, nombre, empresaDisplay, ordenCompraNumero: ocNum }
}

/** Clave relativa al bucket: sin `/` inicial ni prefijo `bodega-proyectos/`. */
export function normalizeBodegaProyectosObjectKey(path: string): string {
  let p = path.trim().replace(/^\/+/, '')
  const prefix = 'bodega-proyectos/'
  if (p.toLowerCase().startsWith(prefix)) p = p.slice(prefix.length)
  return p
}

export function classifyBodegaProyectoPath(path: string): CloudFileKind | null {
  const p = normalizeBodegaProyectosObjectKey(path)
  if (p.includes('/diseno/')) return 'diseno'
  if (p.includes('/info_cliente/')) return 'info_cliente'
  if (p.includes('/programacion/')) return 'programacion'
  if (p.includes('/maquinado/')) return 'maquinado'
  if (p.includes('/accesorios/')) return 'accesorios'
  if (p.includes('/evidencias/')) return 'foto'
  return null
}

export function filterCloudFilesForRole(role: AppRole, rows: BodegaCloudFileRow[]): BodegaCloudFileRow[] {
  if (role === 'admin' || role === 'encargado') return rows
  if (role === 'disenadora') {
    return rows.filter((r) => r.kind === 'diseno' || r.kind === 'info_cliente' || r.kind === 'foto')
  }
  if (role === 'programadora_maquinaria') {
    return rows.filter((r) =>
      ['programacion', 'maquinado', 'foto', 'accesorios'].includes(r.kind),
    )
  }
  return []
}

/** Orden de “carpetas” de tipo dentro de cada proyecto. */
export const NUBE_KIND_FOLDER_ORDER: CloudFileKind[] = [
  'diseno',
  'info_cliente',
  'programacion',
  'maquinado',
  'accesorios',
  'foto',
]

export type NubeExplorerProject = {
  projectId: string
  folio: string
  proyectoNombre: string
  byKind: Partial<Record<CloudFileKind, BodegaCloudFileRow[]>>
}

export type NubeExplorerOc = {
  key: string
  title: string
  totalFiles: number
  projects: NubeExplorerProject[]
}

export type NubeExplorerEmpresa = {
  key: string
  title: string
  totalFiles: number
  ordenes: NubeExplorerOc[]
}

function sortFilesByDateDesc(files: BodegaCloudFileRow[]): void {
  files.sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0
    return tb - ta
  })
}

/** Agrupa archivos para la vista “explorador”: empresa → orden de compra → proyecto → tipo. */
export function buildNubeCloudExplorerTree(rows: BodegaCloudFileRow[]): NubeExplorerEmpresa[] {
  type OcAcc = { title: string; projMap: Map<string, NubeExplorerProject> }
  type EmpAcc = { title: string; ocMap: Map<string, OcAcc> }

  const empMap = new Map<string, EmpAcc>()

  for (const r of rows) {
    const eKey = (r.empresaDisplay || 'Sin empresa').trim().toLowerCase() || 'sin-empresa'
    const eTitle = (r.empresaDisplay || 'Sin empresa').trim() || 'Sin empresa'
    if (!empMap.has(eKey)) empMap.set(eKey, { title: eTitle, ocMap: new Map() })
    const emp = empMap.get(eKey)!
    emp.title = eTitle

    const ocKey = r.ordenCompraNumero?.trim() ? `oc:${r.ordenCompraNumero.trim()}` : 'oc:__sin__'
    const ocTitle = r.ordenCompraNumero?.trim() ? `Orden de compra ${r.ordenCompraNumero.trim()}` : 'Sin orden de compra'
    if (!emp.ocMap.has(ocKey)) emp.ocMap.set(ocKey, { title: ocTitle, projMap: new Map() })
    const oc = emp.ocMap.get(ocKey)!

    if (!oc.projMap.has(r.projectId)) {
      oc.projMap.set(r.projectId, {
        projectId: r.projectId,
        folio: r.folio,
        proyectoNombre: r.proyectoNombre,
        byKind: {},
      })
    }
    const proj = oc.projMap.get(r.projectId)!
    const list = proj.byKind[r.kind] ?? (proj.byKind[r.kind] = [])
    list.push(r)
  }

  const empresas: NubeExplorerEmpresa[] = []
  for (const [, emp] of empMap) {
    let empTotal = 0
    const ordenes: NubeExplorerOc[] = []
    for (const [ocKey, oc] of emp.ocMap) {
      let ocTotal = 0
      const projects: NubeExplorerProject[] = []
      for (const proj of oc.projMap.values()) {
        for (const k of NUBE_KIND_FOLDER_ORDER) {
          const arr = proj.byKind[k]
          if (arr?.length) sortFilesByDateDesc(arr)
        }
        const n = NUBE_KIND_FOLDER_ORDER.reduce((s, k) => s + (proj.byKind[k]?.length ?? 0), 0)
        if (n > 0) {
          ocTotal += n
          projects.push(proj)
        }
      }
      projects.sort((a, b) => a.folio.localeCompare(b.folio, 'es'))
      if (ocTotal > 0) {
        empTotal += ocTotal
        ordenes.push({ key: ocKey, title: oc.title, totalFiles: ocTotal, projects })
      }
    }
    ordenes.sort((a, b) => {
      if (a.key === 'oc:__sin__') return 1
      if (b.key === 'oc:__sin__') return -1
      return a.title.localeCompare(b.title, 'es', { numeric: true })
    })
    if (empTotal > 0) {
      empresas.push({
        key: emp.title.toLowerCase(),
        title: emp.title,
        totalFiles: empTotal,
        ordenes,
      })
    }
  }

  empresas.sort((a, b) => a.title.localeCompare(b.title, 'es', { sensitivity: 'base' }))
  return empresas
}

function normalizeRenameFilename(input: string, originalDisplayName: string): string {
  const t = input.trim()
  if (!t) throw new Error('Escribe un nombre de archivo.')
  const origExt = originalDisplayName.includes('.') ? originalDisplayName.slice(originalDisplayName.lastIndexOf('.')) : ''
  const hasExt = /\.\w{1,10}$/i.test(t)
  const withExt = hasExt ? t : origExt ? `${t}${origExt}` : t
  return sanitizeStorageFileName(withExt)
}

const UUID_FILE_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-(.+)$/i

export function buildRenamedStoragePath(storagePath: string, newDisplayName: string): { newPath: string; newFileName: string } {
  const lastSlash = storagePath.lastIndexOf('/')
  const dir = lastSlash >= 0 ? storagePath.slice(0, lastSlash) : ''
  const file = lastSlash >= 0 ? storagePath.slice(lastSlash + 1) : storagePath
  const m = file.match(UUID_FILE_RE)
  if (!m) {
    throw new Error(
      'Este archivo no usa el formato esperado (UUID-nombre). Renómbralo solo desde archivos subidos por la app.',
    )
  }
  const uuid = m[1]
  const newFile = `${uuid}-${newDisplayName}`
  return { newPath: dir ? `${dir}/${newFile}` : newFile, newFileName: newDisplayName }
}

function pushCloudRow(
  out: BodegaCloudFileRow[],
  args: {
    id: string
    source: CloudFileRecordSource
    projectId: string
    storagePath: string
    displayName: string
    createdAt: string | null
    projectRow: Record<string, unknown>
  },
): void {
  const path = normalizeBodegaProyectosObjectKey(args.storagePath)
  if (!path.trim()) return
  const kind = classifyBodegaProyectoPath(path)
  if (!kind) return
  const pj = projectJoin(args.projectRow)
  out.push({
    id: args.id,
    source: args.source,
    kind,
    projectId: args.projectId,
    folio: pj.folio,
    proyectoNombre: pj.nombre,
    empresaDisplay: pj.empresaDisplay,
    ordenCompraNumero: pj.ordenCompraNumero,
    storagePath: path,
    displayName: args.displayName,
    createdAt: args.createdAt,
  })
}

export async function fetchBodegaCloudFileRows(): Promise<BodegaCloudFileRow[]> {
  const sb = getSupabase()
  const [dRes, mRes, pRes, piecesRes] = await Promise.all([
    sb
      .from('project_design_versions')
      .select(
        'id, project_id, zip_storage_path, zip_filename, created_at, bodega_projects(folio,nombre,empresa,cliente,orden_compra_id,bodega_ordenes_compra(numero,empresas(nombre)))',
      )
      .order('created_at', { ascending: false })
      .limit(500),
    sb
      .from('project_machine_versions')
      .select(
        'id, project_id, zip_storage_path, zip_filename, created_at, bodega_projects(folio,nombre,empresa,cliente,orden_compra_id,bodega_ordenes_compra(numero,empresas(nombre)))',
      )
      .order('created_at', { ascending: false })
      .limit(500),
    sb
      .from('project_piece_photos')
      .select(
        'id, project_id, storage_path, filename, created_at, bodega_projects(folio,nombre,empresa,cliente,orden_compra_id,bodega_ordenes_compra(numero,empresas(nombre)))',
      )
      .order('created_at', { ascending: false })
      .limit(500),
    sb
      .from('bodega_project_pieces')
      .select(
        `id, project_id,
        programming_file_storage_path, programming_file_name, programming_file_uploaded_at,
        maquinado_time_sheet_storage_path, maquinado_time_sheet_name, maquinado_time_sheet_uploaded_at,
        maquinado_real_sheet_storage_path, maquinado_real_sheet_name, maquinado_real_sheet_uploaded_at,
        accesorio_storage_path, accesorio_storage_name, accesorio_archived_at,
        bodega_projects(folio,nombre,empresa,cliente,orden_compra_id,bodega_ordenes_compra(numero,empresas(nombre)))`,
      )
      .or(
        'programming_file_storage_path.not.is.null,maquinado_time_sheet_storage_path.not.is.null,maquinado_real_sheet_storage_path.not.is.null,accesorio_storage_path.not.is.null',
      )
      .order('updated_at', { ascending: false })
      .limit(2000),
  ])
  if (dRes.error) throw dRes.error
  if (mRes.error) throw mRes.error
  if (pRes.error) throw pRes.error
  if (piecesRes.error) throw piecesRes.error

  const out: BodegaCloudFileRow[] = []

  for (const r of (dRes.data ?? []) as Array<Record<string, unknown>>) {
    const path = normalizeBodegaProyectosObjectKey(String(r.zip_storage_path ?? ''))
    const kind = classifyBodegaProyectoPath(path)
    if (!kind) continue
    const pj = projectJoin(r)
    out.push({
      id: String(r.id),
      source: 'design_version',
      kind,
      projectId: String(r.project_id),
      folio: pj.folio,
      proyectoNombre: pj.nombre,
      empresaDisplay: pj.empresaDisplay,
      ordenCompraNumero: pj.ordenCompraNumero,
      storagePath: path,
      displayName: String(r.zip_filename ?? path.split('/').pop() ?? ''),
      createdAt: r.created_at != null ? String(r.created_at) : null,
    })
  }

  for (const r of (mRes.data ?? []) as Array<Record<string, unknown>>) {
    const path = normalizeBodegaProyectosObjectKey(String(r.zip_storage_path ?? ''))
    const kind = classifyBodegaProyectoPath(path)
    if (!kind) continue
    const pj = projectJoin(r)
    out.push({
      id: String(r.id),
      source: 'machine_version',
      kind,
      projectId: String(r.project_id),
      folio: pj.folio,
      proyectoNombre: pj.nombre,
      empresaDisplay: pj.empresaDisplay,
      ordenCompraNumero: pj.ordenCompraNumero,
      storagePath: path,
      displayName: String(r.zip_filename ?? path.split('/').pop() ?? ''),
      createdAt: r.created_at != null ? String(r.created_at) : null,
    })
  }

  for (const r of (pRes.data ?? []) as Array<Record<string, unknown>>) {
    const path = normalizeBodegaProyectosObjectKey(String(r.storage_path ?? ''))
    const kind = classifyBodegaProyectoPath(path)
    if (!kind) continue
    const pj = projectJoin(r)
    out.push({
      id: String(r.id),
      source: 'piece_photo',
      kind,
      projectId: String(r.project_id),
      folio: pj.folio,
      proyectoNombre: pj.nombre,
      empresaDisplay: pj.empresaDisplay,
      ordenCompraNumero: pj.ordenCompraNumero,
      storagePath: path,
      displayName: String(r.filename ?? path.split('/').pop() ?? ''),
      createdAt: r.created_at != null ? String(r.created_at) : null,
    })
  }

  for (const r of (piecesRes.data ?? []) as Array<Record<string, unknown>>) {
    const pieceId = String(r.id)
    const projectId = String(r.project_id)
    const progPath = String(r.programming_file_storage_path ?? '').trim()
    if (progPath) {
      pushCloudRow(out, {
        id: pieceId,
        source: 'piece_programming',
        projectId,
        storagePath: progPath,
        displayName: String(r.programming_file_name ?? progPath.split('/').pop() ?? 'Programación'),
        createdAt:
          r.programming_file_uploaded_at != null ? String(r.programming_file_uploaded_at) : null,
        projectRow: r,
      })
    }
    const estPath = String(r.maquinado_time_sheet_storage_path ?? '').trim()
    if (estPath) {
      pushCloudRow(out, {
        id: pieceId,
        source: 'piece_maquinado_time_sheet',
        projectId,
        storagePath: estPath,
        displayName: String(r.maquinado_time_sheet_name ?? estPath.split('/').pop() ?? 'Tiempo estimado'),
        createdAt:
          r.maquinado_time_sheet_uploaded_at != null ? String(r.maquinado_time_sheet_uploaded_at) : null,
        projectRow: r,
      })
    }
    const realPath = String(r.maquinado_real_sheet_storage_path ?? '').trim()
    if (realPath) {
      pushCloudRow(out, {
        id: pieceId,
        source: 'piece_maquinado_real_sheet',
        projectId,
        storagePath: realPath,
        displayName: String(r.maquinado_real_sheet_name ?? realPath.split('/').pop() ?? 'Tiempo real'),
        createdAt:
          r.maquinado_real_sheet_uploaded_at != null ? String(r.maquinado_real_sheet_uploaded_at) : null,
        projectRow: r,
      })
    }
    const accPath = String(r.accesorio_storage_path ?? '').trim()
    if (accPath) {
      pushCloudRow(out, {
        id: pieceId,
        source: 'piece_accesorio',
        projectId,
        storagePath: accPath,
        displayName: String(r.accesorio_storage_name ?? accPath.split('/').pop() ?? 'Accesorio'),
        createdAt: r.accesorio_archived_at != null ? String(r.accesorio_archived_at) : null,
        projectRow: r,
      })
    }
  }

  out.sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0
    return tb - ta
  })
  return out
}

export async function renameBodegaCloudFile(row: BodegaCloudFileRow, newNameInput: string): Promise<void> {
  const fromKey = normalizeBodegaProyectosObjectKey(row.storagePath)
  const rowNorm: BodegaCloudFileRow = { ...row, storagePath: fromKey }
  const safeDisplay = normalizeRenameFilename(newNameInput, row.displayName)
  const { newPath } = buildRenamedStoragePath(rowNorm.storagePath, safeDisplay)
  if (newPath === rowNorm.storagePath) {
    throw new Error('El nombre no cambió.')
  }

  let moveErr: Error | null = null
  try {
    await moveBodegaStorageObject(BODEGA_PROYECTOS_BUCKET, rowNorm.storagePath, newPath)
  } catch (e) {
    moveErr = e instanceof Error ? e : new Error('No se pudo mover el archivo')
  }
  if (moveErr) {
    const msg = moveErr.message
    if (/policy|permission|row-level security|403|401/i.test(msg)) {
      throw new Error(
        'Storage rechazó el renombrado (permisos). Ejecuta en Supabase el SQL «patch_bodega_cloud_rename_rls_storage.sql» del repositorio (incluye política UPDATE para move) y vuelve a intentar.',
      )
    }
    if (/not\s*found|object\s*not\s*found|no\s*such\s*file|404/i.test(msg)) {
      throw new Error(
        'Storage no encontró el archivo en la ruta guardada. Comprueba en el panel de Storage que exista el objeto; si la ruta en la base de datos es antigua, vuelve a subir el archivo o corrige la ruta.',
      )
    }
    throw new Error(msg || 'No se pudo renombrar el archivo en la nube.')
  }

  try {
    if (row.source === 'design_version') {
      await updateDesignVersionZipPaths({ id: row.id, zipStoragePath: newPath, zipFilename: safeDisplay })
    } else if (row.source === 'machine_version') {
      await updateMachineVersionZipPaths({ id: row.id, zipStoragePath: newPath, zipFilename: safeDisplay })
    } else if (row.source === 'piece_photo') {
      await updatePiecePhotoPaths({ id: row.id, storagePath: newPath, filename: safeDisplay })
    } else if (row.source === 'piece_programming') {
      await updateProgrammingPieceFile({
        pieceId: row.id,
        fileStoragePath: newPath,
        fileName: safeDisplay,
      })
    } else if (row.source === 'piece_maquinado_time_sheet') {
      const sb = getSupabase()
      const { error } = await sb
        .from('bodega_project_pieces')
        .update({
          maquinado_time_sheet_storage_path: newPath,
          maquinado_time_sheet_name: safeDisplay,
        })
        .eq('id', row.id)
      if (error) throw error
    } else if (row.source === 'piece_maquinado_real_sheet') {
      const sb = getSupabase()
      const { error } = await sb
        .from('bodega_project_pieces')
        .update({
          maquinado_real_sheet_storage_path: newPath,
          maquinado_real_sheet_name: safeDisplay,
        })
        .eq('id', row.id)
      if (error) throw error
    } else if (row.source === 'piece_accesorio') {
      const sb = getSupabase()
      const { error } = await sb
        .from('bodega_project_pieces')
        .update({
          accesorio_storage_path: newPath,
          accesorio_storage_name: safeDisplay,
        })
        .eq('id', row.id)
      if (error) throw error
    } else {
      throw new Error('Origen de archivo no reconocido.')
    }
  } catch (e) {
    await moveBodegaStorageObject(BODEGA_PROYECTOS_BUCKET, newPath, rowNorm.storagePath).catch(() => undefined)
    throw e instanceof Error ? e : new Error('No se pudo actualizar el registro del archivo.')
  }
}
