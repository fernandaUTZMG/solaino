import type { PostgrestSingleResponse } from '@supabase/supabase-js'
import { filterCotizacionLineas, isCotizacionAmountSummaryLine } from '../../lib/ordenCompraPdfExtract'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getSupabase } from '../../lib/supabaseClient'
import {
  canAccessBodega,
  canBulkCreateProjectsFromOc,
  canManageBodegaLikeAdmin,
  canManageBodegaPurchaseOrders,
  canReviewBodegaDesign,
  canUploadBodegaDesign,
  canUploadBodegaMachine,
  canUploadBodegaPiecePhotos,
  canSupervisorFinalizeBodegaProject,
  canSaveBodegaProjectNote,
  canSetManualBodegaProjectAvance,
  canDownloadBodegaOrdenCompraPdf,
  canSetBodegaProjectPrioridad,
  canAccessMaquinadoNav,
  canAccessTallerOperadorNav,
  type AppRole,
} from '../../lib/roles'
import {
  BODEGA_ORDENES_BUCKET,
  fetchOrdenesCompra,
  sanitizeStorageFileName,
  type OrdenCompraRow,
} from '../../lib/bodegaOrdenes'
import BodegaXtPruebaPanel from './BodegaXtPruebaPanel'
import {
  BODEGA_PROYECTOS_BUCKET,
  createSignedUrlForDesignZip,
  approvedDesignEntregaVersions,
  approvedDesignZipSummary,
  fetchDesignVersions,
  nextDesignVersionPendingReview,
  type ProjectDesignVersionRow,
} from '../../lib/designVersionsRepo'
import {
  bulkCreateProjectsFromOcPdf,
  programadoraSolicitaCierreRevision,
  saveProjectNote,
  setProjectAvanceManual,
  supervisorSetProjectStatus,
} from '../../lib/bodegaProjectStatus'
import type { CncModuleKind, ProjectMachineVersionRow } from '../../lib/machineVersionsRepo'
import { fetchMachineVersions } from '../../lib/machineVersionsRepo'
import {
  fetchPiecePhotos,
  insertPiecePhoto,
  type ProjectPiecePhotoRow,
} from '../../lib/piecePhotosRepo'
import {
  aggregateBusinessMinutesByLane,
  fetchWorkIntervals,
  fetchWorkIntervalsForProjects,
  formatWorkMinutesShort,
  type BodegaWorkIntervalLane,
  orderedLaneLabels,
  startWorkInterval,
  type BodegaWorkIntervalRow,
} from '../../lib/bodegaWorkIntervalsRepo'
import { closeProgrammingOfficeClockIfComplete } from '../../lib/bodegaWorkIntervalClose'
import { fetchPieceIntervalsForProject, fetchPieceIntervalsForProjects } from '../../lib/bodegaPieceIntervalsRepo'
import type { BodegaPieceIntervalRow } from '../../lib/bodegaPieceIntervalsRepo'
import {
  computeProjectOrdenTimes,
  sumOrdenTimeBreakdowns,
  type ProjectOrdenTimeBreakdown,
} from '../../lib/bodegaProjectOrdenTimes'
import { formatBusinessMinutesShort } from '../../lib/bodegaProjectPhaseDurations'
import { formatDeliveryTabTime } from '../../lib/bodegaDeliveryTabTimes'
import { BodegaDeliverySectionTimeStrip } from './BodegaDeliverySectionTimeStrip.tsx'
import { BodegaProjectDeliveryTimesSummary } from './BodegaProjectDeliveryTimesSummary.tsx'
import { OrdenTimeLegend } from './BodegaOrdenTimesUi.tsx'
import {
  BodegaOrdenTab,
  type OrdenTablaFila,
} from './BodegaOrdenTab.tsx'
import { fetchProjectActivity, insertProjectActivity, type ProjectActivityRow } from '../../lib/projectActivityRepo'
import {
  guessImageContentType,
  isImageLikeFile,
  refreshSessionBeforeStorageUpload,
  uploadBodegaProyectosBinary,
} from '../../lib/bodegaStorageUpload'
import { businessMinutesBetween } from '../../lib/workHours'
import { runDesignZipUpload } from '../../lib/bodegaDesignUploadFlow'
import { applyDesignPlanosAutoAssign } from '../../lib/bodegaDesignPlanosAutoAssign'
import { isXtDesignFile, parseXtFile } from '../../lib/xtParasolidPieces'
import {
  confirmDesignFolders,
  fetchDesignConfirmedFolders,
  confirmedFolderKeySetForVersion,
  type DesignConfirmedFolderRow,
} from '../../lib/designConfirmedFoldersRepo'
import { notifyDesignerDesignEntregaConfirmada } from '../../lib/notifyBodegaDesignEntregaConfirmada'
import {
  computeStep3FolderConfirmStatus,
  filterPathsToConfirmedFolders,
} from '../../lib/bodegaStep3Supervisor'
import {
  resolveApprovedDesignEntregaEntryPaths,
  resolveDesignVersionEntryPaths,
} from '../../lib/designZipPaths'
import {
  fetchProjectMaquinadoQueue,
  fetchProjectPieceFlowMeta,
  fetchProjectPieces,
  finalizeProjectBySupervisor,
  syncProjectPiecesFromDesignPathsDetailed,
  type BodegaProjectPieceRow,
  type BodegaProjectPieceWithProject,
} from '../../lib/bodegaPiecesRepo'
import {
  hasProgrammingDeliveryUpload,
  runProgrammingDeliveryUpload,
} from '../../lib/bodegaProgrammingDeliveryFlow'
import {
  canProgramadoraSolicitarCierre,
  computeProjectPieceClosureProgress,
} from '../../lib/bodegaPiecePhotosFlow'
import {
  computeProjectPipelineDisplay,
  projectUsesOperationalPipeline,
} from '../../lib/bodegaProjectPipelineProgress'
import {
  BODEGA_PRIORIDAD_NIVEL_PATCH,
  compareProjectPrioridadNivel,
  maxPrioridadNivel,
  parsePrioridadFromRow,
  prioridadRowHighlightClass,
  type ProjectPrioridadNivel,
} from '../../lib/bodegaProjectPrioridad'
import { updateBodegaProjectPrioridadNivel } from '../../lib/bodegaProjectPrioridadUpdate'
import { BodegaProjectPrioridadBadge } from './BodegaProjectPrioridadBadge.tsx'
import { BodegaProjectPrioridadControl } from './BodegaProjectPrioridadControl.tsx'
import { BodegaPiecesWorkflowPanel } from './BodegaPiecesWorkflowPanel.tsx'
import { BodegaDesignPiecePlanosPanel } from './BodegaDesignPiecePlanosPanel.tsx'
import { BodegaDesignZipMissingPlanosModal } from './BodegaDesignZipMissingPlanosModal.tsx'
import { BodegaDisenoWorkspace } from './BodegaDisenoWorkspace.tsx'
import { BodegaDisenoDestinosPanel } from './BodegaDisenoDestinosPanel.tsx'
import { BodegaProgramacionWorkspace } from './BodegaProgramacionWorkspace.tsx'
import { BodegaProjectClockPanel } from './BodegaProjectClockPanel.tsx'
import { BodegaSupervisorStep3Panel } from './BodegaSupervisorStep3Panel.tsx'
import { BodegaProgrammerDeliveryPanel } from './BodegaProgrammerDeliveryPanel.tsx'
import { BodegaProgrammerCncWorkspace } from './BodegaProgrammerCncWorkspace.tsx'
import { BodegaProgrammerProgrammingFullscreen } from './BodegaProgrammerProgrammingFullscreen.tsx'
import { BodegaProjectPiecePhotosWorkspace } from './BodegaProjectPiecePhotosWorkspace.tsx'
import { BodegaProjectDeliveryFullscreen } from './BodegaProjectDeliveryFullscreen.tsx'
import { useLiveClockTick } from './useLiveClockTick.ts'
import { OrdenCompraPdfViewerModal } from './OrdenCompraPdfViewerModal.tsx'
import { OrdenCompraCatalogEditModal } from './OrdenCompraCatalogEditModal.tsx'
import { ProjectLinkOrdenCompraModal } from './ProjectLinkOrdenCompraModal.tsx'
import {
  BodegaArchivosEntregasButton,
  BodegaOcPdfPartidaButton,
  BodegaProyectoOrigenManualBadge,
} from './bodegaProyectoTableUi.tsx'
import { BodegaProjectSeguimientoSection } from './BodegaProjectSeguimientoSection.tsx'
import { BodegaOperatorMaquinadoWorkspace } from './BodegaOperatorMaquinadoWorkspace.tsx'
import { BodegaProjectTallerWorkspace } from './BodegaProjectTallerWorkspace.tsx'
import {
  clearStoredBodegaDeliveryWorkspace,
  readStoredBodegaDeliveryWorkspace,
  writeStoredBodegaDeliveryWorkspace,
} from './bodegaDeliveryWorkspacePersist.ts'
import {
  isSwPartsAssignmentComplete,
  piecesForCncModule,
  piecesPendingInCncModule,
  programmerCncModulesWithPieces,
} from '../../lib/bodegaProgrammerFlow'
import { findDesignZipPiecesMissingPlanos, visibleDesignPieces, type DesignZipPiecePair } from '../../lib/designZipPiecePairs'
import { analyzeDesignZip, filterSwPartZipPaths, isSwPartZipPath } from '../../lib/zipDesignPackage'
import { isXtDesignVersion } from '../../lib/xtDesignManifest'

type ProjectStatus =
  | 'pendiente'
  | 'en_diseno'
  | 'revision_diseno'
  | 'modificacion_diseno'
  | 'diseno_parcial'
  | 'diseno_aprobado'
  | 'en_programacion'
  | 'revision_programacion'
  | 'terminado'

type BodegaProjectRow = {
  id: string
  folio: string
  orden: string | null
  orden_compra_id: string | null
  /** 1-based: línea en `cotizacion_lineas` de la OC (si aplica). */
  cotizacion_linea_idx: number | null
  cliente: string
  empresa: string | null
  nombre: string
  status: ProjectStatus
  avance_pct: number
  fecha_inicio: string
  fecha_termino: string | null
  /** 0=normal … 4=urgente (orden global entre OCs). */
  prioridadNivel: ProjectPrioridadNivel
  created_at: string
  updated_at: string | null
}

type CatalogOpt = { id: string; nombre: string }

function statusLabel(s: ProjectStatus): string {
  if (s === 'pendiente') return 'Pendiente'
  if (s === 'en_diseno') return 'En diseño'
  if (s === 'revision_diseno') return 'Revisión diseño'
  if (s === 'modificacion_diseno') return 'Modificación diseño'
  if (s === 'diseno_parcial') return 'Diseño parcial'
  if (s === 'diseno_aprobado') return 'Diseño aprobado'
  if (s === 'en_programacion') return 'En programación'
  if (s === 'revision_programacion') return 'Revisión programación'
  return 'Terminado'
}

function statusTone(s: ProjectStatus): string {
  if (s === 'pendiente') return 'bg-slate-50 text-slate-800 border-slate-200'
  if (s === 'en_diseno') return 'bg-sky-50 text-sky-800 border-sky-200'
  if (s === 'revision_diseno') return 'bg-indigo-50 text-indigo-900 border-indigo-200'
  if (s === 'modificacion_diseno') return 'bg-violet-50 text-violet-900 border-violet-200'
  if (s === 'diseno_parcial') return 'bg-teal-50 text-teal-900 border-teal-200'
  if (s === 'diseno_aprobado') return 'bg-emerald-50 text-emerald-800 border-emerald-200'
  if (s === 'en_programacion') return 'bg-programacion-50 text-programacion-900 border-programacion-200'
  if (s === 'revision_programacion') return 'bg-orange-50 text-orange-900 border-orange-200'
  return 'bg-emerald-50 text-emerald-800 border-emerald-200'
}

function safeText(x: unknown): string {
  return typeof x === 'string' ? x : ''
}

function cmpPrioridadFolio(a: BodegaProjectRow, b: BodegaProjectRow): number {
  const pc = compareProjectPrioridadNivel(a.prioridadNivel, b.prioridadNivel)
  if (pc !== 0) return pc
  return a.folio.localeCompare(b.folio, 'es')
}

function clampPct(n: unknown): number {
  const v = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(v)) return 0
  return Math.min(100, Math.max(0, Math.round(v)))
}

function parseDateSafe(s: string | null | undefined): Date | null {
  if (s == null || String(s).trim() === '') return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

function finishDateForProject(r: BodegaProjectRow): Date {
  const ft = parseDateSafe(r.fecha_termino)
  if (ft) return ft
  const up = parseDateSafe(r.updated_at)
  if (up) return up
  return parseDateSafe(r.created_at) ?? new Date(0)
}

/** Minutos hábiles (lun–vie, horario Solaino) entre inicio del proyecto y cierre o `endOverride`. */
function businessMinutesProyecto(r: BodegaProjectRow, endOverride?: Date): number {
  const start = parseDateSafe(r.fecha_inicio) ?? parseDateSafe(r.created_at)
  if (!start) return 0
  const end = endOverride ?? finishDateForProject(r)
  return businessMinutesBetween(start, end)
}

/** Días calendario aproximados de inicio a cierre (proyectos terminados). */
function duracionDiasCalendario(r: BodegaProjectRow): number | null {
  const start = parseDateSafe(r.fecha_inicio) ?? parseDateSafe(r.created_at)
  if (!start) return null
  const end = finishDateForProject(r)
  const ms = end.getTime() - start.getTime()
  if (!Number.isFinite(ms) || ms < 0) return null
  return Math.round(ms / (24 * 60 * 60 * 1000))
}

function ocAgruparKey(r: BodegaProjectRow): string {
  if (r.orden_compra_id && String(r.orden_compra_id).trim() !== '') return `oc:${r.orden_compra_id}`
  const ord = String(r.orden ?? '')
    .trim()
    .toLowerCase()
  const cli = String(r.cliente ?? '')
    .trim()
    .toLowerCase()
  return `txt:${ord}__${cli}`
}

function formatMonthShortEs(mk: string): string {
  const [y, mo] = mk.split('-').map((x) => Number(x))
  if (!Number.isFinite(y) || !Number.isFinite(mo)) return mk
  const d = new Date(y, mo - 1, 1)
  try {
    return d.toLocaleDateString('es-MX', { month: 'short', year: 'numeric' })
  } catch {
    return mk
  }
}

function lastNMonthKeys(n: number): string[] {
  const out: string[] = []
  const d = new Date()
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1)
    out.push(monthKey(x))
  }
  return out
}

function weekMondayKey(d: Date): string {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const day = (x.getDay() + 6) % 7
  x.setDate(x.getDate() - day)
  const y = x.getFullYear()
  const m = String(x.getMonth() + 1).padStart(2, '0')
  const dayNum = String(x.getDate()).padStart(2, '0')
  return `${y}-${m}-${dayNum}`
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function yearKey(d: Date): string {
  return String(d.getFullYear())
}

function formatDateTimeEs(d: Date): string {
  try {
    return d.toLocaleString('es-MX', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return d.toISOString().slice(0, 16).replace('T', ' ')
  }
}

function errMessageFromUnknown(e: unknown): string {
  if (e instanceof Error && e.message) return e.message
  if (e && typeof e === 'object') {
    const o = e as { message?: string; error?: string; statusCode?: string | number }
    const parts = [o.message, o.error, o.statusCode != null ? `código ${o.statusCode}` : ''].filter(Boolean)
    if (parts.length) return parts.join(' — ')
  }
  return 'Error desconocido al guardar.'
}

function looksLikeStorageBucketMissing(msg: string): boolean {
  return /bucket\s+not\s+found|invalid\s+bucket|unknown\s+bucket|no\s+such\s+bucket|does\s+not\s+exist.*bucket/i.test(
    msg,
  )
}

function cotizacionLineasValidas(lines: string[] | null | undefined): string[] {
  return filterCotizacionLineas(lines)
}

function ocProyectosCount(o: OrdenCompraRow, linkedCount: number): number {
  const nPdf = cotizacionLineasValidas(o.cotizacion_lineas).length
  return Math.max(linkedCount, nPdf)
}

function resolvedEmpresaNombre(r: BodegaProjectRow, ordenById: Map<string, OrdenCompraRow>): string {
  const oc = r.orden_compra_id ? ordenById.get(r.orden_compra_id) : undefined
  const raw = (oc?.empresa?.nombre ?? r.empresa ?? 'Sin empresa').trim()
  return raw || 'Sin empresa'
}

function numeroFromFilename(name: string): string {
  const base = name.replace(/\.[^.]+$/i, '').trim()
  return base.toUpperCase() || 'OC-SIN-NUMERO'
}

export type BodegaDeliveryJump = { projectId: string; tab: 'diseno' | 'cnc' }

/** Pestañas del modal Archivos y entregas por proyecto. */
export type BodegaDeliveryTabId = 'diseno' | 'cnc' | 'maquinado' | 'taller' | 'fotos' | 'piezas'

const LANES_BY_DELIVERY_TAB: Record<BodegaDeliveryTabId, BodegaWorkIntervalLane[]> = {
  diseno: ['orden', 'diseno'],
  cnc: ['cnc_programacion', 'cnc_torno', 'cnc_perfilado'],
  maquinado: ['maquina_programacion', 'maquina_torno', 'maquina_perfilado'],
  taller: ['armado'],
  fotos: ['armado'],
  piezas: [],
}

const ALL_PROJECT_DELIVERY_TABS: readonly (readonly [BodegaDeliveryTabId, string, string])[] = [
  ['diseno', 'Diseño', 'Guía y entregas'],
  ['cnc', 'Programación', 'Oficina CNC'],
  ['maquinado', 'Maquinado', 'En máquina'],
  ['taller', 'Taller', 'Perfilado · Detallado · Armado'],
  ['fotos', 'Fotos', 'Cierre'],
  ['piezas', 'Piezas', 'Rutas y avance'],
]

function projectDeliveryTabsForRole(role: AppRole, supervisor: boolean) {
  return ALL_PROJECT_DELIVERY_TABS.filter(([id]) => {
    if (id === 'maquinado') return canAccessMaquinadoNav(role) || supervisor
    if (id === 'taller') return canAccessTallerOperadorNav(role) || supervisor
    return true
  })
}

function projectDeliveryTabActiveClass(tab: BodegaDeliveryTabId): string {
  switch (tab) {
    case 'diseno':
    case 'cnc':
    case 'maquinado':
    case 'taller':
    case 'fotos':
    case 'piezas':
      return 'bg-white text-section-navy shadow-md shadow-black/10 ring-1 ring-white/80'
    default:
      return 'bg-white text-section-navy shadow-md shadow-black/10'
  }
}

export function BodegaPage(props: {
  role: AppRole
  deliveryJumpRequest?: BodegaDeliveryJump | null
  onDeliveryJumpConsumed?: () => void
  onBodegaDeliveriesChanged?: () => void
  /** true cuando la pantalla de archivos y entregas ocupa toda la ventana */
  onProjectDeliveryScreenOpen?: (open: boolean) => void
}) {
  if (!canAccessBodega(props.role)) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 shadow-sm">
        No tienes acceso al módulo de Bodega.
      </div>
    )
  }

  const isBodegaSupervisorFull = canManageBodegaLikeAdmin(props.role)
  const canOc = canManageBodegaPurchaseOrders(props.role)
  const canUploadDesign = canUploadBodegaDesign(props.role)
  const canReviewDesign = canReviewBodegaDesign(props.role)
  const canUploadMachine = canUploadBodegaMachine(props.role)
  const canUploadPiecePhotos = canUploadBodegaPiecePhotos(props.role)
  const canBulkFromOc = canBulkCreateProjectsFromOc(props.role)
  const canDownloadOcPdf = canDownloadBodegaOrdenCompraPdf(props.role)
  const canSetProjectPrioridad = canSetBodegaProjectPrioridad(props.role)

  const [folder, setFolder] = useState<'todas' | 'cliente' | 'proyecto' | 'orden'>('todas')
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | 'all'>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<BodegaProjectRow[]>([])
  const [ordenes, setOrdenes] = useState<OrdenCompraRow[]>([])
  const [ordenesOk, setOrdenesOk] = useState(true)
  const [filterOrdenCompraId, setFilterOrdenCompraId] = useState<string | null>(null)
  const [partidasModalOc, setPartidasModalOc] = useState<OrdenCompraRow | null>(null)
  const [ordenPdfViewer, setOrdenPdfViewer] = useState<{
    oc: OrdenCompraRow
    partidaLineNo: number | null
  } | null>(null)

  const [designModalProject, setDesignModalProject] = useState<BodegaProjectRow | null>(null)
  /** Folio + nombre largo del proyecto: compacto por defecto; botón «Info» expande. */
  const [designModalProjectInfoOpen, setDesignModalProjectInfoOpen] = useState(false)
  const [deliveryTab, setDeliveryTab] = useState<BodegaDeliveryTabId>('diseno')
  /** Submódulos CNC en paralelo (ZIP y reloj por módulo). */
  const [cncModuleTab, setCncModuleTab] = useState<CncModuleKind>('programacion')
  const [workIntervals, setWorkIntervals] = useState<BodegaWorkIntervalRow[]>([])
  const designClockKeyRef = useRef<string | null>(null)
  const cncClockKeyRef = useRef<string | null>(null)
  const programmerCncAutoTabRef = useRef<string | null>(null)
  const deliveryWorkspaceRestoredRef = useRef(false)
  const skipProgrammerAutoTabOnceRef = useRef(false)
  const [programmingFullscreenOpen, setProgrammingFullscreenOpen] = useState(false)
  const [designVersions, setDesignVersions] = useState<ProjectDesignVersionRow[]>([])
  const [piecePhotos, setPiecePhotos] = useState<ProjectPiecePhotoRow[]>([])
  const [projectPieces, setProjectPieces] = useState<BodegaProjectPieceRow[]>([])
  const [pieceIntervals, setPieceIntervals] = useState<BodegaPieceIntervalRow[]>([])
  const [maquinadoQueue, setMaquinadoQueue] = useState<BodegaProjectPieceWithProject[]>([])
  const [pieceFlowMeta, setPieceFlowMeta] = useState<{
    design_contratiempo_notes: string | null
    programming_routes_confirmed_at: string | null
    project_finalized_at: string | null
  } | null>(null)
  const [designZipPaths, setDesignZipPaths] = useState<string[]>([])
  const [designZipPathsLoading, setDesignZipPathsLoading] = useState(false)
  const [designZipPathsError, setDesignZipPathsError] = useState<string | null>(null)
  const [pendingReviewPaths, setPendingReviewPaths] = useState<string[]>([])
  const [pendingReviewPathsLoading, setPendingReviewPathsLoading] = useState(false)
  const [designActivity, setDesignActivity] = useState<ProjectActivityRow[]>([])
  const [designLoading, setDesignLoading] = useState(false)
  const [designUploadBusy, setDesignUploadBusy] = useState(false)
  const [designUploadPhase, setDesignUploadPhase] = useState('')
  const [designZipMissingPlanosPending, setDesignZipMissingPlanosPending] = useState<{
    file: File
    missing: DesignZipPiecePair[]
  } | null>(null)
  const [designReviewBusy, setDesignReviewBusy] = useState(false)
  const [confirmedFolders, setConfirmedFolders] = useState<DesignConfirmedFolderRow[]>([])
  const [machineVersions, setMachineVersions] = useState<ProjectMachineVersionRow[]>([])
  const [programmingUploadBusy, setProgrammingUploadBusy] = useState(false)
  const [programmingUploadPhase, setProgrammingUploadPhase] = useState<string | null>(null)
  const [manualAvanceInput, setManualAvanceInput] = useState('0')
  const [manualAvanceBusy, setManualAvanceBusy] = useState(false)
  const [commentSaveBusy, setCommentSaveBusy] = useState(false)
  const [photoUploadBusy, setPhotoUploadBusy] = useState(false)
  const [closureBusy, setClosureBusy] = useState(false)
  const [supervisorFinalizeBusy, setSupervisorFinalizeBusy] = useState(false)
  const [supervisorStatusBusy, setSupervisorStatusBusy] = useState(false)
  const [prioridadBusyId, setPrioridadBusyId] = useState<string | null>(null)
  const [designCommentDraft, setDesignCommentDraft] = useState('')
  const deliveryJumpHandledKeyRef = useRef<string | null>(null)
  /** `${ordenCompraId}:${lineNo}` mientras se crea/abre entregas desde una fila «PDF · partida». */
  const [pdfPartidaBusyKey, setPdfPartidaBusyKey] = useState<string | null>(null)
  const [bodegaNotice, setBodegaNotice] = useState<string | null>(null)
  const [xtPruebaOpen, setXtPruebaOpen] = useState(false)
  /** Relojes por proyecto para la pestaña Orden (tiempo real por etapa). */
  const [ordenWorkByProject, setOrdenWorkByProject] = useState<Map<string, BodegaWorkIntervalRow[]>>(
    () => new Map(),
  )
  const [ordenPieceIntervalsByProject, setOrdenPieceIntervalsByProject] = useState<
    Map<string, BodegaPieceIntervalRow[]>
  >(() => new Map())
  const [ordenTimesLoading, setOrdenTimesLoading] = useState(false)
  const [ordenDetalleOcKey, setOrdenDetalleOcKey] = useState<string | null>(null)
  const [ordenInfoModalOpen, setOrdenInfoModalOpen] = useState(false)
  const [ordenTablaFiltro, setOrdenTablaFiltro] = useState<'cerradas' | 'curso' | 'todas'>('cerradas')
  const [ordenEstadisticasOpen, setOrdenEstadisticasOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createFolio, setCreateFolio] = useState('')
  const [createOrden, setCreateOrden] = useState('')
  const [createOrdenCompraId, setCreateOrdenCompraId] = useState('')
  const [createCliente, setCreateCliente] = useState('')
  const [createEmpresa, setCreateEmpresa] = useState('')
  const [createNombre, setCreateNombre] = useState('')
  const [createStatus, setCreateStatus] = useState<ProjectStatus>('en_diseno')
  const [createBusy, setCreateBusy] = useState(false)

  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadNumero, setUploadNumero] = useState('')
  const [uploadFecha, setUploadFecha] = useState(() => new Date().toISOString().slice(0, 10))
  const [uploadEmpresaId, setUploadEmpresaId] = useState('')
  const [uploadRequisitorId, setUploadRequisitorId] = useState('')
  const [uploadBusy, setUploadBusy] = useState(false)
  const [uploadPdfParsing, setUploadPdfParsing] = useState(false)
  const [uploadPdfNote, setUploadPdfNote] = useState<string | null>(null)
  const [uploadEmpresaPdfText, setUploadEmpresaPdfText] = useState('')
  const [uploadRequisitorPdfText, setUploadRequisitorPdfText] = useState('')
  const [uploadCotizacionLineas, setUploadCotizacionLineas] = useState<string[]>([])
  const [empresaOpts, setEmpresaOpts] = useState<CatalogOpt[]>([])
  const [requisitorOpts, setRequisitorOpts] = useState<CatalogOpt[]>([])
  const [editOcModal, setEditOcModal] = useState<OrdenCompraRow | null>(null)
  const [linkOcProject, setLinkOcProject] = useState<BodegaProjectRow | null>(null)
  /** Si la BD no tiene `bodega_projects.orden_compra_id` (falta migración), el API devuelve 400 al pedirla. */
  const [ocLinkColumnMissing, setOcLinkColumnMissing] = useState(false)
  const ordenCompraColumnAvailableRef = useRef(true)
  const cotizacionLineaIdxAvailableRef = useRef(true)
  /** Si no hay columna `prioridad_nivel` ni booleano `prioridad`, no se puede guardar nivel. */
  const prioridadNivelColumnAvailableRef = useRef(true)
  const prioridadLegacyColumnAvailableRef = useRef(true)
  const [prioridadDbAvailable, setPrioridadDbAvailable] = useState(true)
  const canTogglePrioridad = canSetProjectPrioridad && prioridadDbAvailable

  const projectCountByOc = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of rows) {
      if (!r.orden_compra_id) continue
      m.set(r.orden_compra_id, (m.get(r.orden_compra_id) ?? 0) + 1)
    }
    return m
  }, [rows])

  const designEntregaVersions = useMemo(() => {
    return designVersions
      .filter((v) => (v.package_category ?? 'entrega_diseno') === 'entrega_diseno')
      .slice()
      .sort((a, b) => b.version - a.version)
  }, [designVersions])

  const approvedDesignEntregaVersionsList = useMemo(
    () => approvedDesignEntregaVersions(designEntregaVersions),
    [designEntregaVersions],
  )

  const approvedDesignZipSummaryInfo = useMemo(
    () => approvedDesignZipSummary(approvedDesignEntregaVersionsList),
    [approvedDesignEntregaVersionsList],
  )

  const approvedDesignVersionsKey = useMemo(
    () =>
      approvedDesignEntregaVersionsList
        .map((v) => `${v.id}:${v.zip_storage_path}:${v.version}`)
        .join('|'),
    [approvedDesignEntregaVersionsList],
  )

  const pendingDesignReviewVersion = useMemo(
    () => nextDesignVersionPendingReview(designEntregaVersions),
    [designEntregaVersions],
  )

  const primaryApprovedDesignVersion = useMemo(() => {
    const list = approvedDesignEntregaVersionsList
    return list.length > 0 ? list[list.length - 1]! : null
  }, [approvedDesignEntregaVersionsList])

  const confirmedFolderKeysForApproved = useMemo(() => {
    if (!primaryApprovedDesignVersion) return new Set<string>()
    return confirmedFolderKeySetForVersion(confirmedFolders, primaryApprovedDesignVersion.id)
  }, [confirmedFolders, primaryApprovedDesignVersion])

  const effectiveDesignZipPaths = useMemo(
    () => filterPathsToConfirmedFolders(designZipPaths, confirmedFolderKeysForApproved),
    [designZipPaths, confirmedFolderKeysForApproved],
  )

  const destinosDesignPaths = useMemo(() => {
    const fromDesign = filterSwPartZipPaths(designZipPaths)
    const fromPending = filterSwPartZipPaths(pendingReviewPaths)
    const fromPieces = projectPieces
      .map((p) => p.source_path)
      .filter((p): p is string => Boolean(p && filterSwPartZipPaths([p]).length > 0))
    const seen = new Set<string>()
    const out: string[] = []
    for (const p of [...fromDesign, ...fromPending, ...fromPieces]) {
      const key = p.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(p)
    }
    return out
  }, [designZipPaths, pendingReviewPaths, projectPieces])

  const confirmedFolderKeysForPanel = useMemo(() => {
    const versionId = pendingDesignReviewVersion?.id ?? primaryApprovedDesignVersion?.id
    if (!versionId) return new Set<string>()
    return confirmedFolderKeySetForVersion(confirmedFolders, versionId)
  }, [confirmedFolders, pendingDesignReviewVersion?.id, primaryApprovedDesignVersion?.id])

  const step3FolderStatus = useMemo(
    () => computeStep3FolderConfirmStatus(designZipPaths, confirmedFolderKeysForApproved),
    [designZipPaths, confirmedFolderKeysForApproved],
  )

  const latestProgrammingDelivery = useMemo(() => {
    return (
      machineVersions
        .filter((v) => v.cnc_module === 'programacion' && v.status !== 'requiere_cambios')
        .sort((a, b) => b.version - a.version)[0] ?? null
    )
  }, [machineVersions])

  const programmingXtVersion = useMemo(() => {
    if (isXtDesignVersion(pendingDesignReviewVersion)) return pendingDesignReviewVersion
    if (isXtDesignVersion(primaryApprovedDesignVersion)) return primaryApprovedDesignVersion
    return primaryApprovedDesignVersion
  }, [primaryApprovedDesignVersion, pendingDesignReviewVersion])

  const clienteInfoVersions = useMemo(() => {
    return designVersions
      .filter((v) => v.package_category === 'info_cliente')
      .slice()
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }, [designVersions])

  const workMinutesByLane = useMemo(
    () => aggregateBusinessMinutesByLane(workIntervals, new Date()),
    [workIntervals],
  )

  const programmingRoutesLocked = Boolean(pieceFlowMeta?.programming_routes_confirmed_at)

  const cncModuleTabsVisible = useMemo((): CncModuleKind[] => {
    if (programmingRoutesLocked && canUploadBodegaMachine(props.role)) {
      return programmerCncModulesWithPieces(projectPieces).filter(
        (m): m is 'programacion' | 'torno' => m === 'programacion' || m === 'torno',
      )
    }
    return ['programacion', 'torno', 'perfilado']
  }, [programmingRoutesLocked, projectPieces, props.role])

  const projectClosureProgress = useMemo(
    () => computeProjectPieceClosureProgress(projectPieces, piecePhotos),
    [projectPieces, piecePhotos],
  )

  const projectPipelineDisplay = useMemo(() => {
    if (!designModalProject || !projectUsesOperationalPipeline(designModalProject.status)) return null
    return computeProjectPipelineDisplay({
      pieces: projectPieces,
      intervals: pieceIntervals,
      photos: piecePhotos,
      routesConfirmed: programmingRoutesLocked,
    })
  }, [
    designModalProject,
    projectPieces,
    pieceIntervals,
    piecePhotos,
    programmingRoutesLocked,
  ])

  const deliveryTimesTicking =
    workIntervals.some((r) => r.ended_at == null) || pieceIntervals.some((r) => r.ended_at == null)
  const deliveryTimesNow = useLiveClockTick(Boolean(designModalProject) && deliveryTimesTicking)

  const projectDeliveryTimes = useMemo(() => {
    if (!designModalProject) return null
    return computeProjectOrdenTimes({
      workIntervals,
      pieceIntervals,
      nowRef: deliveryTimesNow,
    })
  }, [designModalProject, workIntervals, pieceIntervals, deliveryTimesNow])

  const lanesForDeliveryTab = LANES_BY_DELIVERY_TAB[deliveryTab]

  const loadCatalogs = useCallback(async () => {
    const sb = getSupabase()
    const [e, r] = await Promise.all([
      sb.from('empresas').select('id,nombre').order('nombre'),
      sb.from('requisitores').select('id,nombre').order('nombre'),
    ])
    if (!e.error) setEmpresaOpts((e.data as CatalogOpt[]) ?? [])
    if (!r.error) setRequisitorOpts((r.data as CatalogOpt[]) ?? [])
  }, [])

  const loadProjectDeliveries = useCallback(async (projectId: string) => {
    setDesignLoading(true)
    try {
      const settled = await Promise.allSettled([
        fetchDesignVersions(projectId),
        fetchProjectActivity(projectId, 200),
        fetchPiecePhotos(projectId),
        fetchWorkIntervals(projectId),
        fetchDesignConfirmedFolders(projectId),
        fetchMachineVersions(projectId),
      ])
      if (settled[0].status === 'rejected') {
        throw settled[0].reason
      }
      setDesignVersions(settled[0].value)
      if (settled[1].status === 'fulfilled') {
        setDesignActivity(settled[1].value)
      } else {
        setDesignActivity([])
      }
      if (settled[2].status === 'fulfilled') {
        setPiecePhotos(settled[2].value)
        setBodegaNotice((prev) =>
          prev && prev.startsWith('No se cargó la galería de fotos') ? null : prev,
        )
      } else {
        setPiecePhotos([])
        setBodegaNotice(
          settled[2].reason instanceof Error
            ? `No se cargó la galería de fotos: ${settled[2].reason.message}`
            : 'No se cargó la galería de fotos (revisa permisos RLS o la conexión).',
        )
      }
      if (settled[3].status === 'fulfilled') {
        setWorkIntervals(settled[3].value)
      } else {
        setWorkIntervals([])
      }
      if (settled[4].status === 'fulfilled') {
        setConfirmedFolders(settled[4].value)
      } else {
        setConfirmedFolders([])
      }
      if (settled[5].status === 'fulfilled') {
        setMachineVersions(settled[5].value)
      } else {
        setMachineVersions([])
      }

      try {
        const [pieces, meta, maquinado, intervals] = await Promise.all([
          fetchProjectPieces(projectId),
          fetchProjectPieceFlowMeta(projectId),
          fetchProjectMaquinadoQueue(projectId),
          fetchPieceIntervalsForProject(projectId),
        ])
        setProjectPieces(pieces)
        setPieceFlowMeta(meta)
        setMaquinadoQueue(maquinado)
        setPieceIntervals(intervals)
      } catch {
        setProjectPieces([])
        setPieceFlowMeta(null)
        setMaquinadoQueue([])
        setPieceIntervals([])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar entregas del proyecto')
      setDesignVersions([])
      setPiecePhotos([])
      setDesignActivity([])
      setWorkIntervals([])
      setConfirmedFolders([])
      setMachineVersions([])
      setProjectPieces([])
      setPieceFlowMeta(null)
      setMaquinadoQueue([])
      setPieceIntervals([])
    } finally {
      setDesignLoading(false)
    }
  }, [])

  const refreshProjectActivity = useCallback(async (projectId: string) => {
    try {
      const activity = await fetchProjectActivity(projectId, 200)
      setDesignActivity(activity)
    } catch {
      /* mantener historial visible si falla el refresco */
    }
  }, [])

  async function maybeStartDesignClockForViewer(project: BodegaProjectRow) {
    if (props.role !== 'disenadora') return
    const st = project.status
    if (!['pendiente', 'en_diseno', 'modificacion_diseno', 'diseno_parcial'].includes(st)) return
    try {
      await startWorkInterval(project.id, 'diseno')
      const iv = await fetchWorkIntervals(project.id)
      setWorkIntervals(iv)
    } catch {
      /* reloj idempotente; si falla no bloquea el panel */
    }
  }

  async function maybeStartProgrammingClockForViewer(project: BodegaProjectRow) {
    if (props.role !== 'programadora_maquinaria') return
    const st = project.status
    if (
      ![
        'revision_diseno',
        'diseno_aprobado',
        'diseno_parcial',
        'en_programacion',
        'revision_programacion',
      ].includes(st)
    ) {
      return
    }
    try {
      const pieces = await fetchProjectPieces(project.id)
      const pending = piecesPendingInCncModule(pieces, 'programacion')
      if (pending.length === 0) {
        // Programación ya cerrada: no reabrir el reloj al entrar al proyecto.
        await closeProgrammingOfficeClockIfComplete({ projectId: project.id, pieces })
        const iv = await fetchWorkIntervals(project.id)
        setWorkIntervals(iv)
        return
      }
      await startWorkInterval(project.id, 'cnc_programacion')
      const iv = await fetchWorkIntervals(project.id)
      setWorkIntervals(iv)
    } catch {
      /* reloj idempotente; si falla no bloquea el panel */
    }
  }

  async function openDesignModal(
    row: BodegaProjectRow,
    tab: BodegaDeliveryTabId = 'diseno',
    opts?: { cncModuleTab?: CncModuleKind; preserveTab?: boolean },
  ) {
    const allowed = projectDeliveryTabsForRole(props.role, isBodegaSupervisorFull)
    let preferredTab: BodegaDeliveryTabId = tab
    const uid = (await getSupabase().auth.getUser()).data.user?.id
    // Al reabrir el mismo proyecto (o restaurar sesión), conservar la pestaña guardada.
    if (tab === 'diseno' || opts?.preserveTab) {
      const stored = uid ? readStoredBodegaDeliveryWorkspace(uid) : null
      if (stored?.projectId === row.id && allowed.some(([id]) => id === stored.tab)) {
        preferredTab = stored.tab as BodegaDeliveryTabId
        if (!opts?.cncModuleTab && stored.cncModuleTab) {
          opts = { ...opts, cncModuleTab: stored.cncModuleTab }
        }
      }
    }
    const initialTab = allowed.some(([id]) => id === preferredTab)
      ? preferredTab
      : (allowed[0]?.[0] ?? 'diseno')
    if (opts?.preserveTab) {
      skipProgrammerAutoTabOnceRef.current = true
      programmerCncAutoTabRef.current = row.id
    }
    setDesignModalProject(row)
    setDesignModalProjectInfoOpen(false)
    setProgrammingFullscreenOpen(false)
    setCncModuleTab(opts?.cncModuleTab ?? 'programacion')
    setDeliveryTab(initialTab)
    setDesignCommentDraft('')
    setBodegaNotice(null)
    setManualAvanceInput(String(Math.min(100, Math.max(0, Number(row.avance_pct) || 0))))
    if (uid) {
      writeStoredBodegaDeliveryWorkspace(uid, {
        projectId: row.id,
        tab: initialTab,
        cncModuleTab: opts?.cncModuleTab ?? 'programacion',
      })
    }
    await loadProjectDeliveries(row.id)
    await maybeStartDesignClockForViewer(row)
    await maybeStartProgrammingClockForViewer(row)
  }

  function closeDesignModal() {
    setBodegaNotice(null)
    setProgrammingFullscreenOpen(false)
    setDesignModalProjectInfoOpen(false)
    setDesignModalProject(null)
    void (async () => {
      const uid = (await getSupabase().auth.getUser()).data.user?.id
      if (uid) clearStoredBodegaDeliveryWorkspace(uid)
    })()
  }

  useEffect(() => {
    if (!designModalProject) {
      designClockKeyRef.current = null
      cncClockKeyRef.current = null
      programmerCncAutoTabRef.current = null
    }
  }, [designModalProject])

  // Persistir proyecto + pestaña para no salir al cambiar de pantalla / recargar.
  useEffect(() => {
    if (!designModalProject) return
    let cancelled = false
    void (async () => {
      const uid = (await getSupabase().auth.getUser()).data.user?.id
      if (cancelled || !uid) return
      writeStoredBodegaDeliveryWorkspace(uid, {
        projectId: designModalProject.id,
        tab: deliveryTab,
        cncModuleTab,
      })
    })()
    return () => {
      cancelled = true
    }
  }, [designModalProject?.id, deliveryTab, cncModuleTab])

  // Al montar / volver: restaurar el proyecto y la sección donde estabas.
  useEffect(() => {
    if (deliveryWorkspaceRestoredRef.current) return
    if (props.deliveryJumpRequest) return
    if (loading || designModalProject) return
    if (rows.length === 0) return
    deliveryWorkspaceRestoredRef.current = true
    let cancelled = false
    void (async () => {
      const uid = (await getSupabase().auth.getUser()).data.user?.id
      if (cancelled || !uid) return
      const stored = readStoredBodegaDeliveryWorkspace(uid)
      if (!stored) return
      const row = rows.find((r) => r.id === stored.projectId)
      if (!row) {
        clearStoredBodegaDeliveryWorkspace(uid)
        return
      }
      await openDesignModal(row, stored.tab as BodegaDeliveryTabId, {
        cncModuleTab: stored.cncModuleTab,
        preserveTab: true,
      })
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restore once when project list is ready
  }, [loading, rows, designModalProject, props.deliveryJumpRequest])

  useEffect(() => {
    props.onProjectDeliveryScreenOpen?.(designModalProject != null)
    return () => props.onProjectDeliveryScreenOpen?.(false)
  }, [designModalProject, props.onProjectDeliveryScreenOpen])

  useEffect(() => {
    if (!designModalProject) return
    const pid = designModalProject.id
    if (!programmingRoutesLocked || !canUploadBodegaMachine(props.role)) return
    if (skipProgrammerAutoTabOnceRef.current) {
      skipProgrammerAutoTabOnceRef.current = false
      programmerCncAutoTabRef.current = pid
      return
    }
    if (programmerCncAutoTabRef.current === pid) return
    programmerCncAutoTabRef.current = pid
    const modules = programmerCncModulesWithPieces(projectPieces)
    setDeliveryTab('cnc')
    if (modules.length > 0) setCncModuleTab(modules[0]!)
  }, [designModalProject?.id, programmingRoutesLocked, projectPieces, props.role])

  useEffect(() => {
    if (deliveryTab !== 'diseno') designClockKeyRef.current = null
    if (deliveryTab !== 'cnc') cncClockKeyRef.current = null
  }, [deliveryTab])

  useEffect(() => {
    if (!designModalProject || approvedDesignEntregaVersionsList.length === 0) {
      setDesignZipPaths([])
      setDesignZipPathsError(null)
      setDesignZipPathsLoading(false)
      return
    }
    const st = designModalProject.status
    if (!['diseno_aprobado', 'diseno_parcial', 'en_programacion', 'revision_programacion'].includes(st)) {
      setDesignZipPaths([])
      setDesignZipPathsError(null)
      return
    }
    let cancelled = false
    setDesignZipPathsLoading(true)
    setDesignZipPathsError(null)

    void (async () => {
      try {
        const paths = await resolveApprovedDesignEntregaEntryPaths(approvedDesignEntregaVersionsList)
        if (!cancelled) setDesignZipPaths(paths)
      } catch (e) {
        if (!cancelled) {
          setDesignZipPaths([])
          setDesignZipPathsError(e instanceof Error ? e.message : 'No se cargó la carpeta de diseño')
        }
      } finally {
        if (!cancelled) setDesignZipPathsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [designModalProject?.id, designModalProject?.status, approvedDesignVersionsKey])

  useEffect(() => {
    if (!designModalProject || !pendingDesignReviewVersion) {
      setPendingReviewPaths([])
      setPendingReviewPathsLoading(false)
      return
    }
    let cancelled = false
    setPendingReviewPathsLoading(true)
    void (async () => {
      try {
        const paths = await resolveDesignVersionEntryPaths(pendingDesignReviewVersion)
        if (!cancelled) setPendingReviewPaths(paths)
      } catch {
        if (!cancelled) setPendingReviewPaths([])
      } finally {
        if (!cancelled) setPendingReviewPathsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [
    designModalProject?.id,
    designModalProject?.status,
    pendingDesignReviewVersion?.id,
    pendingDesignReviewVersion?.zip_storage_path,
    pendingDesignReviewVersion?.manifest,
  ])

  useEffect(() => {
    if (!designModalProject) return
    const xtReady =
      isXtDesignVersion(primaryApprovedDesignVersion) || isXtDesignVersion(pendingDesignReviewVersion)
    if (!xtReady) return
    const paths = destinosDesignPaths
    if (paths.length === 0) return
    let cancelled = false
    void (async () => {
      try {
        const sync = await syncProjectPiecesFromDesignPathsDetailed(designModalProject.id, paths, {
          swPartOnly: true,
        })
        if (cancelled || sync.added === 0) return
        const pieces = await fetchProjectPieces(designModalProject.id)
        if (!cancelled) setProjectPieces(pieces)
      } catch {
        /* la asignación aún puede usar las rutas del ensamble */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [
    designModalProject?.id,
    primaryApprovedDesignVersion?.id,
    pendingDesignReviewVersion?.id,
    destinosDesignPaths,
  ])

  useEffect(() => {
    if (!programmingRoutesLocked || !canUploadBodegaMachine(props.role)) return
    if (cncModuleTab === 'perfilado') return
    const modules = programmerCncModulesWithPieces(projectPieces)
    if (modules.length > 0 && !modules.includes(cncModuleTab as 'programacion' | 'torno')) {
      setCncModuleTab(modules[0]!)
    }
  }, [programmingRoutesLocked, projectPieces, cncModuleTab, props.role])

  useEffect(() => {
    if (!designModalProject || deliveryTab !== 'cnc') return
    if (props.role !== 'programadora_maquinaria') return
    if (!step3FolderStatus.complete) return
    const pendingProg = piecesPendingInCncModule(projectPieces, 'programacion')
    if (pendingProg.length === 0) return
    const lane: BodegaWorkIntervalLane = 'cnc_programacion'
    const key = `${designModalProject.id}:${lane}:delivery`
    if (cncClockKeyRef.current === key) return
    cncClockKeyRef.current = key
    void (async () => {
      try {
        await startWorkInterval(designModalProject.id, lane)
        const iv = await fetchWorkIntervals(designModalProject.id)
        setWorkIntervals(iv)
      } catch {
        cncClockKeyRef.current = null
      }
    })()
  }, [
    designModalProject?.id,
    deliveryTab,
    props.role,
    step3FolderStatus.complete,
    projectPieces,
  ])

  useEffect(() => {
    if (!designModalProject || deliveryTab !== 'cnc') return
    if (props.role !== 'programadora_maquinaria') return
    if (!programmingRoutesLocked) return
    const pendingProg = piecesPendingInCncModule(projectPieces, 'programacion')
    if (pendingProg.length === 0) return
    const lane: BodegaWorkIntervalLane =
      cncModuleTab === 'torno' ? 'cnc_torno' : 'cnc_programacion'
    const key = `${designModalProject.id}:${lane}:routes`
    if (cncClockKeyRef.current === key) return
    cncClockKeyRef.current = key
    void (async () => {
      try {
        await startWorkInterval(designModalProject.id, lane)
        const iv = await fetchWorkIntervals(designModalProject.id)
        setWorkIntervals(iv)
      } catch {
        cncClockKeyRef.current = null
      }
    })()
  }, [designModalProject?.id, deliveryTab, cncModuleTab, props.role, programmingRoutesLocked, projectPieces])

  /** Cuando ya no hay piezas CNC por programar, cierra el reloj de oficina (y no lo reabre). */
  useEffect(() => {
    if (!designModalProject) return
    if (props.role !== 'programadora_maquinaria' && !canManageBodegaLikeAdmin(props.role)) return
    if (projectPieces.length === 0) return
    const pendingProg = piecesPendingInCncModule(projectPieces, 'programacion')
    if (pendingProg.length > 0) return
    const hasOpen = workIntervals.some(
      (r) => (r.lane === 'cnc_programacion' || r.lane === 'cnc_torno') && !r.ended_at,
    )
    if (!hasOpen) {
      cncClockKeyRef.current = null
      return
    }
    const pid = designModalProject.id
    let cancelled = false
    void (async () => {
      try {
        await closeProgrammingOfficeClockIfComplete({ projectId: pid, pieces: projectPieces })
        if (cancelled) return
        cncClockKeyRef.current = null
        const iv = await fetchWorkIntervals(pid)
        if (!cancelled) setWorkIntervals(iv)
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [
    designModalProject?.id,
    projectPieces,
    workIntervals,
    props.role,
  ])

  async function onDesignDestinosConfirmed() {
    const pid = designModalProject!.id
    await loadProjectDeliveries(pid)
    const pieces = await fetchProjectPieces(pid)
    const meta = await fetchProjectPieceFlowMeta(pid)
    setProjectPieces(pieces)
    setPieceFlowMeta(meta)
    const cnc = piecesForCncModule(pieces, 'programacion')
    setCncModuleTab(cnc.length > 0 ? 'programacion' : 'programacion')
    if (cnc.length > 0) {
      setDeliveryTab('cnc')
      setBodegaNotice('Destinos confirmados. Programación solo recibe CNC; torno y perfiladora salen sin tiempo.')
    } else {
      setBodegaNotice('Destinos confirmados. No hay piezas CNC; torno, perfiladora y accesorios salen sin tiempo.')
    }
  }

  useEffect(() => {
    const j = props.deliveryJumpRequest
    const onDone = props.onDeliveryJumpConsumed
    if (!j || !onDone) {
      deliveryJumpHandledKeyRef.current = null
      return
    }
    const key = `${j.projectId}:${j.tab}`
    const row = rows.find((r) => r.id === j.projectId)
    if (!row) return
    if (deliveryJumpHandledKeyRef.current === key) return
    deliveryJumpHandledKeyRef.current = key
    void (async () => {
      try {
        await openDesignModal(row, j.tab)
      } finally {
        onDone()
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- salto único cuando existen filas; onDone estable vía useCallback en App
  }, [rows, props.deliveryJumpRequest?.projectId, props.deliveryJumpRequest?.tab])

  async function downloadDesignZip(v: ProjectDesignVersionRow) {
    const url = await createSignedUrlForDesignZip(v.zip_storage_path)
    if (url) window.open(url, '_blank', 'noopener,noreferrer')
    else setError('No se pudo generar el enlace de descarga.')
  }

  async function executeDesignZipUpload(file: File, planos: File[] = []) {
    if (!designModalProject) return
    if (!canUploadDesign) return
    setDesignUploadBusy(true)
    setDesignUploadPhase('Subiendo entrega…')
    setError(null)
    const st = designModalProject.status
    const entregaRows = designVersions.filter((x) => (x.package_category ?? 'entrega_diseno') === 'entrega_diseno')
    const esCorreccionUpload =
      st === 'modificacion_diseno' ||
      st === 'diseno_parcial' ||
      entregaRows.some((x) => x.status === 'requiere_cambios')
    try {
      await runDesignZipUpload({
        project: {
          id: designModalProject.id,
          folio: designModalProject.folio,
          status: designModalProject.status,
        },
        file,
        comment: designCommentDraft.trim() || null,
        existingDesignVersions: designVersions.filter(
          (x) => (x.package_category ?? 'entrega_diseno') === 'entrega_diseno',
        ),
        uploaderRole: props.role,
        onPhase: (p) => setDesignUploadPhase(p),
        uploadOrigin: 'bodega_entregas',
      })

      let planoNotice = ''
      if (isXtDesignFile(file) && planos.length > 0) {
        setDesignUploadPhase('Vinculando planos…')
        const parsed = await parseXtFile(file)
        const pieceNames = parsed.pieces.map((p) => p.name)
        const auto = await applyDesignPlanosAutoAssign({
          projectId: designModalProject.id,
          projectFolio: designModalProject.folio,
          pieceNames,
          planos,
          onPhase: (p) => setDesignUploadPhase(p),
        })
        const parts: string[] = []
        if (auto.linked.length > 0) {
          parts.push(`${auto.linked.length} plano(s) vinculados a piezas`)
        }
        if (auto.unmatched.length > 0) {
          parts.push(`sin coincidencia: ${auto.unmatched.join(', ')}`)
        }
        if (parts.length > 0) planoNotice = ` ${parts.join('. ')}.`
      }

      await refreshModalProjectFromServer(designModalProject.id)
      await loadProjectDeliveries(designModalProject.id)
      setDesignCommentDraft('')
      setBodegaNotice(
        (esCorreccionUpload
          ? 'Corrección entregada. El reloj de esta ronda se pausó; el supervisor revisará las piezas del .x_t.'
          : 'Ensamble .x_t entregado. El reloj de diseño se pausó mientras el supervisor revisa.') + planoNotice,
      )
      props.onBodegaDeliveriesChanged?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo subir la entrega de diseño')
    } finally {
      setDesignUploadBusy(false)
      setDesignUploadPhase('')
    }
  }

  async function uploadDesignZip(file: File, planos: File[] = []) {
    if (!designModalProject) return
    if (!canUploadDesign) return
    if (isXtDesignFile(file)) {
      await executeDesignZipUpload(file, planos)
      return
    }
    setDesignUploadBusy(true)
    setDesignUploadPhase('Analizando ZIP…')
    setError(null)
    try {
      const analysis = await analyzeDesignZip(file)
      const paths = analysis.manifest.entryPaths ?? []
      const missing = findDesignZipPiecesMissingPlanos(paths)
      if (missing.length > 0) {
        setDesignZipMissingPlanosPending({ file, missing })
        setBodegaNotice(
          `Faltan planos PDF en ${missing.length} pieza(s). Revisa la ventana de confirmación para subir la carpeta o corregir el ZIP.`,
        )
        return
      }
      await executeDesignZipUpload(file)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo analizar la entrega de diseño')
    } finally {
      setDesignUploadBusy(false)
      setDesignUploadPhase('')
    }
  }

  function dismissDesignZipMissingPlanosModal() {
    if (designUploadBusy) return
    setDesignZipMissingPlanosPending(null)
  }

  function goAttachPlanosFromMissingZipModal() {
    if (designUploadBusy) return
    setDesignZipMissingPlanosPending(null)
    setDeliveryTab('diseno')
    const hasExistingPieces = visibleDesignPieces(projectPieces, designZipPaths).some(
      (p) => p.source_path && isSwPartZipPath(p.source_path),
    )
    if (hasExistingPieces) {
      window.setTimeout(() => {
        document.getElementById('bodega-planos-pieza-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 150)
      setBodegaNotice('Adjunta el plano PDF a cada pieza en la sección «Planos adicionales por pieza».')
    } else {
      setBodegaNotice(
        'Agrega un PDF con el mismo nombre que cada pieza dentro de la carpeta, vuelve a comprimir el ZIP e intenta subir de nuevo.',
      )
    }
  }

  async function confirmDesignZipUploadDespiteMissingPlanos() {
    const pending = designZipMissingPlanosPending
    if (!pending || designUploadBusy) return
    setDesignZipMissingPlanosPending(null)
    await executeDesignZipUpload(pending.file)
  }

  async function confirmDesignFoldersForProject(args: {
    version: ProjectDesignVersionRow
    folderKeys: string[]
    comment?: string | null
    reject?: boolean
  }) {
    if (!designModalProject) return
    if (!canReviewDesign) return
    setDesignReviewBusy(true)
    setError(null)
    try {
      const result = await confirmDesignFolders({
        designVersionId: args.version.id,
        folderKeys: args.folderKeys,
        comment: args.comment,
        reject: args.reject,
      })

      await refreshModalProjectFromServer(designModalProject.id)
      await loadProjectDeliveries(designModalProject.id)

      if (args.reject) {
        setBodegaNotice('Entrega devuelta a la diseñadora.')
      } else {
        void notifyDesignerDesignEntregaConfirmada({
          projectId: designModalProject.id,
          designVersionId: args.version.id,
          filename: args.version.zip_filename,
          version: args.version.version,
        })
        const paths = await resolveDesignVersionEntryPaths(args.version)
        const folderRows = await fetchDesignConfirmedFolders(designModalProject.id)
        const keys = confirmedFolderKeySetForVersion(folderRows, args.version.id)
        const st3 = computeStep3FolderConfirmStatus(paths, keys)
        if (st3.complete) {
          if (result.projectStatus === 'diseno_aprobado' || designModalProject.status === 'diseno_aprobado') {
            await supervisorSetProjectStatus({
              projectId: designModalProject.id,
              status: 'en_programacion',
            })
          }
          await refreshModalProjectFromServer(designModalProject.id)
          setBodegaNotice('Todas las carpetas confirmadas. Proyecto en programación. Se avisó a la diseñadora.')
        } else {
          setBodegaNotice(`Carpetas confirmadas (${result.confirmedCount}). Faltan ${st3.totalFolders - st3.confirmedCount}. Se avisó a la diseñadora.`)
        }
      }
      props.onBodegaDeliveriesChanged?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se confirmaron las carpetas')
    } finally {
      setDesignReviewBusy(false)
    }
  }

  async function uploadProgrammingDelivery(file: File, comment: string | null) {
    if (!designModalProject) throw new Error('Proyecto no disponible.')
    if (!canUploadBodegaMachine(props.role) && !canManageBodegaLikeAdmin(props.role)) {
      throw new Error('Sin permiso para subir programación.')
    }
    setProgrammingUploadBusy(true)
    setProgrammingUploadPhase(null)
    setError(null)
    try {
      const { piecesAdded } = await runProgrammingDeliveryUpload({
        project: designModalProject,
        file,
        comment,
        uploaderRole: props.role,
        onPhase: setProgrammingUploadPhase,
      })
      await refreshModalProjectFromServer(designModalProject.id)
      await loadProjectDeliveries(designModalProject.id)
      setBodegaNotice(
        piecesAdded > 0
          ? `Entrega de programación registrada: ${piecesAdded} pieza(s) en producción.`
          : 'Entrega de programación registrada (sin piezas nuevas).',
      )
      props.onBodegaDeliveriesChanged?.()
    } finally {
      setProgrammingUploadBusy(false)
      setProgrammingUploadPhase(null)
    }
  }

  async function uploadPiecePhotosCore(pieceIds: string[], files: File[]) {
    if (!designModalProject || !files.length || pieceIds.length === 0) return
    if (!canUploadPiecePhotos) return
    setPhotoUploadBusy(true)
    setError(null)
    try {
      const sb = getSupabase()
      await refreshSessionBeforeStorageUpload(sb)
      const folio = designModalProject.folio
      let skippedNonImage = 0
      let uploadedCount = 0
      let piecesTouched = 0
      for (const pieceId of pieceIds) {
        const piece = projectPieces.find((p) => p.id === pieceId)
        if (!piece) continue
        let pieceUploaded = 0
        for (const file of files) {
          if (!isImageLikeFile(file)) {
            skippedNonImage += 1
            continue
          }
          const safeName = sanitizeStorageFileName(file.name)
          const path = `${folio}/evidencias/piezas/${pieceId}/${crypto.randomUUID()}-${safeName}`
          const ct = guessImageContentType(file)
          await uploadBodegaProyectosBinary(sb, BODEGA_PROYECTOS_BUCKET, path, file, ct)
          uploadedCount += 1
          pieceUploaded += 1
          await insertPiecePhoto({
            projectId: designModalProject.id,
            pieceId,
            storagePath: path,
            filename: file.name,
          })
          await insertProjectActivity({
            projectId: designModalProject.id,
            type: 'piece_photo_uploaded',
            payload: { filename: file.name, piece_id: pieceId, piece_label: piece.label },
          })
        }
        if (pieceUploaded > 0) piecesTouched += 1
      }
      if (uploadedCount === 0) {
        throw new Error(
          skippedNonImage > 0
            ? 'Ningún archivo se reconoció como imagen (usa JPG, PNG, WEBP, HEIC, etc.).'
            : 'No se seleccionaron archivos para subir.',
        )
      }
      if (pieceIds.length === 1) {
        const piece = projectPieces.find((p) => p.id === pieceIds[0])
        setBodegaNotice(`Se subieron ${uploadedCount} foto(s) a ${piece?.label ?? 'la pieza'}.`)
      } else {
        setBodegaNotice(
          `Se subieron ${uploadedCount} foto(s) en ${piecesTouched} pieza${piecesTouched === 1 ? '' : 's'}.`,
        )
      }
      await refreshModalProjectFromServer(designModalProject.id)
      await loadProjectDeliveries(designModalProject.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo subir la(s) imagen(es)')
    } finally {
      setPhotoUploadBusy(false)
    }
  }

  async function uploadPiecePhotosForPiece(pieceId: string, files: File[]) {
    await uploadPiecePhotosCore([pieceId], files)
  }

  async function uploadPiecePhotosForPieces(pieceIds: string[], files: File[]) {
    await uploadPiecePhotosCore(pieceIds, files)
  }

  async function onSupervisorFinalizeProject() {
    if (!designModalProject) return
    if (!canSupervisorFinalizeBodegaProject(props.role)) return
    setSupervisorFinalizeBusy(true)
    setError(null)
    try {
      await finalizeProjectBySupervisor(designModalProject.id)
      setBodegaNotice('Proyecto finalizado al 100%.')
      await refreshModalProjectFromServer(designModalProject.id)
      await loadProjectDeliveries(designModalProject.id)
      props.onBodegaDeliveriesChanged?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo finalizar el proyecto')
    } finally {
      setSupervisorFinalizeBusy(false)
    }
  }

  async function saveManualAvance() {
    if (!designModalProject || !canSetManualBodegaProjectAvance(props.role)) return
    const pct = Math.round(Number(manualAvanceInput.trim()))
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      setError('Indica un porcentaje entero entre 0 y 100.')
      return
    }
    setManualAvanceBusy(true)
    setError(null)
    try {
      await setProjectAvanceManual({
        projectId: designModalProject.id,
        avancePct: pct,
        comment: designCommentDraft.trim() || null,
      })
      setManualAvanceInput(String(pct))
      setDesignCommentDraft('')
      setBodegaNotice('Avance manual guardado (queda en historial).')
      await refreshModalProjectFromServer(designModalProject.id)
      await refreshProjectActivity(designModalProject.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el avance')
    } finally {
      setManualAvanceBusy(false)
    }
  }

  async function saveDesignCommentNote() {
    if (!designModalProject) return
    if (!canSaveBodegaProjectNote(props.role)) return
    const text = designCommentDraft.trim()
    if (!text) {
      setError('Escribe una nota antes de guardar.')
      return
    }
    setCommentSaveBusy(true)
    setError(null)
    try {
      await saveProjectNote(designModalProject.id, text)
      setDesignCommentDraft('')
      setBodegaNotice('Nota guardada. Visible en el historial del proyecto.')
      await refreshProjectActivity(designModalProject.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar la nota')
    } finally {
      setCommentSaveBusy(false)
    }
  }

  async function onProgramadoraSolicitaCierre() {
    if (!designModalProject) return
    if (!canUploadMachine) return
    setClosureBusy(true)
    setError(null)
    try {
      await programadoraSolicitaCierreRevision(designModalProject.id)
      await refreshModalProjectFromServer(designModalProject.id)
      await loadProjectDeliveries(designModalProject.id)
      setBodegaNotice('Listo: se solicitó revisión de cierre al supervisor.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo solicitar revisión de cierre')
    } finally {
      setClosureBusy(false)
    }
  }

  async function onSupervisorSetProjectStatus(next: ProjectStatus) {
    if (!designModalProject) return
    if (!canReviewDesign) return
    setSupervisorStatusBusy(true)
    setError(null)
    try {
      await supervisorSetProjectStatus({
        projectId: designModalProject.id,
        status: next,
        comment: designCommentDraft.trim() || null,
      })
      await refreshModalProjectFromServer(designModalProject.id)
      await loadProjectDeliveries(designModalProject.id)
      setDesignCommentDraft('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo actualizar el estado')
    } finally {
      setSupervisorStatusBusy(false)
    }
  }

  async function openDeliveriesForOcPdfPartida(oc: OrdenCompraRow, lineNo: number) {
    const busyK = `${oc.id}:${lineNo}`
    const existing = rows.find(
      (r) => r.orden_compra_id === oc.id && r.cotizacion_linea_idx != null && r.cotizacion_linea_idx === lineNo,
    )
    if (existing) {
      await openDesignModal(existing)
      return
    }
    if (!canBulkFromOc) {
      setBodegaNotice(
        'Esta partida aún no tiene proyecto en la app. Un administrador o el supervisor de bodega debe pulsar «Archivos y entregas» aquí una vez para generar el proyecto desde el PDF, o crear el proyecto manualmente.',
      )
      return
    }
    setPdfPartidaBusyKey(busyK)
    setBodegaNotice(null)
    setError(null)
    try {
      await bulkCreateProjectsFromOcPdf(oc.id)
      const fresh = await load()
      if (!fresh) throw new Error('No se pudo recargar la lista de proyectos')
      const found = fresh.find(
        (r) => r.orden_compra_id === oc.id && r.cotizacion_linea_idx != null && r.cotizacion_linea_idx === lineNo,
      )
      if (!found) {
        if (!cotizacionLineaIdxAvailableRef.current) {
          setError(
            'Falta en Supabase la columna bodega_projects.cotizacion_linea_idx (vincular partidas del PDF). Ejecuta supabase/_archive/reference/schema_bodega_machine_evidence.sql y recarga la página.',
          )
          return
        }
        setBodegaNotice(
          `Tras generar desde el PDF, la partida ${lineNo} sigue sin proyecto en la app (¿línea vacía en la orden o error de datos?). Revisa la OC ${oc.numero}.`,
        )
        return
      }
      await openDesignModal(found)
    } catch (e: unknown) {
      const pe = e as { message?: string; details?: string; hint?: string }
      const parts = [pe.message, pe.details, pe.hint].filter(Boolean)
      setError(parts.length ? parts.join(' — ') : 'No se pudo crear o abrir el proyecto de esta partida')
    } finally {
      setPdfPartidaBusyKey(null)
    }
  }

  const load = useCallback(async (): Promise<BodegaProjectRow[] | undefined> => {
    setError(null)
    setLoading(true)
    try {
      const sb = getSupabase()
      let list: unknown[] = []
      /** En cada carga se intenta de nuevo por si ya aplicaron la migración en Supabase. */
      prioridadNivelColumnAvailableRef.current = true
      prioridadLegacyColumnAvailableRef.current = true

      for (let prioridadPass = 0; prioridadPass < 4; prioridadPass++) {
        const p = prioridadNivelColumnAvailableRef.current
          ? ', prioridad_nivel, prioridad'
          : prioridadLegacyColumnAvailableRef.current
            ? ', prioridad'
            : ''
        const selectWithOcLine =
          `id, folio, orden, orden_compra_id, cotizacion_linea_idx, cliente, empresa, nombre, status, avance_pct, fecha_inicio, fecha_termino${p}, created_at, updated_at`
        const selectWithOc =
          `id, folio, orden, orden_compra_id, cliente, empresa, nombre, status, avance_pct, fecha_inicio, fecha_termino${p}, created_at, updated_at`
        const selectBase =
          `id, folio, orden, cliente, empresa, nombre, status, avance_pct, fecha_inicio, fecha_termino${p}, created_at, updated_at`

        cotizacionLineaIdxAvailableRef.current = true
        ordenCompraColumnAvailableRef.current = true

        type ProjectsQueryRow = Record<string, unknown>
        let res: PostgrestSingleResponse<ProjectsQueryRow[]> = (await sb
          .from('bodega_projects')
          .select(selectWithOcLine)
          .order('created_at', { ascending: false })) as PostgrestSingleResponse<ProjectsQueryRow[]>
        let msg = [res.error?.message, res.error?.details, (res.error as { hint?: string } | null)?.hint]
          .filter(Boolean)
          .join(' ')

        if (res.error && /prioridad_nivel/i.test(msg) && /\bdoes not exist\b/i.test(msg)) {
          prioridadNivelColumnAvailableRef.current = false
          continue
        }
        if (res.error && /prioridad/i.test(msg) && /\bdoes not exist\b/i.test(msg)) {
          prioridadLegacyColumnAvailableRef.current = false
          continue
        }

        if (
          res.error &&
          (msg.includes('cotizacion_linea_idx') ||
            (/\bcolumn\b/i.test(msg) && /\bdoes not exist\b/i.test(msg) && /cotizacion_linea_idx/i.test(msg)))
        ) {
          cotizacionLineaIdxAvailableRef.current = false
          res = (await sb
            .from('bodega_projects')
            .select(selectWithOc)
            .order('created_at', { ascending: false })) as PostgrestSingleResponse<ProjectsQueryRow[]>
          msg = [res.error?.message, res.error?.details, (res.error as { hint?: string } | null)?.hint]
            .filter(Boolean)
            .join(' ')
        }

        if (res.error && /prioridad_nivel/i.test(msg) && /\bdoes not exist\b/i.test(msg)) {
          prioridadNivelColumnAvailableRef.current = false
          continue
        }
        if (res.error && /prioridad/i.test(msg) && /\bdoes not exist\b/i.test(msg)) {
          prioridadLegacyColumnAvailableRef.current = false
          continue
        }

        if (
          res.error &&
          (msg.includes('orden_compra_id') ||
            (/\bcolumn\b/i.test(msg) && /\bdoes not exist\b/i.test(msg) && /orden_compra_id/i.test(msg)))
        ) {
          ordenCompraColumnAvailableRef.current = false
          cotizacionLineaIdxAvailableRef.current = false
          setOcLinkColumnMissing(true)
          const base = await sb.from('bodega_projects').select(selectBase).order('created_at', { ascending: false })
          if (base.error) {
            const bm = [base.error.message, base.error.details, (base.error as { hint?: string }).hint]
              .filter(Boolean)
              .join(' ')
            if (/prioridad_nivel/i.test(bm) && /\bdoes not exist\b/i.test(bm)) {
              prioridadNivelColumnAvailableRef.current = false
              continue
            }
            if (/prioridad/i.test(bm) && /\bdoes not exist\b/i.test(bm)) {
              prioridadLegacyColumnAvailableRef.current = false
              continue
            }
            throw base.error
          }
          list = (base.data as unknown[]) ?? []
        } else {
          if (res.error) {
            if (/prioridad_nivel/i.test(msg) && /\bdoes not exist\b/i.test(msg)) {
              prioridadNivelColumnAvailableRef.current = false
              continue
            }
            if (/prioridad/i.test(msg) && /\bdoes not exist\b/i.test(msg)) {
              prioridadLegacyColumnAvailableRef.current = false
              continue
            }
            throw res.error
          }
          setOcLinkColumnMissing(false)
          list = (res.data as unknown[]) ?? []
        }
        break
      }

      const mapped: BodegaProjectRow[] = list.map((r) => {
          const rawLine = (r as { cotizacion_linea_idx?: unknown }).cotizacion_linea_idx
          const lineIdx =
            cotizacionLineaIdxAvailableRef.current && rawLine != null && String(rawLine).trim() !== ''
              ? Math.round(Number(rawLine))
              : null
          return {
            id: safeText((r as any).id),
            folio: safeText((r as any).folio),
            orden: (r as any).orden ?? null,
            orden_compra_id: ordenCompraColumnAvailableRef.current ? ((r as any).orden_compra_id ?? null) : null,
            cotizacion_linea_idx:
              cotizacionLineaIdxAvailableRef.current && lineIdx != null && Number.isFinite(lineIdx) ? lineIdx : null,
            cliente: safeText((r as any).cliente),
            empresa: (r as any).empresa ?? null,
            nombre: safeText((r as any).nombre),
            status: (safeText((r as any).status) as ProjectStatus) || 'pendiente',
            avance_pct: clampPct((r as any).avance_pct),
            fecha_inicio: safeText((r as any).fecha_inicio),
            fecha_termino:
              (r as any).fecha_termino != null && String((r as any).fecha_termino).trim() !== ''
                ? String((r as any).fecha_termino)
                : null,
            prioridadNivel:
              prioridadNivelColumnAvailableRef.current || prioridadLegacyColumnAvailableRef.current
                ? parsePrioridadFromRow({
                    prioridad_nivel: (r as { prioridad_nivel?: unknown }).prioridad_nivel,
                    prioridad: (r as { prioridad?: unknown }).prioridad,
                  })
                : 0,
            created_at: safeText((r as any).created_at),
            updated_at:
              (r as any).updated_at != null && String((r as any).updated_at).trim() !== ''
                ? String((r as any).updated_at)
                : null,
          }
        })

      setPrioridadDbAvailable(
        prioridadNivelColumnAvailableRef.current || prioridadLegacyColumnAvailableRef.current,
      )
      setRows(mapped)

      try {
        const o = await fetchOrdenesCompra()
        setOrdenes(o)
        setOrdenesOk(true)
      } catch {
        setOrdenes([])
        setOrdenesOk(false)
      }

      return mapped
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'No se pudo cargar Bodega'
      if (String(msg).toLowerCase().includes('relation') && String(msg).toLowerCase().includes('bodega_projects')) {
        setError('Falta crear las tablas de Bodega en Supabase. Ejecuta `supabase/schema_bodega.sql` y `supabase/policies_bodega.sql`.')
      } else {
        setError(msg)
      }
      setRows([])
      setOrdenes([])
      return undefined
    } finally {
      setLoading(false)
    }
  }, [])

  /** Recarga proyectos y actualiza la fila del modal (avance % / estado) sin cerrarlo. */
  const refreshModalProjectFromServer = useCallback(
    async (projectId: string) => {
      const fresh = await load()
      if (!fresh) return
      const u = fresh.find((r) => r.id === projectId)
      if (u) setDesignModalProject((prev) => (prev?.id === projectId ? u : prev))
    },
    [load],
  )

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (canOc) void loadCatalogs()
  }, [canOc, loadCatalogs])

  useEffect(() => {
    if (uploadOpen || editOcModal || linkOcProject) void loadCatalogs()
  }, [uploadOpen, editOcModal, linkOcProject, loadCatalogs])

  useEffect(() => {
    if (folder !== 'orden') {
      setOrdenDetalleOcKey(null)
      setOrdenInfoModalOpen(false)
      return
    }
    if (!rows.length) {
      setOrdenWorkByProject(new Map())
      setOrdenPieceIntervalsByProject(new Map())
      setOrdenTimesLoading(false)
      return
    }
    let cancelled = false
    setOrdenTimesLoading(true)
    const ids = rows.map((r) => r.id)
    void Promise.all([fetchWorkIntervalsForProjects(ids), fetchPieceIntervalsForProjects(ids)])
      .then(([workMap, pieceMap]) => {
        if (cancelled) return
        setOrdenWorkByProject(workMap)
        setOrdenPieceIntervalsByProject(pieceMap)
      })
      .catch(() => {
        if (!cancelled) {
          setOrdenWorkByProject(new Map())
          setOrdenPieceIntervalsByProject(new Map())
        }
      })
      .finally(() => {
        if (!cancelled) setOrdenTimesLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [folder, rows])

  const filteredProjects = useMemo(() => {
    const s = q.trim().toLowerCase()
    return rows.filter((r) => {
      if (filterOrdenCompraId && r.orden_compra_id !== filterOrdenCompraId) return false
      if (statusFilter !== 'all' && r.status !== statusFilter) return false
      if (!s) return true
      const oc = r.orden_compra_id ? ordenes.find((o) => o.id === r.orden_compra_id) : null
      const haystack =
        folder === 'cliente'
          ? `${r.nombre} ${r.cliente} ${r.empresa ?? ''} ${r.folio} ${r.orden ?? ''} ${oc?.numero ?? ''} ${oc?.empresa?.nombre ?? ''} ${oc?.requisitor?.nombre ?? ''}`
          : folder === 'orden'
            ? `${r.nombre} ${r.orden ?? ''} ${r.folio} ${r.cliente} ${r.empresa ?? ''} ${oc?.numero ?? ''} ${oc?.empresa?.nombre ?? ''} ${oc?.requisitor?.nombre ?? ''}`
            : folder === 'proyecto'
              ? `${r.nombre} ${r.folio} ${oc?.numero ?? ''} ${r.orden ?? ''} ${r.cliente} ${r.empresa ?? ''}`
              : `${r.folio} ${r.orden ?? ''} ${r.cliente} ${r.empresa ?? ''} ${r.nombre}`
      return haystack.toLowerCase().includes(s)
    })
  }, [rows, q, statusFilter, folder, filterOrdenCompraId, ordenes])

  const filteredOrdenes = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return ordenes
    return ordenes.filter((o) => {
      const emp = o.empresa?.nombre ?? ''
      const req = o.requisitor?.nombre ?? ''
      const lines = (o.cotizacion_lineas ?? []).join(' ').toLowerCase()
      return `${o.numero} ${emp} ${req} ${o.archivo_nombre} ${lines}`.toLowerCase().includes(s)
    })
  }, [ordenes, q])

  const ordenById = useMemo(() => new Map(ordenes.map((o) => [o.id, o])), [ordenes])

  const proyectoCombinedRows = useMemo(() => {
    if (folder !== 'proyecto')
      return [] as Array<
        | { k: string; kind: 'pdf'; oc: OrdenCompraRow; lineNo: number; desc: string }
        | { k: string; kind: 'db'; row: BodegaProjectRow }
      >
    const s = q.trim().toLowerCase()
    const out: Array<
      | { k: string; kind: 'pdf'; oc: OrdenCompraRow; lineNo: number; desc: string }
      | { k: string; kind: 'db'; row: BodegaProjectRow }
    > = []

    const matchProject = (r: BodegaProjectRow) => {
      if (filterOrdenCompraId && r.orden_compra_id !== filterOrdenCompraId) return false
      if (statusFilter !== 'all' && r.status !== statusFilter) return false
      if (!s) return true
      const hay = `${r.nombre} ${r.folio} ${r.orden ?? ''} ${r.cliente} ${r.empresa ?? ''}`.toLowerCase()
      const oc = r.orden_compra_id ? ordenById.get(r.orden_compra_id) : undefined
      const ocHay = oc
        ? `${oc.numero} ${oc.empresa?.nombre ?? ''} ${oc.requisitor?.nombre ?? ''}`.toLowerCase()
        : ''
      return hay.includes(s) || ocHay.includes(s)
    }

    for (const o of ordenes) {
      if (filterOrdenCompraId && o.id !== filterOrdenCompraId) continue
      for (let i = 0; i < o.cotizacion_lineas.length; i++) {
        const desc = o.cotizacion_lineas[i]
        if (!desc?.trim() || filterCotizacionLineas([desc]).length === 0) continue
        const lineNo = i + 1
        const yaHayProyecto = rows.some(
          (r) => r.orden_compra_id === o.id && r.cotizacion_linea_idx != null && r.cotizacion_linea_idx === lineNo,
        )
        if (yaHayProyecto) continue
        const blob = `${o.numero} ${o.empresa?.nombre ?? ''} ${o.requisitor?.nombre ?? ''} ${desc}`.toLowerCase()
        if (s && !blob.includes(s)) continue
        out.push({ k: `pdf-${o.id}-${i}`, kind: 'pdf', oc: o, lineNo, desc })
      }
    }
    for (const r of rows) {
      if (!matchProject(r)) continue
      if (isCotizacionAmountSummaryLine(r.nombre)) continue
      out.push({ k: `db-${r.id}`, kind: 'db', row: r })
    }
    out.sort((a, b) => {
      const priA = a.kind === 'db' ? a.row.prioridadNivel : 0
      const priB = b.kind === 'db' ? b.row.prioridadNivel : 0
      if (priA !== priB) return priB - priA
      const numA =
        a.kind === 'pdf' ? a.oc.numero : ordenById.get(a.row.orden_compra_id ?? '')?.numero ?? a.row.orden ?? ''
      const numB =
        b.kind === 'pdf' ? b.oc.numero : ordenById.get(b.row.orden_compra_id ?? '')?.numero ?? b.row.orden ?? ''
      const c = numA.localeCompare(numB)
      if (c !== 0) return c
      if (a.kind === 'pdf' && b.kind === 'pdf') return a.lineNo - b.lineNo
      if (a.kind === 'pdf') return -1
      if (b.kind === 'pdf') return 1
      return 0
    })
    return out
  }, [folder, ordenes, rows, q, statusFilter, filterOrdenCompraId, ordenById])

  const proyectoCombinedByEmpresa = useMemo(() => {
    if (folder !== 'proyecto')
      return [] as Array<{
        key: string
        empresaNombre: string
        items: Array<
          | { k: string; kind: 'pdf'; oc: OrdenCompraRow; lineNo: number; desc: string }
          | { k: string; kind: 'db'; row: BodegaProjectRow }
        >
      }>
    const order: string[] = []
    const m = new Map<
      string,
      Array<
        | { k: string; kind: 'pdf'; oc: OrdenCompraRow; lineNo: number; desc: string }
        | { k: string; kind: 'db'; row: BodegaProjectRow }
      >
    >()
    for (const item of proyectoCombinedRows) {
      const emp =
        item.kind === 'pdf'
          ? (item.oc.empresa?.nombre ?? 'Sin empresa').trim() || 'Sin empresa'
          : resolvedEmpresaNombre(item.row, ordenById)
      if (!m.has(emp)) {
        order.push(emp)
        m.set(emp, [])
      }
      m.get(emp)!.push(item)
    }
    return order
      .map((empresaNombre) => ({
        key: empresaNombre,
        empresaNombre,
        items: m.get(empresaNombre)!,
      }))
      .sort((a, b) => a.empresaNombre.localeCompare(b.empresaNombre, 'es'))
  }, [folder, proyectoCombinedRows, ordenById])

  const empresaClienteGroups = useMemo(() => {
    if (folder !== 'cliente')
      return [] as Array<{
        key: string
        empresaNombre: string
        projectCount: number
        items: BodegaProjectRow[]
      }>
    const m = new Map<string, BodegaProjectRow[]>()
    for (const r of filteredProjects) {
      const emp = resolvedEmpresaNombre(r, ordenById)
      if (!m.has(emp)) m.set(emp, [])
      m.get(emp)!.push(r)
    }
    const normNum = (row: BodegaProjectRow) => {
      const o = row.orden_compra_id ? ordenById.get(row.orden_compra_id) : undefined
      return o?.numero ?? row.orden ?? ''
    }
    return Array.from(m.entries())
      .map(([empresaNombre, items]) => {
        const sorted = [...items].sort((a, b) => {
          const p = cmpPrioridadFolio(a, b)
          if (p !== 0) return p
          const c = normNum(a).localeCompare(normNum(b))
          if (c !== 0) return c
          return a.folio.localeCompare(b.folio)
        })
        return {
          key: empresaNombre,
          empresaNombre,
          projectCount: sorted.length,
          items: sorted,
        }
      })
      .sort((a, b) => a.empresaNombre.localeCompare(b.empresaNombre, 'es'))
  }, [folder, filteredProjects, ordenById])

  /** Resumen pestaña Orden: solo OCs / grupos donde todos los proyectos están terminados + conteos por tiempo. */
  const ordenInforme = useMemo(() => {
    const m = new Map<string, BodegaProjectRow[]>()
    for (const r of rows) {
      const k = ocAgruparKey(r)
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(r)
    }

    type Cerrada = {
      key: string
      oc: OrdenCompraRow | null
      numero: string
      solicitante: string
      empresaNombre: string
      nProyectos: number
      fechaCierre: Date
      diasPromedio: number
      diasMin: number
      diasMax: number
      /** Suma de horas hábiles (lun–vie 8:00–17:30) de todos los proyectos de la OC. */
      horasLaboralesOc: number
    }

    const cerradas: Cerrada[] = []
    for (const [key, items] of m) {
      if (!items.length) continue
      if (!items.every((r) => r.status === 'terminado')) continue
      const ocId = key.startsWith('oc:') ? key.slice(3) : ''
      const oc = ocId ? ordenById.get(ocId) ?? null : null
      let fechaCierre = new Date(0)
      let sumD = 0
      let nDur = 0
      let diasMin = Infinity
      let diasMax = 0
      let sumMinHabilOc = 0
      for (const r of items) {
        const fd = finishDateForProject(r)
        if (fd.getTime() > fechaCierre.getTime()) fechaCierre = fd
        const d = duracionDiasCalendario(r)
        if (d != null) {
          sumD += d
          nDur++
          diasMin = Math.min(diasMin, d)
          diasMax = Math.max(diasMax, d)
        }
        sumMinHabilOc += businessMinutesProyecto(r)
      }
      cerradas.push({
        key,
        oc,
        numero: (oc?.numero ?? items[0]?.orden?.trim()) || '—',
        solicitante: oc?.requisitor?.nombre ?? items[0]?.cliente ?? '—',
        empresaNombre: oc?.empresa?.nombre ?? items[0]?.empresa ?? '—',
        nProyectos: items.length,
        fechaCierre,
        diasPromedio: nDur ? Math.round((sumD / nDur) * 10) / 10 : 0,
        diasMin: diasMin === Infinity ? 0 : diasMin,
        diasMax,
        horasLaboralesOc: Math.round((sumMinHabilOc / 60) * 10) / 10,
      })
    }
    cerradas.sort((a, b) => b.fechaCierre.getTime() - a.fechaCierre.getTime())

    const terminados = rows.filter((r) => r.status === 'terminado')
    const now = new Date()

    let sumMinHabilTerminados = 0
    let terminadosConFranjaHabil = 0
    for (const r of terminados) {
      const mins = businessMinutesProyecto(r)
      sumMinHabilTerminados += mins
      if (mins >= 1) terminadosConFranjaHabil++
    }
    const terminadosSinFranjaHabil = terminados.length - terminadosConFranjaHabil
    const horasLaboralesPromedioTerminados =
      terminados.length > 0 ? Math.round((sumMinHabilTerminados / 60 / terminados.length) * 10) / 10 : 0

    const activos = rows.filter((r) => r.status !== 'terminado')
    let sumMinActivos = 0
    let activosConFranjaHabil = 0
    for (const r of activos) {
      const mins = businessMinutesProyecto(r, now)
      sumMinActivos += mins
      if (mins >= 1) activosConFranjaHabil++
    }
    const activosSinFranjaHabil = activos.length - activosConFranjaHabil
    const horasLaboralesActivosAcum = Math.round((sumMinActivos / 60) * 10) / 10

    const byMonthProyecto = new Map<string, number>()
    const byYearProyecto = new Map<string, number>()
    for (const r of terminados) {
      const fd = finishDateForProject(r)
      const mk = monthKey(fd)
      const yk = yearKey(fd)
      byMonthProyecto.set(mk, (byMonthProyecto.get(mk) ?? 0) + 1)
      byYearProyecto.set(yk, (byYearProyecto.get(yk) ?? 0) + 1)
    }

    const byMonthOc = new Map<string, number>()
    for (const c of cerradas) {
      const mk = monthKey(c.fechaCierre)
      byMonthOc.set(mk, (byMonthOc.get(mk) ?? 0) + 1)
    }

    const monthKeys12 = lastNMonthKeys(12)
    const chartProyectosMes = monthKeys12.map((mk) => ({
      label: formatMonthShortEs(mk),
      value: byMonthProyecto.get(mk) ?? 0,
    }))
    const chartOcsMes = monthKeys12.map((mk) => ({
      label: formatMonthShortEs(mk),
      value: byMonthOc.get(mk) ?? 0,
    }))
    const maxChart = Math.max(
      1,
      ...chartProyectosMes.map((x) => x.value),
      ...chartOcsMes.map((x) => x.value),
    )

    const añosOrdenados = Array.from(byYearProyecto.keys()).sort()
    const chartProyectosAño = añosOrdenados.map((yk) => ({ label: yk, value: byYearProyecto.get(yk) ?? 0 }))
    const maxAño = Math.max(1, ...chartProyectosAño.map((x) => x.value))

    const wkNow = weekMondayKey(now)
    const mkNow = monthKey(now)
    const ykNow = yearKey(now)

    let semanaProyectos = 0
    let mesProyectos = 0
    let añoProyectos = 0
    for (const r of terminados) {
      const fd = finishDateForProject(r)
      if (weekMondayKey(fd) === wkNow) semanaProyectos++
      if (monthKey(fd) === mkNow) mesProyectos++
      if (yearKey(fd) === ykNow) añoProyectos++
    }

    let semanaOcs = 0
    let mesOcs = 0
    let añoOcs = 0
    for (const c of cerradas) {
      if (weekMondayKey(c.fechaCierre) === wkNow) semanaOcs++
      if (monthKey(c.fechaCierre) === mkNow) mesOcs++
      if (yearKey(c.fechaCierre) === ykNow) añoOcs++
    }

    let sumHorasDur = 0
    let nHoras = 0
    for (const r of terminados) {
      const d = duracionDiasCalendario(r)
      if (d != null && d > 0) {
        sumHorasDur += d * 24
        nHoras++
      }
    }
    const horasPromedio = nHoras ? sumHorasDur / nHoras : 0
    const horasEstimadasPorPct = horasPromedio > 0 ? horasPromedio / 100 : 0

    return {
      cerradas,
      terminadosCount: terminados.length,
      cerradasCount: cerradas.length,
      chartProyectosMes,
      chartOcsMes,
      chartProyectosAño,
      maxChart,
      maxAño,
      semanaProyectos,
      mesProyectos,
      añoProyectos,
      semanaOcs,
      mesOcs,
      añoOcs,
      horasEstimadasPorPct,
      horasLaboralesPromedioTerminados,
      terminadosConFranjaHabil,
      terminadosSinFranjaHabil,
      activosCount: activos.length,
      activosConFranjaHabil,
      activosSinFranjaHabil,
      horasLaboralesActivosAcum,
      diasPromedioTerminados:
        terminados.length > 0
          ? (() => {
              let s = 0
              let n = 0
              for (const r of terminados) {
                const d = duracionDiasCalendario(r)
                if (d != null) {
                  s += d
                  n++
                }
              }
              return n ? Math.round((s / n) * 10) / 10 : 0
            })()
          : 0,
    }
  }, [rows, ordenById])

  const ordenInformeFiltrado = useMemo(() => {
    const s = q.trim().toLowerCase()
    let list = ordenInforme.cerradas
    if (filterOrdenCompraId) {
      list = list.filter((c) => c.oc?.id === filterOrdenCompraId)
    }
    if (s) {
      list = list.filter((c) => {
        const blob = `${c.numero} ${c.empresaNombre} ${c.solicitante}`.toLowerCase()
        return blob.includes(s)
      })
    }
    return list
  }, [ordenInforme.cerradas, q, filterOrdenCompraId])

  /** Todos los grupos de la pestaña Orden (OC vinculada o solo texto orden+cliente). */
  const ordenGrupoTodos = useMemo(() => {
    const m = new Map<string, BodegaProjectRow[]>()
    for (const r of rows) {
      const k = ocAgruparKey(r)
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(r)
    }
    return m
  }, [rows])

  /** Proyectos agrupados por OC registrada (`orden_compra_id`). */
  const ordenOcAgrupados = useMemo(() => {
    const m = new Map<string, BodegaProjectRow[]>()
    for (const [k, v] of ordenGrupoTodos) {
      if (!k.startsWith('oc:')) continue
      m.set(k, v)
    }
    return m
  }, [ordenGrupoTodos])

  const ordenTimesPorProject = useMemo(() => {
    const now = new Date()
    const m = new Map<string, ProjectOrdenTimeBreakdown>()
    for (const r of rows) {
      m.set(
        r.id,
        computeProjectOrdenTimes({
          workIntervals: ordenWorkByProject.get(r.id) ?? [],
          pieceIntervals: ordenPieceIntervalsByProject.get(r.id) ?? [],
          nowRef: now,
        }),
      )
    }
    return m
  }, [rows, ordenWorkByProject, ordenPieceIntervalsByProject])

  /** Tiempos por reloj acumulados por OC (suma de cada proyecto). */
  const ordenTimesPorOc = useMemo(() => {
    const m = new Map<string, ProjectOrdenTimeBreakdown>()
    for (const [key, items] of ordenGrupoTodos) {
      const parts = items.map((r) => ordenTimesPorProject.get(r.id) ?? sumOrdenTimeBreakdowns([]))
      m.set(key, sumOrdenTimeBreakdowns(parts))
    }
    return m
  }, [ordenGrupoTodos, ordenTimesPorProject])

  const ordenOcEnCursoCards = useMemo(() => {
    type Card = {
      key: string
      oc: OrdenCompraRow | null
      numero: string
      empresaNombre: string
      solicitante: string
      items: BodegaProjectRow[]
      nTotal: number
      nDone: number
      avgPct: number
      times: ProjectOrdenTimeBreakdown
    }
    const out: Card[] = []
    for (const [key, items] of ordenOcAgrupados) {
      if (!items.length) continue
      if (items.every((r) => r.status === 'terminado')) continue
      const ocId = key.slice(3)
      const oc = ordenById.get(ocId) ?? null
      let sumPct = 0
      for (const r of items) sumPct += clampPct(r.avance_pct)
      const avgPct = Math.round(sumPct / items.length)
      const nDone = items.filter((r) => r.status === 'terminado').length
      const times = ordenTimesPorOc.get(key) ?? sumOrdenTimeBreakdowns([])
      out.push({
        key,
        oc,
        numero: (oc?.numero ?? items[0]?.orden?.trim()) || '—',
        empresaNombre: oc?.empresa?.nombre ?? items[0]?.empresa ?? '—',
        solicitante: oc?.requisitor?.nombre ?? items[0]?.cliente ?? '—',
        items: [...items].sort(cmpPrioridadFolio),
        nTotal: items.length,
        nDone,
        avgPct,
        times,
      })
    }
    out.sort((a, b) => {
      const ha = maxPrioridadNivel(a.items.map((r) => r.prioridadNivel))
      const hb = maxPrioridadNivel(b.items.map((r) => r.prioridadNivel))
      if (ha !== hb) return hb - ha
      return (
        a.avgPct - b.avgPct || a.numero.localeCompare(b.numero, undefined, { numeric: true, sensitivity: 'base' })
      )
    })
    return out
  }, [ordenOcAgrupados, ordenById, ordenTimesPorOc])

  const ordenOcEnCursoFiltradas = useMemo(() => {
    const id = filterOrdenCompraId
    const s = q.trim().toLowerCase()
    return ordenOcEnCursoCards.filter((c) => {
      if (id && c.oc?.id !== id) return false
      if (!s) return true
      const blob = `${c.numero} ${c.empresaNombre} ${c.solicitante}`.toLowerCase()
      return blob.includes(s)
    })
  }, [ordenOcEnCursoCards, q, filterOrdenCompraId])

  /** Una sola lista de órdenes para la tabla de la pestaña Orden: cerradas y en curso juntas. */
  const ordenTablaFilas = useMemo(() => {
    const proyectosDe = (items: BodegaProjectRow[]) =>
      items.map((r) => ({
        id: r.id,
        folio: r.folio,
        pct: clampPct(r.avance_pct),
        estadoLabel: statusLabel(r.status),
        estadoTone: statusTone(r.status),
        prioridadNivel: r.prioridadNivel,
        times: ordenTimesPorProject.get(r.id) ?? sumOrdenTimeBreakdowns([]),
      }))

    const cerradas: OrdenTablaFila[] = ordenInformeFiltrado.map((c) => ({
      key: c.key,
      numero: c.numero,
      empresaNombre: c.empresaNombre,
      solicitante: c.solicitante,
      nTotal: c.nProyectos,
      nDone: c.nProyectos,
      avgPct: 100,
      times: ordenTimesPorOc.get(c.key) ?? sumOrdenTimeBreakdowns([]),
      cerrada: true,
      cierreTexto: formatDateTimeEs(c.fechaCierre),
      diasPromedio: c.diasPromedio,
      tienePartidas: !!c.oc && cotizacionLineasValidas(c.oc.cotizacion_lineas).length > 0,
      proyectos: proyectosDe((ordenGrupoTodos.get(c.key) ?? []).slice().sort(cmpPrioridadFolio)),
    }))

    const enCurso: OrdenTablaFila[] = ordenOcEnCursoFiltradas.map((c) => ({
      key: c.key,
      numero: c.numero,
      empresaNombre: c.empresaNombre,
      solicitante: c.solicitante,
      nTotal: c.nTotal,
      nDone: c.nDone,
      avgPct: c.avgPct,
      times: c.times,
      cerrada: false,
      cierreTexto: null,
      diasPromedio: 0,
      tienePartidas: !!c.oc && cotizacionLineasValidas(c.oc.cotizacion_lineas).length > 0,
      proyectos: proyectosDe(c.items),
    }))

    if (ordenTablaFiltro === 'cerradas') return cerradas
    if (ordenTablaFiltro === 'curso') return enCurso
    return [...enCurso, ...cerradas]
  }, [
    ordenInformeFiltrado,
    ordenOcEnCursoFiltradas,
    ordenGrupoTodos,
    ordenTimesPorOc,
    ordenTimesPorProject,
    ordenTablaFiltro,
  ])

  /** Abre el modal de partidas desde la tabla, buscando la OC del grupo. */
  const abrirPartidasDeGrupo = useCallback(
    (key: string) => {
      const ocId = key.startsWith('oc:') ? key.slice(3) : ''
      const oc = ocId ? ordenById.get(ocId) ?? null : null
      if (oc) setPartidasModalOc(oc)
    },
    [ordenById],
  )

  /** Tiempo de reloj acumulado en todos los proyectos, para el resumen de arriba. */
  const ordenTiempoTotal = useMemo(
    () => sumOrdenTimeBreakdowns([...ordenTimesPorProject.values()]),
    [ordenTimesPorProject],
  )

  /** Si aún no hay proyectos en app, agrupa órdenes por empresa para la pestaña Cliente. */
  const clienteEmpresaSoloOrdenes = useMemo(() => {
    if (folder !== 'cliente')
      return [] as Array<{ key: string; empresaNombre: string; ordenes: OrdenCompraRow[] }>
    if (filteredProjects.length > 0) return []
    if (statusFilter !== 'all') return []
    const m = new Map<string, OrdenCompraRow[]>()
    for (const o of filteredOrdenes) {
      const emp = (o.empresa?.nombre ?? 'Sin empresa').trim() || 'Sin empresa'
      if (!m.has(emp)) m.set(emp, [])
      m.get(emp)!.push(o)
    }
    return Array.from(m.entries())
      .map(([empresaNombre, list]) => ({
        key: empresaNombre,
        empresaNombre,
        ordenes: [...list].sort((a, b) => a.numero.localeCompare(b.numero)),
      }))
      .sort((a, b) => a.empresaNombre.localeCompare(b.empresaNombre, 'es'))
  }, [folder, filteredProjects.length, filteredOrdenes, statusFilter])

  function openCreate() {
    setCreating(true)
    setCreateFolio('')
    setCreateOrden('')
    setCreateOrdenCompraId('')
    setCreateCliente('')
    setCreateEmpresa('')
    setCreateNombre('')
    setCreateStatus('en_diseno')
    setError(null)
    void loadCatalogs()
  }

  function onSelectOrdenCompraForProject(id: string) {
    setCreateOrdenCompraId(id)
    if (!id) {
      setCreateOrden('')
      return
    }
    const o = ordenes.find((x) => x.id === id)
    if (!o) return
    setCreateOrden(o.numero)
    setCreateCliente(o.requisitor?.nombre ?? '')
    setCreateEmpresa(o.empresa?.nombre ?? '')
  }

  async function createProject() {
    if (!isBodegaSupervisorFull) return
    const folio = createFolio.trim().toUpperCase()
    const orden = createOrden.trim()
    const cliente = createCliente.trim()
    const empresa = createEmpresa.trim()
    const nombre = createNombre.trim()
    if (folio.length < 2) {
      setError('El folio es obligatorio.')
      return
    }
    if (!cliente) {
      setError('El cliente es obligatorio.')
      return
    }
    if (!nombre) {
      setError('El nombre del proyecto es obligatorio.')
      return
    }
    setCreateBusy(true)
    setError(null)
    try {
      const sb = getSupabase()
      const payload: Record<string, unknown> = {
        folio,
        orden: orden || null,
        cliente,
        empresa: empresa || null,
        nombre,
        status: createStatus,
      }
      if (createOrdenCompraId && ordenCompraColumnAvailableRef.current) payload.orden_compra_id = createOrdenCompraId
      const { error } = await sb.from('bodega_projects').insert(payload)
      if (error) throw error
      setCreating(false)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear el proyecto')
    } finally {
      setCreateBusy(false)
    }
  }

  async function setProjectPrioridadNivel(r: BodegaProjectRow, nivel: ProjectPrioridadNivel) {
    if (!canSetProjectPrioridad || !prioridadDbAvailable) return
    if (prioridadBusyId) return
    setPrioridadBusyId(r.id)
    setError(null)
    try {
      await updateBodegaProjectPrioridadNivel({
        projectId: r.id,
        previousNivel: r.prioridadNivel,
        newNivel: nivel,
      })
      const fresh = await load()
      if (fresh && designModalProject?.id === r.id) {
        const u = fresh.find((x) => x.id === r.id)
        if (u) setDesignModalProject(u)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo actualizar la prioridad del proyecto')
    } finally {
      setPrioridadBusyId(null)
    }
  }

  const applyPdfAutofill = useCallback(async (f: File) => {
    setUploadPdfParsing(true)
    setUploadPdfNote(null)
    setUploadEmpresaPdfText('')
    setUploadRequisitorPdfText('')
    setUploadCotizacionLineas([])
    try {
      const { parseOrdenCompraPdfViaEdge } = await import('../../lib/parseOrdenCompraPdfEdge')
      const {
        extractPdfPlainText,
        matchCatalogByName,
        parseOrdenCompraFromText,
        extractCotizacionLineDescriptions,
      } = await import('../../lib/ordenCompraPdfExtract')
      const sb = getSupabase()
      const [e, r] = await Promise.all([
        sb.from('empresas').select('id,nombre').order('nombre'),
        sb.from('requisitores').select('id,nombre').order('nombre'),
      ])
      const emp = (e.data as CatalogOpt[]) ?? []
      const req = (r.data as CatalogOpt[]) ?? []
      if (!e.error) setEmpresaOpts(emp)
      if (!r.error) setRequisitorOpts(req)

      const baseNumero = numeroFromFilename(f.name)

      /** Si el PDF ya tiene bastante texto en el navegador, no llamamos a Edge (menos 503 por memoria/tiempo en Supabase). */
      const MIN_CHARS_SKIP_EDGE = 280
      let clientText = ''
      let clientMeta: string | null = null
      let clientReadOk = false
      try {
        const extracted = await extractPdfPlainText(f)
        clientText = extracted.text ?? ''
        clientMeta = extracted.metadataDateIso
        clientReadOk = true
      } catch {
        // sin lectura local; seguimos e intentamos Edge
      }

      let clientTextFromOcr = false
      if (!clientText.trim() && clientReadOk) {
        setUploadPdfNote(
          'Extrayendo texto con OCR en tu navegador (2 primeras páginas). La primera vez descarga idiomas (~15 MB) y puede tardar 30–120 s…',
        )
        let ocrErr: string | null = null
        try {
          const { ocrPdfFirstPagesAsText, OCR_MIN_USABLE_CHARS } = await import('../../lib/ocrScannedPdfText')
          const ocrText = await ocrPdfFirstPagesAsText(f, { maxPages: 2 })
          if (ocrText.trim().length >= OCR_MIN_USABLE_CHARS) {
            clientText = ocrText
            clientTextFromOcr = true
          }
        } catch (e) {
          ocrErr = e instanceof Error ? e.message : String(e)
        }

        if (!clientText.trim() && clientReadOk) {
          setUploadNumero(baseNumero)
          if (clientMeta) setUploadFecha(clientMeta)
          setUploadEmpresaId('')
          setUploadRequisitorId('')
          setUploadEmpresaPdfText('')
          setUploadRequisitorPdfText('')
          setUploadCotizacionLineas([])
          const ocrTail = ocrErr
            ? ` El OCR en el navegador falló: ${ocrErr}`
            : ' Se intentó OCR en 2 páginas; no bastó texto legible (calidad del escaneo o solo portada sin datos).'
          setUploadPdfNote(
            (clientMeta
              ? 'Este PDF no tiene texto seleccionable (suele ser un escaneo: solo imágenes). Se rellenó el número y la fecha desde el nombre del archivo y los metadatos del PDF cuando existían. Elige empresa y requisitor en los catálogos.' +
                  ocrTail +
                  ' También puedes usar un PDF con capa de texto («Imprimir a PDF» desde Coupa o el navegador).'
              : 'Este PDF no tiene texto seleccionable (suele ser un escaneo: solo imágenes). Se rellenó el número desde el nombre del archivo. Indica fecha, empresa y requisitor.' +
                  ocrTail) ,
          )
          return
        }
      }

      if (clientText.trim().length >= MIN_CHARS_SKIP_EDGE) {
        const lineas = extractCotizacionLineDescriptions(clientText)
        setUploadCotizacionLineas(lineas)
        const inferred = parseOrdenCompraFromText(clientText, baseNumero)
        setUploadNumero(inferred.numero)
        const fechaFinal = inferred.fechaIso ?? clientMeta
        if (fechaFinal) setUploadFecha(fechaFinal)
        const eid = matchCatalogByName(inferred.empresaHint, emp)
        const rid = matchCatalogByName(inferred.requisitorHint, req)
        setUploadEmpresaId(eid)
        setUploadRequisitorId(rid)
        setUploadEmpresaPdfText(inferred.empresaHint ?? '')
        setUploadRequisitorPdfText(inferred.requisitorHint ?? '')
        const parts: string[] = [
          clientTextFromOcr
            ? 'Datos extraídos con OCR en tu navegador (2 primeras páginas del escaneo). Comprueba empresa, requisitor y partidas; el OCR puede equivocarse en símbolos o tablas.'
            : 'Datos extraídos en tu navegador (el PDF tiene texto seleccionable). No se usó el servidor para evitar errores 503 en PDFs grandes o complejos.',
        ]
        if (inferred.empresaHint && !eid) {
          parts.push(`Cliente (empresa) detectado: «${inferred.empresaHint}» — elige en el catálogo si coincide.`)
        }
        if (inferred.requisitorHint && !rid) {
          parts.push(`Requisitor detectado: «${inferred.requisitorHint}» — elige en el catálogo si coincide.`)
        }
        if (!inferred.fechaIso && clientMeta) {
          parts.push('La fecha se tomó de los metadatos del PDF (CreationDate/ModDate).')
        }
        if (lineas.length) {
          parts.push(`Se detectaron ${lineas.length} partida(s) en la cotización (columna descripción).`)
        } else {
          parts.push(
            'No se detectaron líneas de partida en este PDF: confirma el formato. Si es de Coupa, prueba «Imprimir a PDF» desde el navegador.',
          )
        }
        setUploadPdfNote(parts.join(' '))
        return
      }

      if (
        clientTextFromOcr &&
        clientText.trim().length > 0 &&
        clientText.trim().length < MIN_CHARS_SKIP_EDGE
      ) {
        const lineas = extractCotizacionLineDescriptions(clientText)
        setUploadCotizacionLineas(lineas)
        const inferred = parseOrdenCompraFromText(clientText, baseNumero)
        setUploadNumero(inferred.numero)
        const fechaFinal = inferred.fechaIso ?? clientMeta
        if (fechaFinal) setUploadFecha(fechaFinal)
        const eid = matchCatalogByName(inferred.empresaHint, emp)
        const rid = matchCatalogByName(inferred.requisitorHint, req)
        setUploadEmpresaId(eid)
        setUploadRequisitorId(rid)
        setUploadEmpresaPdfText(inferred.empresaHint ?? '')
        setUploadRequisitorPdfText(inferred.requisitorHint ?? '')
        const parts: string[] = [
          'Datos extraídos con OCR en el navegador (pocas páginas o poco texto legible). Comprueba empresa, requisitor y partidas; el OCR suele fallar en tablas o sellos.',
        ]
        if (inferred.empresaHint && !eid) {
          parts.push(`Cliente (empresa) detectado: «${inferred.empresaHint}» — elige en el catálogo si coincide.`)
        }
        if (inferred.requisitorHint && !rid) {
          parts.push(`Requisitor detectado: «${inferred.requisitorHint}» — elige en el catálogo si coincide.`)
        }
        if (!inferred.fechaIso && clientMeta) {
          parts.push('La fecha se tomó de los metadatos del PDF (CreationDate/ModDate).')
        }
        if (lineas.length) {
          parts.push(`Se detectaron ${lineas.length} partida(s) en la cotización (columna descripción).`)
        } else {
          parts.push(
            'No se detectaron líneas de partida claras: revisa el texto OCR o completa partidas a mano.',
          )
        }
        setUploadPdfNote(parts.join(' '))
        return
      }

      const edge = await parseOrdenCompraPdfViaEdge(f)
      if (edge.ok) {
        const inferred = edge.inferred
        const metadataDateIso = edge.metadataDateIso
        const lineas = edge.cotizacion_lineas
        setUploadCotizacionLineas(lineas)
        setUploadNumero(inferred.numero)
        const fechaFinal = inferred.fechaIso ?? metadataDateIso
        if (fechaFinal) setUploadFecha(fechaFinal)
        const eid = matchCatalogByName(inferred.empresaHint, emp)
        const rid = matchCatalogByName(inferred.requisitorHint, req)
        setUploadEmpresaId(eid)
        setUploadRequisitorId(rid)
        setUploadEmpresaPdfText(inferred.empresaHint ?? '')
        setUploadRequisitorPdfText(inferred.requisitorHint ?? '')

        const parts: string[] = [
          'Datos leídos en el servidor (Supabase Edge Function); suele ser más fiable que solo el navegador.',
        ]
        if (inferred.empresaHint && !eid) {
          parts.push(`Cliente (empresa) detectado: «${inferred.empresaHint}» — elige en el catálogo si coincide.`)
        }
        if (inferred.requisitorHint && !rid) {
          parts.push(`Requisitor detectado: «${inferred.requisitorHint}» — elige en el catálogo si coincide.`)
        }
        if (!inferred.fechaIso && metadataDateIso) {
          parts.push('La fecha se tomó de los metadatos del PDF (CreationDate/ModDate).')
        }
        if (lineas.length) {
          parts.push(`Se detectaron ${lineas.length} partida(s) en la cotización (columna descripción).`)
        } else if ((edge.textCharCount ?? 0) > 0) {
          parts.push(
            'No se detectaron líneas de partida en este PDF: confirma el formato. Si es de Coupa, prueba «Imprimir a PDF» desde el navegador.',
          )
        } else {
          parts.push(
            'No hay texto extraíble en el PDF (a menudo es escaneado). Completa fecha, empresa y requisitor; si hace falta OCR, habría que añadirlo en otro paso.',
          )
        }
        setUploadPdfNote(parts.join(' '))
        return
      }

      if (!clientReadOk) {
        setUploadPdfNote(
          'No se pudo leer el PDF en el navegador ni en el servidor (¿archivo dañado o protegido?). Usa el número del nombre del archivo y completa el resto a mano.' +
            (edge.error ? ` (Servidor: ${edge.error})` : ''),
        )
        setUploadNumero(numeroFromFilename(f.name))
        setUploadEmpresaPdfText('')
        setUploadRequisitorPdfText('')
        setUploadCotizacionLineas([])
        return
      }

      const text = clientText
      const metadataDateIso = clientMeta

      if (!text.trim()) {
        setUploadNumero(baseNumero)
        if (metadataDateIso) setUploadFecha(metadataDateIso)
        setUploadEmpresaId('')
        setUploadRequisitorId('')
        setUploadEmpresaPdfText('')
        setUploadRequisitorPdfText('')
        setUploadCotizacionLineas([])
        setUploadPdfNote(
          (metadataDateIso
            ? 'No hay texto seleccionable en el PDF (a menudo es escaneado). Se rellenó el número y la fecha desde el nombre del archivo y los metadatos del PDF. Elige empresa y requisitor en los catálogos.'
            : 'No hay texto seleccionable en el PDF (a menudo es escaneado). Se rellenó el número desde el nombre del archivo. Indica fecha, empresa y requisitor; si el PDF es solo imagen hace falta OCR o captura manual.') +
            (edge.error ? ` (Servidor: ${edge.error})` : ''),
        )
        return
      }

      const lineas = extractCotizacionLineDescriptions(text)
      setUploadCotizacionLineas(lineas)

      const inferred = parseOrdenCompraFromText(text, baseNumero)
      setUploadNumero(inferred.numero)
      const fechaFinal = inferred.fechaIso ?? metadataDateIso
      if (fechaFinal) setUploadFecha(fechaFinal)

      const eid = matchCatalogByName(inferred.empresaHint, emp)
      const rid = matchCatalogByName(inferred.requisitorHint, req)
      setUploadEmpresaId(eid)
      setUploadRequisitorId(rid)
      setUploadEmpresaPdfText(inferred.empresaHint ?? '')
      setUploadRequisitorPdfText(inferred.requisitorHint ?? '')

      const parts: string[] = []
      if (edge.error) {
        parts.push(`El servidor no analizó el PDF (${edge.error}); se usó lectura en el navegador.`)
      }
      if (inferred.empresaHint && !eid) {
        parts.push(`Cliente (empresa) detectado: «${inferred.empresaHint}» — elige en el catálogo si coincide.`)
      }
      if (inferred.requisitorHint && !rid) {
        parts.push(`Requisitor detectado: «${inferred.requisitorHint}» — elige en el catálogo si coincide.`)
      }
      if (!inferred.fechaIso && metadataDateIso) {
        parts.push('La fecha se tomó de los metadatos del PDF (CreationDate/ModDate).')
      }
      if (lineas.length) {
        parts.push(`Se detectaron ${lineas.length} partida(s) en la cotización (columna descripción).`)
      } else if (text.trim()) {
        parts.push(
          'No se detectaron líneas de partida en este PDF: confirma que tenga texto seleccionable (no solo imagen escaneada). Si es de Coupa, prueba «Imprimir a PDF» desde el navegador o guardar con texto.',
        )
      }
      if (parts.length) setUploadPdfNote(parts.join(' '))
    } finally {
      setUploadPdfParsing(false)
    }
  }, [])

  function openUpload() {
    setUploadOpen(true)
    setUploadFile(null)
    setUploadNumero('')
    setUploadFecha(new Date().toISOString().slice(0, 10))
    setUploadEmpresaId('')
    setUploadRequisitorId('')
    setUploadPdfNote(null)
    setUploadPdfParsing(false)
    setUploadEmpresaPdfText('')
    setUploadRequisitorPdfText('')
    setUploadCotizacionLineas([])
    setError(null)
  }

  async function submitUpload() {
    if (!uploadFile) {
      setError('Selecciona un archivo PDF.')
      return
    }
    const numero = (uploadNumero.trim() || numeroFromFilename(uploadFile.name)).toUpperCase()
    if (numero.length < 2) {
      setError('Indica el número de orden de compra.')
      return
    }
    setUploadBusy(true)
    setError(null)
    try {
      const sb = getSupabase()
      const safeName = sanitizeStorageFileName(uploadFile.name)
      const path = `${numero}/${crypto.randomUUID()}-${safeName}`
      await uploadBodegaProyectosBinary(
        sb,
        BODEGA_ORDENES_BUCKET,
        path,
        uploadFile,
        uploadFile.type || 'application/pdf',
      )

      const notasParts: string[] = []
      if (uploadEmpresaPdfText.trim() && !uploadEmpresaId) {
        notasParts.push(`Empresa según PDF: ${uploadEmpresaPdfText.trim()}`)
      }
      if (uploadRequisitorPdfText.trim() && !uploadRequisitorId) {
        notasParts.push(`Requisitor según PDF: ${uploadRequisitorPdfText.trim()}`)
      }

      let lineasGuardar = filterCotizacionLineas(uploadCotizacionLineas)
      if (lineasGuardar.length === 0 && uploadFile) {
        const { parseOrdenCompraPdfViaEdge } = await import('../../lib/parseOrdenCompraPdfEdge')
        const edgeRetry = await parseOrdenCompraPdfViaEdge(uploadFile)
        if (edgeRetry.ok && edgeRetry.cotizacion_lineas.length > 0) {
          lineasGuardar = edgeRetry.cotizacion_lineas
        } else {
          const mod = await import('../../lib/ordenCompraPdfExtract')
          try {
            const { text } = await mod.extractPdfPlainText(uploadFile)
            lineasGuardar = mod.extractCotizacionLineDescriptions(text)
          } catch {
            // ignore
          }
        }
      }

      const insertPayload: Record<string, unknown> = {
        numero,
        archivo_storage_path: path,
        archivo_nombre: uploadFile.name,
        fecha: uploadFecha,
        empresa_id: uploadEmpresaId || null,
        requisitor_id: uploadRequisitorId || null,
        notas: notasParts.length ? notasParts.join('\n') : null,
      }
      if (lineasGuardar.length > 0) insertPayload.cotizacion_lineas = lineasGuardar

      const { error: insErr } = await sb.from('bodega_ordenes_compra').insert(insertPayload)
      if (insErr) {
        const im = [insErr.message, (insErr as { details?: string }).details].filter(Boolean).join(' ')
        if (/cotizacion_lineas|column.*does not exist/i.test(im) && insertPayload.cotizacion_lineas != null) {
          const { cotizacion_lineas: _cl, ...rest } = insertPayload
          const { error: ins2 } = await sb.from('bodega_ordenes_compra').insert(rest)
          if (ins2) throw ins2
        } else {
          throw insErr
        }
      }

      setUploadOpen(false)
      await load()
    } catch (e) {
      const msg = errMessageFromUnknown(e)
      if (looksLikeStorageBucketMissing(msg)) {
        setError(
          'Storage: el bucket «bodega-ordenes-compra» no existe o el proyecto no lo ve. Ejecuta de nuevo en SQL Editor el archivo supabase/storage_bodega_ordenes.sql (incluye INSERT en storage.buckets + policies + GRANT). Comprueba en Storage que el nombre sea exactamente bodega-ordenes-compra.',
        )
      } else if (/row-level security|rls|policy|permission denied|42501|unauthorized/i.test(msg)) {
        setError(
          `Storage o base de datos rechazó la operación: ${msg}. Tu usuario debe ser admin o encargado para subir OC; vuelve a ejecutar storage_bodega_ordenes.sql si faltan permisos.`,
        )
      } else {
        setError(msg)
      }
    } finally {
      setUploadBusy(false)
    }
  }

  function openOrdenPdfInViewer(oc: OrdenCompraRow, partidaLineNo: number | null = null) {
    if (!canDownloadOcPdf) {
      setError('Tu rol no puede abrir el PDF de la orden de compra.')
      return
    }
    setOrdenPdfViewer({ oc, partidaLineNo })
  }

  async function openOrdenPdf(o: OrdenCompraRow) {
    openOrdenPdfInViewer(o, null)
  }

  function verProyectosDeOrden(id: string) {
    if (!ordenCompraColumnAvailableRef.current) {
      const o = ordenes.find((x) => x.id === id)
      setFilterOrdenCompraId(null)
      setFolder('proyecto')
      setQ(o?.numero ?? '')
      setStatusFilter('all')
      return
    }
    setFilterOrdenCompraId(id)
    setFolder('proyecto')
    setQ('')
    setStatusFilter('all')
  }

  function limpiarFiltroOc() {
    setFilterOrdenCompraId(null)
  }

  function renderProjectDeliveryScreen() {
    if (!designModalProject) return null
    const deliveryStatusLabel =
      projectPipelineDisplay?.statusLabel ?? statusLabel(designModalProject.status)
    const pipelineOperationalProps = projectPipelineDisplay
      ? {
          operationalAvancePct: projectPipelineDisplay.avancePct,
          operationalStageLabel: projectPipelineDisplay.statusLabel,
        }
      : {}
    const showClosureTimesSummary =
      designModalProject.status === 'revision_programacion' &&
      (canReviewDesign || isBodegaSupervisorFull)
    const tallerTimeDetail = projectDeliveryTimes
      ? `Perfilado ${formatBusinessMinutesShort(projectDeliveryTimes.perfiladoMin)} · Detallado ${formatBusinessMinutesShort(projectDeliveryTimes.detalladoMin)} · Armado ${formatBusinessMinutesShort(projectDeliveryTimes.armadoMin)}`
      : undefined
    return (
        <BodegaProjectDeliveryFullscreen
          folio={designModalProject.folio}
          projectName={designModalProject.nombre}
          statusLabel={deliveryStatusLabel}
          onClose={closeDesignModal}
          headerActions={
            <>
                    <button
                      type="button"
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/35 bg-white/10 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/45"
                      aria-expanded={designModalProjectInfoOpen}
                      aria-controls="design-modal-project-details"
                      title={
                        designModalProjectInfoOpen
                          ? 'Ocultar descripción completa'
                          : 'Ver descripción completa'
                      }
                      onClick={() => setDesignModalProjectInfoOpen((v) => !v)}
                    >
                      <svg
                        className="h-3.5 w-3.5 opacity-95"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 16v-4" />
                        <path d="M12 8h.01" />
                      </svg>
                      Descripción
                    </button>
                    <BodegaProjectPrioridadBadge nivel={designModalProject.prioridadNivel} />
                    {canTogglePrioridad ? (
                      <div className="rounded-lg border border-white/25 bg-white/10 px-2 py-1.5">
                        <BodegaProjectPrioridadControl
                          compact
                          nivel={designModalProject.prioridadNivel}
                          canEdit
                          busy={prioridadBusyId === designModalProject.id}
                          onChange={(nivel) => void setProjectPrioridadNivel(designModalProject, nivel)}
                        />
                      </div>
                    ) : null}
              {designModalProjectInfoOpen ? (
                <p
                  id="design-modal-project-details"
                  className="w-full basis-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-[12px] leading-relaxed text-blue-50/95"
                >
                  {designModalProject.nombre}
                </p>
              ) : null}
            </>
          }
                    tabs={
            <div
              role="tablist"
              aria-label="Tipo de entrega"
              className={[
                'grid w-full grid-cols-2 gap-1 rounded-xl bg-black/25 p-1 ring-1 ring-white/10',
                projectDeliveryTabsForRole(props.role, isBodegaSupervisorFull).length > 4
                  ? 'sm:grid-cols-3 lg:grid-cols-6'
                  : 'sm:grid-cols-4',
              ].join(' ')}
            >
                  {projectDeliveryTabsForRole(props.role, isBodegaSupervisorFull).map(([id, short, sub]) => (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={deliveryTab === id}
                      className={[
                        'flex min-h-[44px] min-w-0 flex-1 flex-col items-center justify-center rounded-xl px-3 py-2 text-center transition outline-none focus-visible:ring-2 focus-visible:ring-white/40 sm:min-w-[7.5rem] sm:flex-none sm:px-5',
                        deliveryTab === id
                          ? projectDeliveryTabActiveClass(id)
                          : 'text-blue-100/90 hover:bg-white/10 hover:text-white',
                      ].join(' ')}
                      onClick={() => setDeliveryTab(id)}
                    >
                      <span className="text-[13px] font-bold leading-tight">{short}</span>
                      {designLoading ? (
                        <span className="my-0.5 font-mono text-[10px] font-semibold tabular-nums opacity-70">
                          …
                        </span>
                      ) : projectDeliveryTimes ? (
                        <span
                          className={[
                            'my-0.5 font-mono text-[11px] font-bold tabular-nums leading-none',
                            deliveryTab === id
                              ? id === 'cnc'
                                ? 'text-programacion-800'
                                : 'text-slate-800'
                              : 'text-blue-50/95',
                          ].join(' ')}
                          title="Tiempo hábil registrado en esta etapa"
                        >
                          {formatDeliveryTabTime(projectDeliveryTimes, id)}
                        </span>
                      ) : null}
                      <span
                        className={[
                          'mt-0.5 text-[10px] font-medium leading-tight',
                          deliveryTab === id
                            ? id === 'cnc'
                              ? 'text-programacion-700/90'
                              : 'text-slate-500'
                            : 'text-blue-200/75',
                        ].join(' ')}
                      >
                        {sub}
                      </span>
                    </button>
                  ))}
            </div>
          }
          footer={
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-2">
                {canReviewDesign && designModalProject.status === 'diseno_aprobado' ? (
                  <button
                    type="button"
                    disabled={supervisorStatusBusy}
                    className="min-h-[44px] rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-[13px] font-semibold text-emerald-950 shadow-sm transition hover:bg-emerald-100 disabled:opacity-60"
                    onClick={() => void onSupervisorSetProjectStatus('en_programacion')}
                  >
                    {supervisorStatusBusy ? '…' : 'Pasar a programación'}
                  </button>
                ) : null}
                {canReviewDesign && designModalProject.status === 'revision_programacion' ? (
                  <button
                    type="button"
                    disabled={supervisorStatusBusy}
                    className="min-h-[44px] rounded-xl bg-emerald-700 px-4 py-2.5 text-[13px] font-bold text-white shadow-md transition hover:bg-emerald-800 disabled:opacity-60"
                    onClick={() => void onSupervisorSetProjectStatus('terminado')}
                  >
                    {supervisorStatusBusy ? '…' : 'Marcar terminado (100%)'}
                  </button>
                ) : null}
              </div>
            </div>
          }
          overlay={
            <>
              {designZipMissingPlanosPending ? (
                <BodegaDesignZipMissingPlanosModal
                  missing={designZipMissingPlanosPending.missing}
                  zipFileName={designZipMissingPlanosPending.file.name}
                  canAttachExistingPieces={visibleDesignPieces(projectPieces, designZipPaths).some(
                    (p) => p.source_path && isSwPartZipPath(p.source_path),
                  )}
                  busy={designUploadBusy}
                  onUploadAnyway={() => void confirmDesignZipUploadDespiteMissingPlanos()}
                  onGoAttachPlanos={goAttachPlanosFromMissingZipModal}
                  onClose={dismissDesignZipMissingPlanosModal}
                />
              ) : null}
              {programmingFullscreenOpen &&
              programmingRoutesLocked &&
              (canUploadBodegaMachine(props.role) || canManageBodegaLikeAdmin(props.role)) ? (
                <BodegaProgrammerProgrammingFullscreen
                  folio={designModalProject.folio}
                  projectName={designModalProject.nombre}
                  onClose={() => setProgrammingFullscreenOpen(false)}
                >
                  <BodegaProgrammerCncWorkspace
                    spacious
                    role={props.role}
                    projectId={designModalProject.id}
                    projectFolio={designModalProject.folio}
                    pieces={projectPieces}
                    designZipPaths={designZipPaths}
                    activeModule={cncModuleTab === 'torno' ? 'torno' : 'programacion'}
                    onModuleChange={(m) => setCncModuleTab(m)}
                    onReload={async () => {
                      await loadProjectDeliveries(designModalProject.id)
                      const pieces = await fetchProjectPieces(designModalProject.id)
                      setProjectPieces(pieces)
                      try {
                        const closed = await closeProgrammingOfficeClockIfComplete({
                          projectId: designModalProject.id,
                          pieces,
                        })
                        if (closed) {
                          cncClockKeyRef.current = null
                          const iv = await fetchWorkIntervals(designModalProject.id)
                          setWorkIntervals(iv)
                        }
                      } catch {
                        /* ignore */
                      }
                    }}
                  />
                </BodegaProgrammerProgrammingFullscreen>
              ) : null}
            </>
          }
        >
              {error ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-900 shadow-sm">
                  {error}
                </div>
              ) : null}

              {bodegaNotice ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-950 shadow-sm">
                  {bodegaNotice}
                </div>
              ) : null}

              {designLoading ? (
                <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200/90 bg-white px-6 py-10 shadow-sm ring-1 ring-slate-900/[0.03]">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-section-navy" aria-hidden />
                  <p className="text-[14px] font-medium text-slate-600">Cargando entregas del proyecto…</p>
                </div>
              ) : null}

              {!designLoading && showClosureTimesSummary && projectDeliveryTimes ? (
                <BodegaProjectDeliveryTimesSummary times={projectDeliveryTimes} closureReview />
              ) : null}

              {!designLoading && designModalProject && deliveryTab === 'piezas' ? (
                <>
                  <BodegaDeliverySectionTimeStrip
                    tab="piezas"
                    times={projectDeliveryTimes}
                    loading={designLoading}
                    workIntervals={workIntervals}
                    pieceIntervals={pieceIntervals}
                  />
                <BodegaPiecesWorkflowPanel
                  role={props.role}
                  projectId={designModalProject.id}
                  projectFolio={designModalProject.folio}
                  projectStatus={designModalProject.status}
                  pieces={projectPieces}
                  flowMeta={pieceFlowMeta}
                  piecePhotosCount={piecePhotos.length}
                  photos={piecePhotos}
                  canUploadPhotos={canUploadPiecePhotos && !pieceFlowMeta?.project_finalized_at}
                  photoUploadBusy={photoUploadBusy}
                  onUploadPhotos={uploadPiecePhotosForPiece}
                  approvedDesign={
                    approvedDesignEntregaVersionsList.length > 0
                      ? {
                          version: approvedDesignZipSummaryInfo.version,
                          zipFilename: approvedDesignZipSummaryInfo.zipFilename,
                          paths: designZipPaths,
                          pathsLoading: designZipPathsLoading,
                          pathsError: designZipPathsError,
                        }
                      : null
                  }
                  onReload={async () => {
                    await loadProjectDeliveries(designModalProject.id)
                    await refreshModalProjectFromServer(designModalProject.id)
                  }}
                />
                </>
              ) : null}

              {deliveryTab === 'diseno' && !designLoading && designModalProject ? (
                <>
                <BodegaDisenoWorkspace
                  role={props.role}
                  projectStatus={designModalProject.status}
                  canUploadDesign={canUploadDesign}
                  designUploadBusy={designUploadBusy}
                  designUploadPhase={designUploadPhase}
                  designEntregaVersions={designEntregaVersions}
                  clienteInfoVersions={clienteInfoVersions}
                  onUploadDesign={(f, planos) => void uploadDesignZip(f, planos)}
                  onDownload={(v) => void downloadDesignZip(v)}
                  formatDateTime={(d) => formatDateTimeEs(d)}
                  destinosComplete={programmingRoutesLocked}
                  showPlanosStep={
                    projectPieces.some(
                      (p) => p.programmer_bucket === 'torno' || p.programmer_bucket === 'perfilado',
                    )
                  }
                  clockPanel={
                    <BodegaProjectClockPanel
                      embedded
                      role={props.role}
                      projectId={designModalProject.id}
                      projectStatus={designModalProject.status}
                      ordenCompraNumero={
                        designModalProject.orden_compra_id
                          ? (ordenById.get(designModalProject.orden_compra_id)?.numero ?? null)
                          : null
                      }
                      sinOrdenCompra={!designModalProject.orden_compra_id}
                      onLinkOrdenCompra={
                        canOc && !designModalProject.orden_compra_id && !ocLinkColumnMissing
                          ? () => setLinkOcProject(designModalProject)
                          : undefined
                      }
                      workIntervals={workIntervals}
                      hideOrdenClock
                      idleClockHint="Se inicia al entrar al proyecto"
                      designContratiempoNotes={pieceFlowMeta?.design_contratiempo_notes ?? null}
                      onReloadMeta={async () => {
                        const meta = await fetchProjectPieceFlowMeta(designModalProject.id)
                        setPieceFlowMeta(meta)
                      }}
                      onSaved={() => setBodegaNotice('Nota de contratiempo guardada.')}
                    />
                  }
                  supervisorPanel={
                    canReviewDesign ? (
                      <BodegaSupervisorStep3Panel
                        embedded
                        projectStatus={designModalProject.status}
                        designEntregaVersions={designEntregaVersions}
                        pendingReviewPaths={pendingReviewPaths}
                        pendingReviewPathsLoading={pendingReviewPathsLoading}
                        designZipPaths={designZipPaths}
                        designZipPathsLoading={designZipPathsLoading}
                        confirmedFolderKeys={confirmedFolderKeysForPanel}
                        confirmBusy={designReviewBusy}
                        pieces={projectPieces}
                        onDownloadZip={(v) => void downloadDesignZip(v)}
                        onConfirmFolders={(args) => void confirmDesignFoldersForProject(args)}
                      />
                    ) : null
                  }
                  destinosPanel={
                    destinosDesignPaths.length > 0 || projectPieces.length > 0 ? (
                      <BodegaDisenoDestinosPanel
                        role={props.role}
                        projectId={designModalProject.id}
                        projectFolio={designModalProject.folio}
                        pieces={projectPieces}
                        designPaths={destinosDesignPaths}
                        routesLocked={programmingRoutesLocked}
                        designConfirmed={
                          ['diseno_aprobado', 'diseno_parcial', 'en_programacion', 'revision_programacion', 'terminado'].includes(
                            designModalProject.status,
                          ) && pendingDesignReviewVersion == null
                        }
                        onReload={async () => {
                          await loadProjectDeliveries(designModalProject.id)
                          await refreshModalProjectFromServer(designModalProject.id)
                        }}
                        onConfirmed={() => void onDesignDestinosConfirmed()}
                      />
                    ) : null
                  }
                  planosPanel={
                    <BodegaDesignPiecePlanosPanel
                      embedded
                      role={props.role}
                      projectFolio={designModalProject.folio}
                      pieces={projectPieces}
                      designZipPaths={effectiveDesignZipPaths}
                      designEntregaVersions={approvedDesignEntregaVersionsList}
                      onReload={async () => {
                        await loadProjectDeliveries(designModalProject.id)
                      }}
                    />
                  }
                />
                </>
              ) : null}

              {deliveryTab === 'cnc' && !designLoading && designModalProject ? (
                <>
                <BodegaProgramacionWorkspace
                  role={props.role}
                  projectStatus={designModalProject.status}
                  routesLocked={programmingRoutesLocked}
                  designReady={
                    ['diseno_aprobado', 'diseno_parcial', 'en_programacion', 'revision_programacion', 'terminado'].includes(
                      designModalProject.status,
                    ) && step3FolderStatus.complete
                  }
                  assignmentComplete={isSwPartsAssignmentComplete(projectPieces, destinosDesignPaths)}
                  hasCncOrTornoPieces={piecesForCncModule(projectPieces, 'programacion').length > 0}
                  allProgrammingFinished={(() => {
                    const cnc = piecesForCncModule(projectPieces, 'programacion')
                    if (programmingRoutesLocked && cnc.length === 0) return true
                    if (cnc.length === 0) return false
                    return piecesPendingInCncModule(projectPieces, 'programacion').length === 0
                  })()}
                  cncModuleTab={cncModuleTab}
                  cncModuleTabsVisible={cncModuleTabsVisible}
                  onCncModuleTabChange={setCncModuleTab}
                  workIntervals={workIntervals}
                  deliveryPanel={
                    canUploadBodegaMachine(props.role) || canManageBodegaLikeAdmin(props.role) ? (
                      <BodegaProgrammerDeliveryPanel
                        role={props.role}
                        projectFolio={designModalProject.folio}
                        foldersConfirmed={step3FolderStatus.complete}
                        hasDelivery={hasProgrammingDeliveryUpload(machineVersions)}
                        designVersion={programmingXtVersion}
                        latestDelivery={latestProgrammingDelivery}
                        uploadBusy={programmingUploadBusy}
                        uploadPhase={programmingUploadPhase}
                        onDownloadDesign={() => {
                          if (programmingXtVersion) void downloadDesignZip(programmingXtVersion)
                        }}
                        onUploadProgrammingZip={(file, comment) => uploadProgrammingDelivery(file, comment)}
                      />
                    ) : null
                  }
                  assignmentPanel={
                    !programmingRoutesLocked ? (
                      <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-4 text-[13px] leading-relaxed text-sky-950">
                        <strong>Los destinos los pone diseño.</strong> En la pestaña <strong>Diseño</strong> la
                        diseñadora dirige cada pieza a CNC, torno o perfiladora. Torno y perfiladora salen sin tiempo,
                        igual que los accesorios. Cuando confirme, aquí solo verás CNC para programar.
                      </div>
                    ) : piecesForCncModule(projectPieces, 'programacion').length === 0 ? (
                      <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 text-[13px] leading-relaxed text-slate-700">
                        Destinos confirmados. Este proyecto no tiene piezas CNC: torno, perfiladora y accesorios ya
                        salieron sin tiempo de programación.
                      </div>
                    ) : null
                  }
                  programmingPanel={
                    programmingRoutesLocked &&
                    cncModuleTab !== 'perfilado' &&
                    (canUploadBodegaMachine(props.role) || canManageBodegaLikeAdmin(props.role)) ? (
                      <BodegaProgrammerCncWorkspace
                        embedded
                        role={props.role}
                        projectId={designModalProject.id}
                        projectFolio={designModalProject.folio}
                        pieces={projectPieces}
                        designZipPaths={effectiveDesignZipPaths}
                        activeModule={cncModuleTab === 'torno' ? 'torno' : 'programacion'}
                        onModuleChange={(m) => setCncModuleTab(m)}
                        onOpenFullscreen={() => setProgrammingFullscreenOpen(true)}
                        onReload={async () => {
                          await loadProjectDeliveries(designModalProject.id)
                          const pieces = await fetchProjectPieces(designModalProject.id)
                          setProjectPieces(pieces)
                          try {
                            const closed = await closeProgrammingOfficeClockIfComplete({
                              projectId: designModalProject.id,
                              pieces,
                            })
                            if (closed) {
                              cncClockKeyRef.current = null
                              const iv = await fetchWorkIntervals(designModalProject.id)
                              setWorkIntervals(iv)
                            }
                          } catch {
                            /* ignore */
                          }
                        }}
                      />
                    ) : null
                  }
                  timesPanel={
                    lanesForDeliveryTab.length > 0 ? (
                      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                        {orderedLaneLabels()
                          .filter(({ lane }) => lanesForDeliveryTab.includes(lane))
                          .map(({ lane, label }) => {
                            const mins = workMinutesByLane.get(lane) ?? 0
                            return (
                              <li key={lane} className="flex items-center justify-between gap-3 px-4 py-2.5">
                                <span className="text-[13px] text-slate-700">{label}</span>
                                <span className="font-mono text-[13px] font-semibold tabular-nums text-section-navy">
                                  {formatWorkMinutesShort(mins)}
                                </span>
                              </li>
                            )
                          })}
                      </ul>
                    ) : null
                  }
                />
                </>
              ) : null}

              {deliveryTab === 'maquinado' && !designLoading && designModalProject ? (
                <div className="space-y-7">
                  <BodegaDeliverySectionTimeStrip
                    tab="maquinado"
                    times={projectDeliveryTimes}
                    loading={designLoading}
                    workIntervals={workIntervals}
                    pieceIntervals={pieceIntervals}
                  />
                  {programmingRoutesLocked &&
                  (canUploadBodegaMachine(props.role) || canManageBodegaLikeAdmin(props.role)) ? (
                    <BodegaOperatorMaquinadoWorkspace
                      rows={maquinadoQueue}
                      loading={false}
                      onReload={async () => {
                        await loadProjectDeliveries(designModalProject.id)
                      }}
                    />
                  ) : (
                    <section className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-6 text-[14px] text-amber-950">
                      Confirma los destinos en la pestaña <strong>Diseño</strong> (CNC / torno / perfiladora). Solo las
                      piezas CNC llegan a maquinado cuando el archivo de programación está listo.
                    </section>
                  )}
                </div>
              ) : null}

              {deliveryTab === 'taller' && !designLoading && designModalProject ? (
                <div className="space-y-7">
                  <BodegaDeliverySectionTimeStrip
                    tab="taller"
                    times={projectDeliveryTimes}
                    loading={designLoading}
                    detail={tallerTimeDetail}
                    workIntervals={workIntervals}
                    pieceIntervals={pieceIntervals}
                  />
                  {canAccessTallerOperadorNav(props.role) || isBodegaSupervisorFull ? (
                    <BodegaProjectTallerWorkspace
                      projectId={designModalProject.id}
                      projectFolio={designModalProject.folio}
                    />
                  ) : (
                    <section className="rounded-2xl border border-teal-200 bg-teal-50 px-5 py-6 text-[14px] text-teal-950">
                      Tu rol no registra etapas de taller en este proyecto.
                    </section>
                  )}
                </div>
              ) : null}

              {deliveryTab === 'fotos' && !designLoading && designModalProject ? (
                <div className="space-y-7">
                  <BodegaDeliverySectionTimeStrip
                    tab="fotos"
                    times={projectDeliveryTimes}
                    loading={designLoading}
                    detail="Las fotos de cierre no tienen reloj propio; revisa el total del proyecto en Piezas o en el resumen de cierre."
                    workIntervals={workIntervals}
                    pieceIntervals={pieceIntervals}
                  />
                  <BodegaProjectPiecePhotosWorkspace
                    pieces={projectPieces}
                    photos={piecePhotos}
                    loading={designLoading}
                    canUpload={canUploadPiecePhotos && !pieceFlowMeta?.project_finalized_at}
                    canFinalize={canSupervisorFinalizeBodegaProject(props.role)}
                    projectFinalized={Boolean(pieceFlowMeta?.project_finalized_at)}
                    projectFinalizedAt={pieceFlowMeta?.project_finalized_at}
                    uploadBusy={photoUploadBusy}
                    finalizeBusy={supervisorFinalizeBusy}
                    onUpload={uploadPiecePhotosForPiece}
                    onBatchUpload={uploadPiecePhotosForPieces}
                    onFinalize={onSupervisorFinalizeProject}
                  />

                  {canUploadMachine && !pieceFlowMeta?.project_finalized_at ? (
                    <section className="overflow-hidden rounded-2xl border border-slate-300 bg-white p-5 shadow-sm ring-1 ring-slate-900/[0.04] sm:p-6">
                      <p className="text-[15px] font-bold text-section-navy">Programadora — solicitar revisión</p>
                      <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-slate-700">
                        Cuando <strong>todas</strong> las piezas estén listas para foto (CNC con detallado; torno,
                        perfilado y accesorios al asignarlos en diseño) puedes solicitar cierre (
                        {projectClosureProgress.detalladoDone}/{projectClosureProgress.totalPieces} listas). El
                        supervisor finaliza arriba cuando cada pieza tenga foto.
                      </p>
                      <button
                        type="button"
                        disabled={
                          closureBusy ||
                          !canProgramadoraSolicitarCierre(projectPieces) ||
                          !(
                            designModalProject.status === 'en_programacion' ||
                            designModalProject.status === 'diseno_aprobado'
                          )
                        }
                        title={
                          !canProgramadoraSolicitarCierre(projectPieces)
                            ? `Faltan ${projectClosureProgress.totalPieces - projectClosureProgress.detalladoDone} pieza(s) por completar (CNC en taller)`
                            : undefined
                        }
                        className="mt-5 min-h-[48px] rounded-xl bg-section-navy px-6 py-3 text-[14px] font-bold text-white shadow-md transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => void onProgramadoraSolicitaCierre()}
                      >
                        {closureBusy ? 'Enviando…' : 'Solicitar revisión de cierre'}
                      </button>
                    </section>
                  ) : null}
                </div>
              ) : null}

              {!designLoading && designModalProject ? (
                <BodegaProjectSeguimientoSection
                  tab={deliveryTab}
                  role={props.role}
                  {...pipelineOperationalProps}
                  avancePct={designModalProject.avance_pct}
                  manualAvanceInput={manualAvanceInput}
                  onManualAvanceInputChange={setManualAvanceInput}
                  manualAvanceBusy={manualAvanceBusy}
                  loading={designLoading}
                  designCommentDraft={designCommentDraft}
                  onDesignCommentDraftChange={setDesignCommentDraft}
                  onSaveManualAvance={() => void saveManualAvance()}
                  commentSaveBusy={commentSaveBusy}
                  onSaveComment={() => void saveDesignCommentNote()}
                  activities={designActivity}
                  formatDateTime={(d) => formatDateTimeEs(d)}
                />
              ) : null}
        </BodegaProjectDeliveryFullscreen>
    )
  }

  if (designModalProject) {
    return <>{renderProjectDeliveryScreen()}</>
  }

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-blue-950/40 bg-section-navy px-4 py-3 text-white shadow-md sm:px-5 sm:py-3.5">
        <h1 className="text-lg font-semibold tracking-tight sm:text-xl">Bodega</h1>
      </div>

      {filterOrdenCompraId ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-[13px] text-sky-950">
          <span>
            Filtrando proyectos de la orden{' '}
            <span className="font-mono font-semibold">
              {ordenes.find((o) => o.id === filterOrdenCompraId)?.numero ?? filterOrdenCompraId.slice(0, 8)}
            </span>
          </span>
          <button
            type="button"
            className="rounded-lg bg-section-navy px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm hover:brightness-110"
            onClick={limpiarFiltroOc}
          >
            Quitar filtro
          </button>
        </div>
      ) : null}

      {ocLinkColumnMissing ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-950 shadow-sm">
          Tu proyecto de Supabase aún no tiene la columna{' '}
          <span className="font-mono text-[12px]">bodega_projects.orden_compra_id</span> (por eso el listado fallaba con
          400). Ejecuta en el SQL Editor:{' '}
          <span className="font-mono text-[12px]">supabase/_archive/reference/schema_bodega_ordenes_compra.sql</span> y vuelve a cargar
          Bodega.
        </div>
      ) : null}

      {!prioridadDbAvailable ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-950 shadow-sm">
          La base aún no tiene prioridad por proyecto. Ejecuta en el SQL Editor{' '}
          <span className="font-mono text-[12px]">{BODEGA_PRIORIDAD_NIVEL_PATCH}</span> (niveles 0–4) y recarga el
          esquema API.
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 shadow-sm">
          {error}
        </div>
      ) : null}

      {bodegaNotice ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950 shadow-sm">
          {bodegaNotice}
        </div>
      ) : null}

      {!ordenesOk && folder === 'todas' ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-950">
          Aún no está la tabla de órdenes de compra. Ejecuta en Supabase:{' '}
          <span className="font-mono text-[12px]">schema_bodega_ordenes_compra.sql</span>,{' '}
          <span className="font-mono text-[12px]">policies_bodega_ordenes_compra.sql</span>, crea el bucket{' '}
          <span className="font-mono">bodega-ordenes-compra</span> y{' '}
          <span className="font-mono text-[12px]">storage_bodega_ordenes.sql</span>.
        </div>
      ) : null}

      <div className="rounded-3xl border border-slate-200/80 bg-white shadow-[0_16px_48px_-20px_rgba(4,26,56,0.18)]">
        <div className="border-b border-slate-200/80 bg-slate-50/60 px-3 py-3 sm:px-4">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ['todas', 'Todas'],
                  ['cliente', 'Cliente'],
                  ['proyecto', 'Proyecto'],
                  ['orden', 'Orden'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={[
                    'rounded-xl px-3 py-2 text-[13px] font-semibold transition',
                    folder === id ? 'bg-section-navy text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100',
                  ].join(' ')}
                  onClick={() => {
                    setFolder(id)
                    setQ('')
                    if (id !== 'proyecto') limpiarFiltroOc()
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
              {folder !== 'todas' && folder !== 'orden' ? (
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as ProjectStatus | 'all')}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] font-semibold text-slate-800 shadow-sm outline-none focus:border-blue-900/30 focus:ring-2 focus:ring-blue-900/15 sm:w-[14rem]"
                >
                  <option value="all">Todos los estados</option>
                  <option value="pendiente">Pendiente</option>
                  <option value="en_diseno">En diseño</option>
                  <option value="revision_diseno">Revisión diseño</option>
                  <option value="modificacion_diseno">Modificación diseño</option>
                  <option value="diseno_parcial">Diseño parcial</option>
                  <option value="diseno_aprobado">Diseño aprobado</option>
                  <option value="en_programacion">En programación</option>
                  <option value="revision_programacion">Revisión programación</option>
                  <option value="terminado">Terminado</option>
                </select>
              ) : folder === 'orden' ? (
                <span className="hidden text-[12px] text-slate-500 sm:inline">Órdenes cerradas, avance y tiempos</span>
              ) : (
                <span className="hidden text-[12px] text-slate-500 sm:inline">Vista de órdenes de compra</span>
              )}
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={
                  folder === 'todas'
                    ? 'Buscar por número OC, empresa, requisitor o nombre de archivo…'
                    : folder === 'cliente'
                      ? 'Cliente / empresa…'
                        : folder === 'proyecto'
                          ? 'N° OC, partida, proyecto, folio…'
                          : folder === 'orden'
                            ? 'OC en curso o cerrada, empresa, solicitante…'
                            : 'Orden / folio…'
                }
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-blue-900/30 focus:ring-2 focus:ring-blue-900/15 sm:max-w-md"
              />
              {canOc ? (
                <button
                  type="button"
                  className="inline-flex shrink-0 items-center justify-center rounded-xl border border-orange-600/90 bg-orange-500 px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition hover:bg-orange-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300/90"
                  onClick={() => openUpload()}
                >
                  Adjuntar orden (PDF)
                </button>
              ) : null}
              {isBodegaSupervisorFull ? (
                <button
                  type="button"
                  className="inline-flex shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-[13px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                  onClick={() => setXtPruebaOpen(true)}
                >
                  Probar .x_t
                </button>
              ) : null}
              {isBodegaSupervisorFull ? (
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-xl bg-section-navy px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition hover:brightness-110"
                  onClick={() => openCreate()}
                >
                  Nuevo proyecto
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="p-3 sm:p-4">
          {loading ? (
            <div className="py-6 text-center text-[13px] text-slate-500">Cargando…</div>
          ) : folder === 'todas' ? (
            filteredOrdenes.length === 0 ? (
              <div className="py-8 text-center text-[13px] text-slate-500">
                {ordenesOk
                  ? 'Sin órdenes de compra. Usa «Adjuntar orden (PDF)» para registrar la primera.'
                  : 'Configura la base de datos para ver órdenes aquí.'}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-200/80">
                <table className="w-full min-w-[960px] table-fixed border-collapse text-left text-[13px]">
                  <colgroup>
                    <col style={{ width: '9%' }} />
                    <col style={{ width: '14%' }} />
                    <col style={{ width: '18%' }} />
                    <col style={{ width: '18%' }} />
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '14%' }} />
                    <col style={{ width: '15%' }} />
                  </colgroup>
                  <thead>
                    <tr className="divide-x divide-white/10 bg-section-navy">
                      <th className="px-2 py-2.5 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-blue-100/95">
                        PDF
                      </th>
                      <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-blue-100/95">
                        N° OC
                      </th>
                      <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-blue-100/95">
                        Empresa
                      </th>
                      <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-blue-100/95">
                        Requisitor
                      </th>
                      <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-blue-100/95">
                        Proyectos
                      </th>
                      <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-blue-100/95">
                        Fecha
                      </th>
                      <th className="px-3 py-2.5 pr-4 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-blue-100/95">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredOrdenes.map((o, i) => (
                      <tr
                        key={o.id}
                        className={[
                          'border-b border-slate-100 transition-colors hover:bg-sky-50/60',
                          i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50',
                        ].join(' ')}
                      >
                        <td className="border-l border-slate-100 px-2 py-2.5 align-middle first:border-l-0">
                          {canDownloadOcPdf ? (
                            <button
                              type="button"
                              className="mx-auto grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700"
                              title={o.archivo_nombre}
                              aria-label={`Descargar PDF de la orden ${o.numero}`}
                              onClick={() => void openOrdenPdf(o)}
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="h-5 w-5"
                                aria-hidden
                              >
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                                <line x1="12" y1="18" x2="12" y2="11" />
                                <polyline points="9 15 12 18 15 15" />
                              </svg>
                            </button>
                          ) : (
                            <span
                              className="mx-auto grid h-10 w-10 place-items-center rounded-xl border border-slate-100 bg-slate-50 text-slate-300"
                              title="Tu rol no puede descargar el PDF de la orden"
                              aria-label="PDF de la orden no disponible para descarga con tu rol"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="h-5 w-5"
                              >
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                                <line x1="12" y1="18" x2="12" y2="11" />
                                <polyline points="9 15 12 18 15 15" />
                              </svg>
                            </span>
                          )}
                        </td>
                        <td className="border-l border-slate-100 px-3 py-2.5 align-middle font-mono text-[12px] text-slate-800">
                          <button
                            type="button"
                            className="font-mono font-semibold text-blue-800 underline decoration-blue-300 underline-offset-2 hover:text-blue-950"
                            title="Ver partidas de la cotización (PDF)"
                            onClick={() => setPartidasModalOc(o)}
                          >
                            {o.numero}
                          </button>
                        </td>
                        <td className="border-l border-slate-100 px-3 py-2.5 align-middle text-[12px] text-slate-800">
                          {o.empresa?.nombre ?? '—'}
                        </td>
                        <td className="border-l border-slate-100 px-3 py-2.5 align-middle text-[12px] text-slate-800">
                          {o.requisitor?.nombre ?? '—'}
                        </td>
                        <td className="border-l border-slate-100 px-3 py-2 align-middle text-center">
                          <div className="flex flex-col items-center gap-0.5">
                            <button
                              type="button"
                              className="inline-flex min-w-[2rem] justify-center rounded-full bg-slate-100 px-2 py-0.5 text-[12px] font-bold tabular-nums text-slate-900 shadow-sm transition hover:bg-slate-200"
                              title={
                                cotizacionLineasValidas(o.cotizacion_lineas).length
                                  ? cotizacionLineasValidas(o.cotizacion_lineas)
                                      .map((t, i) => `${i + 1}. ${t}`)
                                      .join('\n')
                                  : 'Partidas / proyectos vinculados a esta OC'
                              }
                              onClick={() => setPartidasModalOc(o)}
                            >
                              {ocProyectosCount(o, projectCountByOc.get(o.id) ?? 0)}
                            </button>
                            {cotizacionLineasValidas(o.cotizacion_lineas).length === 0 &&
                            projectCountByOc.get(o.id) ? (
                              <span className="text-[10px] text-slate-500">Solo en app</span>
                            ) : null}
                          </div>
                        </td>
                        <td className="border-l border-slate-100 px-3 py-2.5 align-middle text-[12px] tabular-nums text-slate-600">
                          {o.fecha}
                        </td>
                        <td className="border-l border-slate-100 px-3 py-2.5 pr-4 align-middle text-center">
                          <div className="flex flex-col items-stretch gap-1.5">
                            <button
                              type="button"
                              className="rounded-lg bg-section-navy px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:brightness-110"
                              onClick={() => verProyectosDeOrden(o.id)}
                            >
                              Ver proyectos
                            </button>
                            {canOc ? (
                              <button
                                type="button"
                                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 shadow-sm hover:border-blue-300 hover:bg-blue-50"
                                title="Editar empresa y requisitor"
                                onClick={() => setEditOcModal(o)}
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  className="h-3.5 w-3.5"
                                  aria-hidden
                                >
                                  <path d="M12 20h9" />
                                  <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                                </svg>
                                Editar
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : folder === 'proyecto' ? (
            proyectoCombinedRows.length === 0 ? (
              <div className="py-8 px-4 text-center text-[13px] text-slate-500">
                No hay partidas leídas del PDF ni proyectos en la app para este filtro. Sube una orden con PDF de
                texto o crea proyectos con «Nuevo proyecto».
              </div>
            ) : (
              <div className="space-y-4">
                {proyectoCombinedByEmpresa.map((g) => (
                  <div
                    key={g.key}
                    className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_10px_40px_-18px_rgba(15,23,42,0.12)]"
                  >
                    <div className="rounded-t-2xl border-b border-white/10 bg-gradient-to-r from-blue-950 to-section-navy px-4 py-3 text-white shadow-sm sm:px-5 sm:py-3.5">
                      <span className="text-[14px] font-semibold tracking-tight sm:text-[15px]">{g.empresaNombre}</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[820px] table-fixed border-collapse text-left text-[13px]">
                        <colgroup>
                          <col style={{ width: '12%' }} />
                          <col style={{ width: '22%' }} />
                          <col style={{ width: '38%' }} />
                          <col style={{ width: '14%' }} />
                          <col style={{ width: '14%' }} />
                        </colgroup>
                        <thead>
                          <tr className="divide-x divide-white/10 border-b border-slate-200/90 bg-gradient-to-b from-slate-100 to-slate-50/90">
                            <th className="px-3 py-3 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-slate-600">
                              N° OC
                            </th>
                            <th className="px-3 py-3 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-slate-600">
                              Origen
                            </th>
                            <th className="px-3 py-3 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-slate-600">
                              Descripción / proyecto
                            </th>
                            <th className="px-3 py-3 text-center text-[10px] font-bold uppercase tracking-[0.1em] text-slate-600">
                              Estado
                            </th>
                            <th className="px-3 py-3 pr-4 text-center text-[10px] font-bold uppercase tracking-[0.1em] text-slate-600">
                              Avance
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {g.items.map((item) =>
                            item.kind === 'pdf' ? (
                              <tr key={item.k} className="bg-slate-50/40 transition-colors hover:bg-sky-50/40">
                                <td className="border-l border-slate-100 px-3 py-3 align-top first:border-l-0">
                                  <button
                                    type="button"
                                    className="font-mono text-[12px] font-bold text-blue-800 underline decoration-blue-400/80 underline-offset-2 hover:text-blue-950"
                                    onClick={() => setPartidasModalOc(item.oc)}
                                  >
                                    {item.oc.numero}
                                  </button>
                                </td>
                                <td className="border-l border-slate-100 px-3 py-3 align-top">
                                  <div className="flex flex-col gap-2">
                                    <BodegaOcPdfPartidaButton
                                      lineNo={item.lineNo}
                                      variant="pdf-row"
                                      canOpenPdf={canDownloadOcPdf}
                                      onOpenPdf={() => openOrdenPdfInViewer(item.oc, item.lineNo)}
                                    />
                                    <BodegaArchivosEntregasButton
                                      busy={pdfPartidaBusyKey === `${item.oc.id}:${item.lineNo}`}
                                      disabled={cotizacionLineasValidas(item.oc.cotizacion_lineas).length === 0}
                                      onClick={() => void openDeliveriesForOcPdfPartida(item.oc, item.lineNo)}
                                    />
                                  </div>
                                </td>
                                <td className="border-l border-slate-100 px-3 py-3 align-top">
                                  <p
                                    className="line-clamp-3 text-[12px] font-medium leading-snug text-slate-800"
                                    title={item.desc}
                                  >
                                    {item.desc}
                                  </p>
                                </td>
                                <td className="border-l border-slate-100 px-3 py-3 align-top text-center">
                                  <span className="inline-flex rounded-lg border border-amber-200/90 bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-950">
                                    Sin proyecto en app
                                  </span>
                                </td>
                                <td className="border-l border-slate-100 px-3 py-3 pr-4 align-top text-center">
                                  <span className="text-[12px] font-semibold text-slate-400">—</span>
                                </td>
                              </tr>
                            ) : (
                                <tr
                                  key={item.k}
                                  className={[
                                    'bg-white transition-colors hover:bg-sky-50/50',
                                    prioridadRowHighlightClass(item.row.prioridadNivel),
                                  ].join(' ')}
                                >
                                  <td className="border-l border-slate-100 px-3 py-3 align-top font-mono text-[12px] text-slate-800 first:border-l-0">
                                    {item.row.orden_compra_id ? (
                                      <button
                                        type="button"
                                        className="font-bold text-blue-800 underline decoration-blue-400/80 underline-offset-2 hover:text-blue-950"
                                        onClick={() => {
                                          const oc = ordenById.get(item.row.orden_compra_id ?? '')
                                          if (oc) setPartidasModalOc(oc)
                                        }}
                                      >
                                        {ordenById.get(item.row.orden_compra_id ?? '')?.numero ?? item.row.orden ?? '—'}
                                      </button>
                                    ) : (
                                      <div className="flex flex-col items-start gap-1.5">
                                        <span className="font-mono text-[12px] text-slate-600">
                                          {item.row.orden?.trim() || 'Sin OC'}
                                        </span>
                                        {canOc && !ocLinkColumnMissing ? (
                                          <button
                                            type="button"
                                            className="rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 text-[10px] font-bold text-sky-900 hover:bg-sky-100"
                                            onClick={() => setLinkOcProject(item.row)}
                                          >
                                            Vincular OC
                                          </button>
                                        ) : null}
                                      </div>
                                    )}
                                  </td>
                                  <td className="border-l border-slate-100 px-3 py-3 align-top">
                                    <div className="flex flex-col gap-2">
                                      {item.row.orden_compra_id != null && item.row.cotizacion_linea_idx != null ? (
                                        <BodegaOcPdfPartidaButton
                                          lineNo={item.row.cotizacion_linea_idx}
                                          variant="project-row"
                                          canOpenPdf={canDownloadOcPdf}
                                          onOpenPdf={() => {
                                            const oc = ordenById.get(item.row.orden_compra_id ?? '')
                                            if (oc) openOrdenPdfInViewer(oc, item.row.cotizacion_linea_idx)
                                          }}
                                        />
                                      ) : (
                                        <BodegaProyectoOrigenManualBadge />
                                      )}
                                      <span className="font-mono text-[11px] font-semibold text-slate-600">
                                        {item.row.folio}
                                      </span>
                                      <BodegaProjectPrioridadBadge nivel={item.row.prioridadNivel} />
                                      <BodegaArchivosEntregasButton onClick={() => void openDesignModal(item.row)} />
                                      {canTogglePrioridad ? (
                                        <div className="max-w-[15rem]">
                                          <BodegaProjectPrioridadControl
                                            compact
                                            nivel={item.row.prioridadNivel}
                                            canEdit
                                            busy={prioridadBusyId === item.row.id}
                                            onChange={(nivel) => void setProjectPrioridadNivel(item.row, nivel)}
                                          />
                                        </div>
                                      ) : null}
                                    </div>
                                  </td>
                                <td className="border-l border-slate-100 px-3 py-3 align-top">
                                  <p
                                    className="line-clamp-3 text-[12px] font-bold leading-snug text-slate-900"
                                    title={item.row.nombre}
                                  >
                                    {item.row.nombre}
                                  </p>
                                </td>
                                <td className="border-l border-slate-100 px-3 py-3 align-top text-center">
                                  <span
                                    className={[
                                      'inline-flex rounded-lg border px-2.5 py-1 text-[10px] font-bold',
                                      statusTone(item.row.status),
                                    ].join(' ')}
                                  >
                                    {statusLabel(item.row.status)}
                                  </span>
                                </td>
                                <td className="border-l border-slate-100 px-3 py-3 pr-4 align-top text-center">
                                  <span className="text-[14px] font-bold tabular-nums text-slate-900">
                                    {clampPct(item.row.avance_pct)}%
                                  </span>
                                </td>
                              </tr>
                            ),
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : folder === 'cliente' ? (
            filteredProjects.length === 0 ? (
              clienteEmpresaSoloOrdenes.length === 0 ? (
                <div className="py-8 px-4 text-center text-[13px] text-slate-500">
                  <p>
                    No hay proyectos en la app para este filtro. Si ya subiste órdenes (PDF), crea y vincula proyectos con
                    «Nuevo proyecto» para verlos aquí agrupados por empresa.
                  </p>
                  {statusFilter !== 'all' ? (
                    <p className="mt-2 text-[12px] text-slate-500">
                      Con un estado distinto de «Todos», no se muestran órdenes sin proyecto. Cambia el filtro arriba o
                      crea un proyecto con ese estado.
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="space-y-4">
                  {clienteEmpresaSoloOrdenes.map((g) => (
                      <div
                        key={g.key}
                        className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_10px_40px_-18px_rgba(15,23,42,0.15)]"
                      >
                        <div className="rounded-t-2xl border-b border-white/10 bg-gradient-to-r from-blue-950 to-section-navy px-4 py-3 text-white shadow-sm sm:px-5 sm:py-3.5">
                          <span className="text-[14px] font-semibold tracking-tight sm:text-[15px]">{g.empresaNombre}</span>
                        </div>
                        <ul className="divide-y divide-slate-100">
                          {g.ordenes.map((o) => {
                            const pdfL = cotizacionLineasValidas(o.cotizacion_lineas)
                            const preview =
                              pdfL.length > 0
                                ? pdfL
                                    .slice(0, 3)
                                    .map((t, i) => `${i + 1}. ${t}`)
                                    .join('\n') + (pdfL.length > 3 ? `\n… (+${pdfL.length - 3})` : '')
                                : ''
                            return (
                              <li
                                key={o.id}
                                className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between"
                              >
                                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1">
                                  {pdfL.length > 0 ? (
                                    <button
                                      type="button"
                                      className="shrink-0 font-mono text-[13px] font-semibold text-blue-800 underline decoration-blue-300 underline-offset-2 hover:text-blue-950"
                                      onClick={() => setPartidasModalOc(o)}
                                    >
                                      {o.numero}
                                    </button>
                                  ) : (
                                    <span className="shrink-0 font-mono text-[13px] font-semibold text-slate-800">
                                      {o.numero}
                                    </span>
                                  )}
                                  <span className="truncate text-[12px] text-slate-600" title={o.requisitor?.nombre}>
                                    {o.requisitor?.nombre ?? '—'}
                                  </span>
                                </div>
                                <div className="flex shrink-0 flex-wrap items-center gap-2">
                                  {pdfL.length > 0 ? (
                                    <button
                                      type="button"
                                      className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-white"
                                      title={preview}
                                      onClick={() => setPartidasModalOc(o)}
                                    >
                                      {pdfL.length} partida{pdfL.length === 1 ? '' : 's'} (PDF)
                                    </button>
                                  ) : (
                                    <span className="text-[11px] text-slate-400">Sin partidas en BD</span>
                                  )}
                                  {canOc ? (
                                    <button
                                      type="button"
                                      className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 shadow-sm hover:border-blue-300 hover:bg-blue-50 hover:text-blue-800"
                                      title="Editar empresa y requisitor"
                                      aria-label={`Editar OC ${o.numero}`}
                                      onClick={() => setEditOcModal(o)}
                                    >
                                      <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        className="h-4 w-4"
                                        aria-hidden
                                      >
                                        <path d="M12 20h9" />
                                        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                                      </svg>
                                    </button>
                                  ) : null}
                                  {isBodegaSupervisorFull ? (
                                    <button
                                      type="button"
                                      className="rounded-lg bg-section-navy px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:brightness-110"
                                      onClick={() => openCreate()}
                                    >
                                      Nuevo proyecto
                                    </button>
                                  ) : null}
                                </div>
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                  ))}
                </div>
              )
            ) : (
              <div className="space-y-4">
                {empresaClienteGroups.map((g) => (
                  <div
                    key={g.key}
                    className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_10px_40px_-18px_rgba(15,23,42,0.15)]"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-t-2xl border-b border-white/10 bg-gradient-to-r from-blue-950 to-section-navy px-4 py-3 text-white shadow-sm sm:px-5 sm:py-3.5">
                      <span className="text-[14px] font-semibold tracking-tight sm:text-[15px]">{g.empresaNombre}</span>
                      <span className="tabular-nums text-[13px] font-semibold text-blue-100/90">· {g.projectCount}</span>
                    </div>
                    <ul className="divide-y divide-slate-100">
                      {g.items.map((r) => {
                        const rowOc = r.orden_compra_id ? ordenById.get(r.orden_compra_id) : undefined
                        const solicitanteTitle = [r.cliente, r.empresa].filter(Boolean).join(' · ')
                        return (
                          <li
                            key={r.id}
                            className={[
                              'px-4 py-3.5 transition-colors hover:bg-sky-50/40',
                              prioridadRowHighlightClass(r.prioridadNivel),
                            ].join(' ')}
                          >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                              <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1">
                                <span className="font-mono text-[12px] font-bold text-slate-800">{r.folio}</span>
                                <BodegaProjectPrioridadBadge nivel={r.prioridadNivel} />
                                {rowOc ? (
                                  <button
                                    type="button"
                                    className="font-mono text-[12px] font-semibold text-blue-800 underline decoration-blue-300 underline-offset-2 hover:text-blue-950"
                                    onClick={() => setPartidasModalOc(rowOc)}
                                  >
                                    {rowOc.numero}
                                  </button>
                                ) : (
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="font-mono text-[12px] text-slate-600">
                                      {r.orden?.trim() || 'Sin OC'}
                                    </span>
                                    {!r.orden_compra_id && canOc && !ocLinkColumnMissing ? (
                                      <button
                                        type="button"
                                        className="rounded-lg border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-900 hover:bg-sky-100"
                                        onClick={() => setLinkOcProject(r)}
                                      >
                                        Vincular OC
                                      </button>
                                    ) : null}
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p
                                  className="line-clamp-2 text-[13px] font-semibold leading-snug text-slate-900"
                                  title={r.nombre}
                                >
                                  {r.nombre}
                                </p>
                                {solicitanteTitle ? (
                                  <p
                                    className="mt-1 truncate text-[11px] font-medium text-slate-500"
                                    title={solicitanteTitle}
                                  >
                                    {solicitanteTitle}
                                  </p>
                                ) : null}
                              </div>
                              <div className="flex shrink-0 flex-col items-stretch gap-2 self-start sm:items-end sm:self-center">
                                <div className="flex flex-wrap items-center justify-end gap-2">
                                  <span
                                    className={[
                                      'inline-flex rounded-md border px-2 py-0.5 text-[10px] font-semibold',
                                      statusTone(r.status),
                                    ].join(' ')}
                                  >
                                    {statusLabel(r.status)}
                                  </span>
                                  <span className="min-w-[2.75rem] text-right text-[13px] font-bold tabular-nums text-slate-900">
                                    {clampPct(r.avance_pct)}%
                                  </span>
                                </div>
                                {canTogglePrioridad ? (
                                  <BodegaProjectPrioridadControl
                                    compact
                                    nivel={r.prioridadNivel}
                                    canEdit
                                    busy={prioridadBusyId === r.id}
                                    onChange={(nivel) => void setProjectPrioridadNivel(r, nivel)}
                                  />
                                ) : null}
                              </div>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )
          ) : folder === 'orden' ? (
            <BodegaOrdenTab
              filas={ordenTablaFilas}
              filtro={ordenTablaFiltro}
              onFiltro={(f) => {
                setOrdenTablaFiltro(f)
                setOrdenDetalleOcKey(null)
              }}
              conteos={{ cerradas: ordenInformeFiltrado.length, curso: ordenOcEnCursoFiltradas.length }}
              detalleKey={ordenDetalleOcKey}
              onToggleDetalle={(key) => setOrdenDetalleOcKey((k) => (k === key ? null : key))}
              resumen={{
                cerradasCount: ordenInforme.cerradasCount,
                terminadosCount: ordenInforme.terminadosCount,
                activosCount: ordenInforme.activosCount,
                diasPromedioTerminados: ordenInforme.diasPromedioTerminados,
              }}
              tiempoTotal={ordenTiempoTotal}
              cargandoTiempos={ordenTimesLoading}
              hayFiltroActivo={q.trim().length > 0 || !!filterOrdenCompraId}
              onOpenInfo={() => setOrdenInfoModalOpen(true)}
              onVerPartidas={abrirPartidasDeGrupo}
              canEditPrioridad={canTogglePrioridad}
              prioridadBusyId={prioridadBusyId}
              onChangePrioridad={(projectId, nivel) => {
                const r = rows.find((x) => x.id === projectId)
                if (r) void setProjectPrioridadNivel(r, nivel)
              }}
              estadisticas={{
                chartProyectosMes: ordenInforme.chartProyectosMes,
                chartOcsMes: ordenInforme.chartOcsMes,
                chartProyectosAño: ordenInforme.chartProyectosAño,
                maxChart: ordenInforme.maxChart,
                maxAño: ordenInforme.maxAño,
                semanaProyectos: ordenInforme.semanaProyectos,
                semanaOcs: ordenInforme.semanaOcs,
                mesProyectos: ordenInforme.mesProyectos,
                mesOcs: ordenInforme.mesOcs,
                añoProyectos: ordenInforme.añoProyectos,
                añoOcs: ordenInforme.añoOcs,
              }}
              estadisticasOpen={ordenEstadisticasOpen}
              onToggleEstadisticas={() => setOrdenEstadisticasOpen((v) => !v)}
            />
          ) : (
            <div className="py-8 text-center text-[13px] text-slate-500">Sin datos.</div>
          )}
        </div>
      </div>
      {ordenInfoModalOpen ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/55 backdrop-blur-[1px]"
            aria-label="Cerrar información"
            onClick={() => setOrdenInfoModalOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="orden-info-titulo"
            className="relative max-h-[min(88vh,640px)] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl sm:p-6"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <h2 id="orden-info-titulo" className="pr-2 text-lg font-bold text-slate-900">
                Información — vista Orden
              </h2>
              <button
                type="button"
                className="shrink-0 rounded-lg px-2.5 py-1 text-[13px] font-semibold text-slate-600 transition hover:bg-slate-100"
                onClick={() => setOrdenInfoModalOpen(false)}
              >
                Cerrar
              </button>
            </div>
            <div className="mt-4 space-y-3 text-[13px] leading-relaxed text-slate-700">
              <p>
                Esta pestaña resume cada <strong>orden de compra (OC)</strong> con el tiempo que realmente se registró en
                relojes (Inicio / Terminar), separado por etapa, y el <strong>% de avance</strong> por proyecto.
              </p>
              <ul className="list-disc space-y-2 pl-5">
                <li>
                  <strong>Horario hábil</strong>: lun–vie 8:00–17:30. Fuera de ese horario no suman minutos.
                </li>
                <li>
                  <strong>Un reloj por proyecto</strong>: el tiempo solo corre cuando alguien inicia el reloj en ese folio
                  (diseño en entregas, programación CNC, maquinado, perfilado, detallado o armado). Si trabajas dos
                  proyectos a la vez, cada uno acumula por separado.
                </li>
                <li>
                  <strong>Etapas</strong>: diseño, programación (CNC/torno + archivos), maquinado, perfilado, detallado y
                  armado. «—» significa que aún no hubo reloj en esa etapa.
                </li>
                <li>
                  <strong>Suma por OC</strong>: los totales de la tarjeta son la suma de todos los folios. No es «horas de una
                  persona», sino carga registrada en la orden.
                </li>
                <li>
                  <strong>En curso</strong>: si hay un reloj abierto verás la etiqueta «En curso» y el tiempo sigue
                  actualizándose al recargar.
                </li>
                <li>
                  <strong>Órdenes cerradas</strong>: cuando todos los proyectos están «Terminado»; la fecha es la del último
                  en cerrar.
                </li>
              </ul>
              <OrdenTimeLegend />
            </div>
          </div>
        </div>
      ) : null}

      {creating ? (
        <div className="fixed inset-0 z-50 grid place-items-center p-4 sm:p-6">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-[2px] transition hover:bg-slate-900/65"
            aria-label="Cerrar"
            onClick={() => setCreating(false)}
          />
          <div className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-blue-950/25 bg-white shadow-2xl shadow-blue-950/15 ring-1 ring-blue-950/10">
            <div className="border-b border-blue-950/25 bg-section-navy px-4 py-4 text-white sm:px-6 sm:py-5">
              <div className="text-lg font-bold tracking-tight sm:text-xl">Nuevo proyecto (Bodega)</div>
              <p className="mt-1 text-sm text-blue-100/88">
                Vincula a una orden de compra para agrupar cotizaciones (varios proyectos = varias cotizaciones de la
                misma OC).
              </p>
            </div>
            <div className="max-h-[min(74vh,640px)] overflow-y-auto bg-gradient-to-b from-slate-50 via-white to-slate-50/90 p-4 sm:p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Orden de compra (opcional)
                  </span>
                  <select
                    value={createOrdenCompraId}
                    onChange={(e) => onSelectOrdenCompraForProject(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-950/45 focus:ring-2 focus:ring-section-navy/20"
                  >
                    <option value="">— Sin vincular —</option>
                    {ordenes.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.numero} · {o.empresa?.nombre ?? 'Empresa'} · {o.archivo_nombre}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Folio</span>
                  <input
                    value={createFolio}
                    onChange={(e) => setCreateFolio(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-950/45 focus:ring-2 focus:ring-section-navy/20"
                    placeholder="Ej: COT-001"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">N° orden (texto)</span>
                  <input
                    value={createOrden}
                    onChange={(e) => setCreateOrden(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-950/45 focus:ring-2 focus:ring-section-navy/20"
                    placeholder="Se rellena al elegir OC"
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Cliente (requisitor)</span>
                  <input
                    value={createCliente}
                    onChange={(e) => setCreateCliente(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-950/45 focus:ring-2 focus:ring-section-navy/20"
                    placeholder="Nombre"
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Empresa</span>
                  <input
                    value={createEmpresa}
                    onChange={(e) => setCreateEmpresa(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-950/45 focus:ring-2 focus:ring-section-navy/20"
                    placeholder="Empresa cliente"
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Nombre del proyecto</span>
                  <input
                    value={createNombre}
                    onChange={(e) => setCreateNombre(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-950/45 focus:ring-2 focus:ring-section-navy/20"
                    placeholder="Ej: Pieza / molde — cotización 1 de 5"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Estado</span>
                  <select
                    value={createStatus}
                    onChange={(e) => setCreateStatus(e.target.value as ProjectStatus)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-950/45 focus:ring-2 focus:ring-section-navy/20"
                  >
                    <option value="en_diseno">En diseño</option>
                    <option value="revision_diseno">Revisión diseño</option>
                    <option value="modificacion_diseno">Modificación diseño</option>
                    <option value="diseno_aprobado">Diseño aprobado</option>
                    <option value="en_programacion">En programación</option>
                    <option value="revision_programacion">Revisión programación</option>
                    <option value="terminado">Terminado</option>
                  </select>
                </label>
              </div>
            </div>
            <div className="border-t border-slate-200/90 bg-gradient-to-r from-slate-50 to-white px-4 py-4 sm:px-6">
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
                  onClick={() => setCreating(false)}
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  disabled={createBusy}
                  className="inline-flex items-center justify-center rounded-xl bg-section-navy px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-950/25 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => void createProject()}
                >
                  {createBusy ? 'Creando…' : 'Crear proyecto'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <OrdenCompraPdfViewerModal
        oc={ordenPdfViewer?.oc ?? null}
        partidaLineNo={ordenPdfViewer?.partidaLineNo ?? null}
        onClose={() => setOrdenPdfViewer(null)}
      />

      {partidasModalOc ? (
        <div className="fixed inset-0 z-50 grid place-items-center p-4 sm:p-6">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-[2px] transition hover:bg-slate-900/65"
            aria-label="Cerrar"
            onClick={() => setPartidasModalOc(null)}
          />
          <div className="relative max-h-[min(85vh,640px)] w-full max-w-lg overflow-hidden rounded-3xl border border-blue-950/25 bg-white shadow-2xl shadow-blue-950/15 ring-1 ring-blue-950/10">
            <div className="border-b border-blue-950/25 bg-section-navy px-4 py-4 text-white sm:px-6 sm:py-5">
              <div className="text-lg font-bold tracking-tight sm:text-xl">Partidas de la orden</div>
              <p className="mt-1 font-mono text-sm text-blue-100/95">{partidasModalOc.numero}</p>
              <p className="mt-1 text-[13px] text-blue-100/88">
                <span className="font-semibold text-white">Empresa:</span>{' '}
                {partidasModalOc.empresa?.nombre ?? '—'} ·{' '}
                <span className="font-semibold text-white">Solicitante:</span>{' '}
                {partidasModalOc.requisitor?.nombre ?? '—'}
              </p>
            </div>
            <div className="max-h-[min(52vh,420px)] overflow-y-auto p-4 sm:p-6">
              {cotizacionLineasValidas(partidasModalOc.cotizacion_lineas).length === 0 ? (
                <p className="text-[13px] leading-relaxed text-slate-600">
                  No hay partidas guardadas desde el PDF. Vuelve a adjuntar la orden (texto seleccionable) o crea
                  proyectos manualmente en la app.
                </p>
              ) : (
                <ol className="list-decimal space-y-2.5 pl-5 text-[13px] leading-snug text-slate-900">
                  {cotizacionLineasValidas(partidasModalOc.cotizacion_lineas).map((t, idx) => (
                    <li key={idx} className="pl-1">
                      {t}
                    </li>
                  ))}
                </ol>
              )}
            </div>
            <div className="border-t border-slate-200/90 bg-slate-50 px-4 py-3 sm:px-6">
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  disabled={!canDownloadOcPdf}
                  title={
                    canDownloadOcPdf
                      ? 'Abrir PDF en una pestaña nueva'
                      : 'Tu rol no puede descargar ni abrir el PDF de la orden'
                  }
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
                  onClick={() => openOrdenPdfInViewer(partidasModalOc, null)}
                >
                  Ver PDF
                </button>
                <button
                  type="button"
                  className="rounded-xl bg-section-navy px-4 py-2 text-sm font-bold text-white shadow-sm hover:brightness-110"
                  onClick={() => {
                    verProyectosDeOrden(partidasModalOc.id)
                    setPartidasModalOc(null)
                  }}
                >
                  Ver en pestaña Proyecto
                </button>
                <button
                  type="button"
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
                  onClick={() => setPartidasModalOc(null)}
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {editOcModal ? (
        <OrdenCompraCatalogEditModal
          oc={editOcModal}
          empresaOpts={empresaOpts}
          requisitorOpts={requisitorOpts}
          onClose={() => setEditOcModal(null)}
          onSaved={({ empresaOpts: emp, requisitorOpts: req }) => {
            setEmpresaOpts(emp)
            setRequisitorOpts(req)
            void load()
          }}
        />
      ) : null}

      {linkOcProject ? (
        <ProjectLinkOrdenCompraModal
          project={{
            id: linkOcProject.id,
            folio: linkOcProject.folio,
            nombre: linkOcProject.nombre,
            cliente: linkOcProject.cliente,
            empresa: linkOcProject.empresa,
          }}
          ordenes={ordenes}
          empresaOpts={empresaOpts}
          requisitorOpts={requisitorOpts}
          onClose={() => setLinkOcProject(null)}
          onLinked={() => {
            const pid = linkOcProject.id
            void (async () => {
              await load()
              await refreshModalProjectFromServer(pid)
              setBodegaNotice('Orden de compra vinculada al proyecto.')
            })()
          }}
        />
      ) : null}

      {uploadOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center p-4 sm:p-6">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-[2px] transition hover:bg-slate-900/65"
            aria-label="Cerrar"
            onClick={() => setUploadOpen(false)}
          />
          <div className="relative flex max-h-[min(92vh,820px)] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-blue-950/25 bg-white shadow-2xl shadow-blue-950/15 ring-1 ring-blue-950/10">
            <div className="shrink-0 border-b border-blue-950/25 bg-section-navy px-4 py-4 text-white sm:px-6 sm:py-5">
              <div className="text-lg font-bold tracking-tight sm:text-xl">Adjuntar orden de compra</div>
              <p className="mt-1 text-sm text-blue-100/88">PDF en la nube; luego crea un proyecto por cada cotización.</p>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 sm:p-6">
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Archivo PDF</span>
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  className="mt-1 w-full text-[13px] text-slate-800"
                  disabled={uploadPdfParsing}
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null
                    setUploadFile(f)
                    if (f) void applyPdfAutofill(f)
                    else {
                      setUploadPdfNote(null)
                      setUploadPdfParsing(false)
                      setUploadEmpresaPdfText('')
                      setUploadRequisitorPdfText('')
                      setUploadCotizacionLineas([])
                    }
                  }}
                />
                {uploadPdfParsing ? (
                  <p className="mt-2 text-[12px] text-slate-600">Leyendo PDF y detectando datos…</p>
                ) : null}
                {uploadPdfNote ? (
                  <p className="mt-2 max-h-32 overflow-y-auto rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-snug text-amber-950 break-words">
                    {uploadPdfNote}
                  </p>
                ) : null}
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Número de orden</span>
                <input
                  value={uploadNumero}
                  onChange={(e) => setUploadNumero(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-950/45 focus:ring-2 focus:ring-section-navy/20"
                  placeholder="Ej: C-10003517612"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Fecha</span>
                <input
                  type="date"
                  value={uploadFecha}
                  onChange={(e) => setUploadFecha(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-950/45 focus:ring-2 focus:ring-section-navy/20"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Empresa</span>
                <select
                  value={uploadEmpresaId}
                  onChange={(e) => setUploadEmpresaId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-950/45 focus:ring-2 focus:ring-section-navy/20"
                >
                  <option value="">—</option>
                  {empresaOpts.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.nombre}
                    </option>
                  ))}
                </select>
                {uploadEmpresaPdfText ? (
                  <p className="mt-1.5 max-h-24 overflow-y-auto text-[12px] leading-snug text-slate-600 break-words">
                    <span className="font-semibold text-slate-700">Texto detectado en el PDF (empresa / comprador):</span>{' '}
                    {uploadEmpresaPdfText}
                  </p>
                ) : null}
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Requisitor</span>
                <select
                  value={uploadRequisitorId}
                  onChange={(e) => setUploadRequisitorId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-950/45 focus:ring-2 focus:ring-section-navy/20"
                >
                  <option value="">—</option>
                  {requisitorOpts.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.nombre}
                    </option>
                  ))}
                </select>
                {uploadRequisitorPdfText ? (
                  <p className="mt-1.5 max-h-24 overflow-y-auto text-[12px] leading-snug text-slate-600 break-words">
                    <span className="font-semibold text-slate-700">Texto detectado en el PDF (contacto):</span>{' '}
                    {uploadRequisitorPdfText}
                  </p>
                ) : null}
              </label>
              {uploadCotizacionLineas.length > 0 ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50/90 px-3 py-2.5">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Partidas de la cotización ({uploadCotizacionLineas.length})
                  </div>
                  <ol className="mt-2 max-h-[min(12rem,28vh)] list-decimal space-y-1 overflow-y-auto overscroll-contain pl-4 text-[12px] leading-snug text-slate-800">
                    {uploadCotizacionLineas.map((t, idx) => (
                      <li key={idx} className="break-words pl-1">
                        {t}
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
            </div>
            <div className="shrink-0 border-t border-slate-200/90 bg-gradient-to-r from-slate-50 to-white px-4 py-4 sm:px-6">
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
                  onClick={() => setUploadOpen(false)}
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  disabled={uploadBusy || uploadPdfParsing}
                  className="inline-flex items-center justify-center rounded-xl bg-section-navy px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-950/25 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => void submitUpload()}
                >
                  {uploadBusy ? 'Subiendo…' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {xtPruebaOpen ? <BodegaXtPruebaPanel onClose={() => setXtPruebaOpen(false)} /> : null}
    </section>
  )
}
