import type { AppRole } from './roles'
import { BODEGA_PROYECTOS_BUCKET } from './bodegaObjectStorage'
import { insertProjectActivity } from './projectActivityRepo'
import { getSupabase } from './supabaseClient'
import { sanitizeStorageFileName } from './bodegaOrdenes'
import {
  assertBodegaProyectosStorageZipAllowed,
  uploadBodegaProyectosBinary,
} from './bodegaStorageUpload'
import { syncProjectPiecesFromDesignPathsDetailed } from './bodegaPiecesRepo'
import { closeProgrammingDeliveryClock } from './bodegaWorkIntervalClose'
import {
  fetchNextMachineVersionNumber,
  insertMachineVersion,
  type ProjectMachineVersionRow,
} from './machineVersionsRepo'
import { analyzeDesignZip } from './zipDesignPackage'
import { supervisorSetProjectStatus } from './bodegaProjectStatus'

export type ProgrammingDeliveryProject = {
  id: string
  folio: string
  status: string
}

export function hasProgrammingDeliveryUpload(
  machineVersions: ProjectMachineVersionRow[],
): boolean {
  return machineVersions.some(
    (v) => v.cnc_module === 'programacion' && v.status !== 'requiere_cambios',
  )
}

export async function runProgrammingDeliveryUpload(args: {
  project: ProgrammingDeliveryProject
  file: File
  comment: string | null
  uploaderRole: AppRole
  onPhase?: (phase: string) => void
}): Promise<{ piecesAdded: number }> {
  const phase = (p: string) => args.onPhase?.(p)
  assertBodegaProyectosStorageZipAllowed(args.file)

  phase('Analizando ZIP de programación…')
  const analysis = await analyzeDesignZip(args.file)
  const entryPaths = (analysis.manifest.entryPaths as string[] | undefined) ?? []

  phase('Subiendo a la nube…')
  const nextV = await fetchNextMachineVersionNumber(args.project.id, 'programacion')
  const sb = getSupabase()
  const safeName = sanitizeStorageFileName(args.file.name.replace(/\.zip$/i, '') + '.zip')
  const path = `${args.project.folio}/programacion/entregas/v${nextV}/${crypto.randomUUID()}-${safeName}`
  await uploadBodegaProyectosBinary(sb, BODEGA_PROYECTOS_BUCKET, path, args.file, 'application/zip')

  phase('Registrando entrega…')
  await insertMachineVersion({
    projectId: args.project.id,
    version: nextV,
    cncModule: 'programacion',
    zipStoragePath: path,
    zipFilename: args.file.name,
    status: 'subida',
    entryHtmlPath: analysis.entryHtmlPath,
    manifest: analysis.manifest as unknown as Record<string, unknown>,
    comentarios: args.comment,
  })

  phase('Creando piezas de producción…')
  const sync = await syncProjectPiecesFromDesignPathsDetailed(args.project.id, entryPaths, {
    swPartOnly: true,
  })

  if (sync.added === 0 && entryPaths.filter((p) => /\.(prt|sldprt|slcprt)$/i.test(p)).length === 0) {
    throw new Error('El ZIP no contiene piezas .PRT / .SLDPRT / .SLCPRT reconocibles.')
  }

  const { data: pieceRows } = await sb
    .from('bodega_project_pieces')
    .select('id, finish_spec, design_status')
    .eq('project_id', args.project.id)

  const toPatch = ((pieceRows ?? []) as Array<{ id: string; finish_spec: string | null; design_status: string | null }>)
    .filter((p) => !p.finish_spec || !p.design_status)
  for (const p of toPatch) {
    await sb
      .from('bodega_project_pieces')
      .update({
        finish_spec: p.finish_spec ?? 'sin_tratamiento',
        design_status: p.design_status ?? 'aprobada',
      })
      .eq('id', p.id)
  }

  await closeProgrammingDeliveryClock(args.project.id)

  if (
    !['en_programacion', 'revision_programacion', 'terminado'].includes(args.project.status)
  ) {
    await supervisorSetProjectStatus({
      projectId: args.project.id,
      status: 'en_programacion',
    })
  }

  await insertProjectActivity({
    projectId: args.project.id,
    type: 'programming_delivery_uploaded',
    payload: {
      version: nextV,
      zip_filename: args.file.name,
      pieces_added: sync.added,
      actor_role: args.uploaderRole,
    },
  })

  return { piecesAdded: sync.added }
}
