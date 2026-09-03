import type { ProjectActivityRow } from '../../lib/projectActivityRepo'

export type ActivityHistorialFilter =
  | 'todos'
  | 'notas'
  | 'aprobaciones'
  | 'rechazos'
  | 'subidas'
  | 'avance'
  | 'estado'
  | 'otros'

export const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  project_note: 'Nota',
  avance_manual: 'Avance manual',
  design_uploaded: 'ZIP diseño',
  design_approved: 'Diseño aprobado',
  design_revision_requested: 'Rechazo / cambios',
  status_changed: 'Estado',
  piece_photo_uploaded: 'Foto pieza',
  machine_uploaded: 'ZIP programación',
}

export const ACTIVITY_FILTER_OPTIONS: Array<{
  id: ActivityHistorialFilter
  label: string
  description: string
}> = [
  { id: 'todos', label: 'Todos', description: 'Sin filtro' },
  { id: 'notas', label: 'Notas', description: 'Comentarios guardados en el proyecto' },
  { id: 'aprobaciones', label: 'Aprobaciones', description: 'Diseño aprobado por supervisor' },
  { id: 'rechazos', label: 'Rechazos', description: 'Cambios o revisión solicitada' },
  { id: 'subidas', label: 'Subidas', description: 'ZIP de diseño u otros archivos' },
  { id: 'avance', label: 'Avance', description: 'Porcentaje de avance manual' },
  { id: 'estado', label: 'Estado', description: 'Cambios de estado del proyecto' },
  { id: 'otros', label: 'Otros', description: 'Fotos, programación y demás eventos' },
]

export function activityTypeLabel(type: string): string {
  return ACTIVITY_TYPE_LABELS[type] ?? type.replace(/_/g, ' ')
}

export function activityHistorialCategory(type: string): ActivityHistorialFilter {
  if (type === 'project_note') return 'notas'
  if (type === 'design_approved') return 'aprobaciones'
  if (type === 'design_revision_requested') return 'rechazos'
  if (type === 'design_uploaded' || type === 'machine_uploaded') return 'subidas'
  if (type === 'avance_manual') return 'avance'
  if (type === 'status_changed') return 'estado'
  return 'otros'
}

export function filterActivitiesByCategory(
  activities: ProjectActivityRow[],
  filter: ActivityHistorialFilter,
): ProjectActivityRow[] {
  if (filter === 'todos') return activities
  return activities.filter((a) => activityHistorialCategory(a.type) === filter)
}

export function activityBadgeClass(type: string): string {
  const cat = activityHistorialCategory(type)
  switch (cat) {
    case 'notas':
      return 'border-pink-300 bg-pink-100 text-pink-950'
    case 'aprobaciones':
      return 'border-emerald-300 bg-emerald-100 text-emerald-950'
    case 'rechazos':
      return 'border-rose-300 bg-rose-100 text-rose-950'
    case 'subidas':
      return 'border-sky-300 bg-sky-100 text-sky-950'
    case 'avance':
      return 'border-violet-300 bg-violet-100 text-violet-950'
    case 'estado':
      return 'border-amber-300 bg-amber-100 text-amber-950'
    default:
      return 'border-slate-300 bg-slate-100 text-slate-800'
  }
}

export function filtersWithResults(
  activities: ProjectActivityRow[],
): ActivityHistorialFilter[] {
  const set = new Set<ActivityHistorialFilter>()
  for (const a of activities) {
    set.add(activityHistorialCategory(a.type))
  }
  const order: ActivityHistorialFilter[] = [
    'todos',
    'notas',
    'aprobaciones',
    'rechazos',
    'subidas',
    'avance',
    'estado',
    'otros',
  ]
  return order.filter((id) => id === 'todos' || set.has(id))
}
