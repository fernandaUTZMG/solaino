/** Admin global o supervisor de bodega (encargado) pueden gestionar usuarios operativos. */
export function canManageUsers(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'encargado'
}

export function encargadoCannotManageAdminTarget(
  callerRole: string,
  targetRole: string | null | undefined,
): boolean {
  if (callerRole !== 'encargado') return false
  const manageable = new Set([
    'user',
    'encargado',
    'disenadora',
    'programadora_maquinaria',
    'operador_bodega',
  ])
  return !manageable.has(String(targetRole ?? ''))
}

export function encargadoCannotAssignRole(callerRole: string, assignRole: string): boolean {
  return callerRole === 'encargado' && assignRole === 'admin'
}
