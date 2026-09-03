export const APP_ROLES = [
  'admin',
  'user',
  'encargado',
  'disenadora',
  'programadora_maquinaria',
  'operador_bodega',
] as const

export type AppRole = (typeof APP_ROLES)[number]

export function isAppRole(x: unknown): x is AppRole {
  return typeof x === 'string' && (APP_ROLES as readonly string[]).includes(x)
}

export function roleLabel(role: AppRole): string {
  switch (role) {
    case 'admin':
      return 'Administrador'
    case 'encargado':
      return 'Supervisor / encargado (Inventario + Bodega)'
    case 'disenadora':
      return 'Diseñadora (Bodega)'
    case 'programadora_maquinaria':
      return 'Programadora maquinaria (Bodega)'
    case 'operador_bodega':
      return 'Operador taller (Bodega)'
    default:
      return 'Usuario'
  }
}

export function canAccessInventory(role: AppRole): boolean {
  if (role === 'admin') return true
  if (role === 'encargado') return true
  if (role === 'user') return true
  return false
}

/** Crear/editar/eliminar productos, ajustes y operaciones completas de inventario. */
export function canManageInventory(role: AppRole): boolean {
  return role === 'admin' || role === 'encargado'
}

export function canAccessBodega(role: AppRole): boolean {
  // Admin mayor: sí
  if (role === 'admin') return true
  // Encargado + roles operativos de bodega: sí
  if (role === 'encargado' || role === 'disenadora' || role === 'programadora_maquinaria' || role === 'operador_bodega')
    return true
  // Usuario de inventario: no
  return false
}

export function canAccessAdminTools(role: AppRole): boolean {
  // Panel Inicio, Historial global de inventario y herramientas solo del administrador mayor
  return role === 'admin'
}

/** Crear/editar usuarios, restablecer contraseñas y atender solicitudes de recuperación. */
export function canManageUsers(role: AppRole): boolean {
  return role === 'admin' || role === 'encargado'
}

/** Roles que el supervisor (encargado) puede asignar — no incluye administrador mayor. */
export function rolesAssignableByManager(managerRole: AppRole): AppRole[] {
  if (managerRole === 'admin') return [...APP_ROLES]
  return ['user', 'encargado', 'disenadora', 'programadora_maquinaria', 'operador_bodega']
}

/** El encargado no puede editar cuentas admin ni fuera de bodega/inventario operativo. */
export function canManagerEditUserProfile(managerRole: AppRole, targetRole: string): boolean {
  if (managerRole === 'admin') return true
  return (
    targetRole === 'user' ||
    targetRole === 'encargado' ||
    targetRole === 'disenadora' ||
    targetRole === 'programadora_maquinaria' ||
    targetRole === 'operador_bodega'
  )
}

/** Limpiar bitácora de auditoría (administrador mayor). */
export function canClearAuditLog(role: AppRole): boolean {
  return role === 'admin'
}

/** Módulo «Solicitudes» (inventario): admin y supervisor de bodega (encargado). */
export function canAccessSolicitudesNav(role: AppRole): boolean {
  return canManageSolicitudes(role)
}

/** Ver todas las solicitudes y cambiar estado (aprobar, rechazar, entregar). */
export function canManageSolicitudes(role: AppRole): boolean {
  return role === 'admin' || role === 'encargado'
}

/**
 * Vista «Archivos» (nav en Bodega): subir ZIP de diseño de referencia para la diseñadora.
 * Admin y supervisor de bodega (encargado).
 */
export function canAccessBodegaArchivosDisenoNav(role: AppRole): boolean {
  return role === 'admin' || role === 'encargado'
}

/** Reportes de tiempos por OC/proyecto, contratiempos y notas (supervisión y oficina). */
export function canAccessBodegaReportesNav(role: AppRole): boolean {
  return (
    role === 'admin' ||
    role === 'encargado' ||
    role === 'disenadora' ||
    role === 'programadora_maquinaria'
  )
}

/** Plan de trabajo y producción semanal (menú «Producción»). */
export function canAccessProduccionNav(role: AppRole): boolean {
  return canAccessBodega(role)
}

/** @deprecated Usar canAccessProduccionNav */
export function canAccessBodegaPlanTrabajoNav(role: AppRole): boolean {
  return canAccessProduccionNav(role)
}

/** Crear/editar filas del plan semanal (admin / encargado). */
export function canManageBodegaWeeklyPlan(role: AppRole): boolean {
  return canManageBodegaLikeAdmin(role)
}

/** Exportar plan semanal a Excel o PDF (solo admin y supervisor de bodega). */
export function canExportBodegaWeeklyPlan(role: AppRole): boolean {
  return canManageBodegaLikeAdmin(role)
}

/** Vista «Prioridades» en menú: cola global para diseñadora, programadora y operador de taller. */
export function canAccessBodegaPrioridadesNav(role: AppRole): boolean {
  return (
    canAccessBodega(role) &&
    (role === 'disenadora' || role === 'programadora_maquinaria' || role === 'operador_bodega')
  )
}

/** Registrar/editar órden de compra + subir PDF (alineado con RLS en Supabase). */
export function canManageBodegaPurchaseOrders(role: AppRole): boolean {
  return role === 'admin' || role === 'encargado'
}

/** Descargar o abrir el PDF original de la orden de compra (Storage). Diseñadora y programadora no. */
export function canDownloadBodegaOrdenCompraPdf(role: AppRole): boolean {
  return role === 'admin' || role === 'encargado'
}

/**
 * Supervisor de bodega (encargado): mismo poder que admin en catálogos, proyectos manuales
 * y adjuntos del flujo bodega (no incluye Usuarios / Historial global).
 */
export function canManageBodegaLikeAdmin(role: AppRole): boolean {
  return role === 'admin' || role === 'encargado'
}

/** Asignar nivel de prioridad por proyecto (0–4); diseñadora y programadora solo ven el indicador. */
export function canSetBodegaProjectPrioridad(role: AppRole): boolean {
  return canManageBodegaLikeAdmin(role)
}

/** Recibe avisos cuando admin/encargado cambia la prioridad de un proyecto. */
export function canReceiveBodegaPrioridadNotifications(role: AppRole): boolean {
  return role === 'disenadora' || role === 'programadora_maquinaria' || role === 'operador_bodega'
}

/** Módulo Histórico (archivo + vista del flujo). */
export function canAccessHistoricoNav(role: AppRole): boolean {
  return (
    role === 'admin' ||
    role === 'encargado' ||
    role === 'disenadora' ||
    role === 'programadora_maquinaria'
  )
}

/**
 * Área de almacenamiento por rol (ids internos `disenadora` | `programacion`).
 * Programadora usa `disenadora` (ruta historico/disenadora/) donde está el respaldo USB actual;
 * diseñadora usa `programacion` para el histórico de diseño (etiquetas en UI vía historicoAreaLabel).
 */
export function historicoAreasForRole(role: AppRole): Array<'disenadora' | 'programacion'> {
  if (role === 'admin' || role === 'encargado') return ['disenadora', 'programacion']
  if (role === 'disenadora') return ['programacion']
  if (role === 'programadora_maquinaria') return ['disenadora']
  return []
}

export function defaultHistoricoAreaForRole(role: AppRole): 'disenadora' | 'programacion' | null {
  const areas = historicoAreasForRole(role)
  return areas[0] ?? null
}

export function canDeleteHistoricoFiles(role: AppRole): boolean {
  return role === 'admin' || role === 'encargado'
}

/**
 * Subir entregas ZIP de diseño (versionado en `project_design_versions`).
 * Referencia del cliente para la diseñadora: solo Bodega → Archivos (encargado/admin).
 */
export function canUploadBodegaDesign(role: AppRole): boolean {
  return role === 'admin' || role === 'encargado' || role === 'disenadora'
}

/** Aprobar / pedir cambios de entregas de diseño. */
export function canReviewBodegaDesign(role: AppRole): boolean {
  return role === 'admin' || role === 'encargado'
}

/** Adjuntar o reemplazar el plano PDF de una pieza (fuera del ZIP). */
export function canAttachPieceDesignDrawing(role: AppRole): boolean {
  return canUploadBodegaDesign(role) || canReviewBodegaDesign(role)
}

/** Plano en programación / maquinado: ver y adjuntar si faltó. */
export function canAttachPiecePlanoInProduction(role: AppRole): boolean {
  return canAttachPieceDesignDrawing(role) || canUploadBodegaMachine(role) || canManageBodegaLikeAdmin(role)
}

/** Subir ZIP de programación / CNC. */
export function canUploadBodegaMachine(role: AppRole): boolean {
  return role === 'admin' || role === 'encargado' || role === 'programadora_maquinaria'
}

/** Subir fotos de piezas (armado / prueba). */
export function canUploadBodegaPiecePhotos(role: AppRole): boolean {
  return role === 'admin' || role === 'encargado' || role === 'disenadora' || role === 'programadora_maquinaria'
}

/** Crear todos los proyectos de una OC desde las partidas del PDF (una pasada). Solo admin y supervisor de bodega. */
export function canBulkCreateProjectsFromOc(role: AppRole): boolean {
  return role === 'admin' || role === 'encargado'
}

/** Menú superior «Maquinado» — cola CNC/Torno (todas las piezas listas). */
export function canAccessMaquinadoNav(role: AppRole): boolean {
  return role === 'admin' || role === 'encargado' || role === 'programadora_maquinaria'
}

/** Alias interno (permisos de pieza). */
export function canAccessTallerMaquinadoQueue(role: AppRole): boolean {
  return canAccessMaquinadoNav(role)
}

/** Menú «Taller» y pestaña en proyecto — perfilado, armado, detallado (operador y programadora). */
export function canAccessTallerOperadorNav(role: AppRole): boolean {
  return (
    role === 'admin' ||
    role === 'encargado' ||
    role === 'operador_bodega' ||
    role === 'programadora_maquinaria'
  )
}

/** @deprecated Usar canAccessTallerOperadorNav o canAccessMaquinadoNav */
export function canAccessTallerOperadorStages(role: AppRole): boolean {
  return canAccessTallerOperadorNav(role)
}

/** Cualquier vista de taller (maquinado o etapas operador). */
export function canAccessOperadorTallerView(role: AppRole): boolean {
  return canAccessMaquinadoNav(role) || canAccessTallerOperadorNav(role)
}

/** Cierre formal «Finalizar proyecto» tras fotos (solo supervisor / admin). */
export function canSupervisorFinalizeBodegaProject(role: AppRole): boolean {
  return role === 'admin' || role === 'encargado'
}

/** Registrar % de avance manual (sin ZIP) desde diseño, programación o supervisor. */
export function canSetManualBodegaProjectAvance(role: AppRole): boolean {
  return role === 'admin' || role === 'encargado' || role === 'disenadora' || role === 'programadora_maquinaria'
}

/** Guardar comentario en el historial del proyecto (nota), sin cambiar avance. */
export function canSaveBodegaProjectNote(role: AppRole): boolean {
  return (
    role === 'admin' ||
    role === 'encargado' ||
    role === 'disenadora' ||
    role === 'programadora_maquinaria' ||
    role === 'operador_bodega'
  )
}

