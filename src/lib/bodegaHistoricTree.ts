import type { BodegaHistoricFileRow } from './bodegaHistoricRepo'
import { relativePathWithinHistoricoArea } from './bodegaHistoricPath'
import type { BodegaHistoricoArea } from './bodegaHistoricTypes'

export type HistoricFolderNode = {
  name: string
  /** Ruta relativa de la carpeta (vacío = raíz virtual). */
  relPath: string
  folders: HistoricFolderNode[]
  files: BodegaHistoricFileRow[]
  fileCount: number
}

function compareNames(a: string, b: string): number {
  return a.localeCompare(b, 'es', { sensitivity: 'base', numeric: true })
}

function sortNode(node: HistoricFolderNode): void {
  node.folders.sort((a, b) => compareNames(a.name, b.name))
  node.files.sort((a, b) => compareNames(a.displayName, b.displayName))
  for (const f of node.folders) sortNode(f)
}

function countFiles(node: HistoricFolderNode): number {
  let n = node.files.length
  for (const f of node.folders) n += countFiles(f)
  node.fileCount = n
  return n
}

function getOrCreateFolder(parent: HistoricFolderNode, segments: string[]): HistoricFolderNode {
  if (segments.length === 0) return parent
  const [head, ...rest] = segments
  let child = parent.folders.find((f) => f.name === head)
  if (!child) {
    const relPath = parent.relPath ? `${parent.relPath}/${head}` : head!
    child = { name: head!, relPath, folders: [], files: [], fileCount: 0 }
    parent.folders.push(child)
  }
  return getOrCreateFolder(child, rest)
}

export function buildHistoricFolderTree(
  area: BodegaHistoricoArea,
  rows: BodegaHistoricFileRow[],
): HistoricFolderNode[] {
  const root: HistoricFolderNode = { name: '(raíz)', relPath: '', folders: [], files: [], fileCount: 0 }

  for (const row of rows) {
    const rel = relativePathWithinHistoricoArea(area, row.storagePath)
    if (!rel) continue
    const parts = rel.split('/').filter(Boolean)
    if (parts.length === 0) continue
    if (parts.length === 1) {
      root.files.push(row)
      continue
    }
    const folder = getOrCreateFolder(root, parts.slice(0, -1))
    folder.files.push(row)
  }

  sortNode(root)
  countFiles(root)

  if (root.folders.length === 0 && root.files.length === 0) return []
  if (root.folders.length === 1 && root.files.length === 0) return root.folders
  if (root.folders.length > 0 && root.files.length === 0) return root.folders
  return [root]
}

export function historicTreeTotalFiles(nodes: HistoricFolderNode[]): number {
  return nodes.reduce((s, n) => s + n.fileCount, 0)
}

/** Extensión del archivo (sin punto, minúsculas). */
export function historicFileExtension(displayName: string): string {
  const base = displayName.split('/').pop()?.trim() ?? displayName.trim()
  const dot = base.lastIndexOf('.')
  if (dot <= 0) return ''
  return base.slice(dot + 1).toLowerCase()
}

/** Programación CNC — archivos .SLCPRT / .SCPRT (Maquinado). */
export function isHistoricoMaquinadoFile(row: Pick<BodegaHistoricFileRow, 'displayName'>): boolean {
  const ext = historicFileExtension(row.displayName)
  return ext === 'slcprt' || ext === 'scprt' || ext === 'sclprt'
}

/** Plano/láser — archivos .DXF (carpeta AXF en histórico). */
export function isHistoricoAxfFile(row: Pick<BodegaHistoricFileRow, 'displayName'>): boolean {
  return historicFileExtension(row.displayName) === 'dxf'
}

export type ProgramadoraHistoricoSplit = {
  maquinado: BodegaHistoricFileRow[]
  axf: BodegaHistoricFileRow[]
  rest: BodegaHistoricFileRow[]
}

export function splitProgramadoraHistoricoFiles(rows: BodegaHistoricFileRow[]): ProgramadoraHistoricoSplit {
  const maquinado: BodegaHistoricFileRow[] = []
  const axf: BodegaHistoricFileRow[] = []
  const rest: BodegaHistoricFileRow[] = []
  for (const row of rows) {
    if (isHistoricoMaquinadoFile(row)) maquinado.push(row)
    else if (isHistoricoAxfFile(row)) axf.push(row)
    else rest.push(row)
  }
  const byName = (a: BodegaHistoricFileRow, b: BodegaHistoricFileRow) =>
    a.displayName.localeCompare(b.displayName, 'es', { sensitivity: 'base', numeric: true })
  maquinado.sort(byName)
  axf.sort(byName)
  return { maquinado, axf, rest }
}

export function filterHistoricFileRows(
  rows: BodegaHistoricFileRow[],
  query: string,
): BodegaHistoricFileRow[] {
  const s = query.trim().toLowerCase()
  if (!s) return rows
  return rows.filter((r) => {
    const hay = `${r.displayName} ${r.folio ?? ''} ${r.notes ?? ''} ${r.storagePath}`.toLowerCase()
    return hay.includes(s)
  })
}
