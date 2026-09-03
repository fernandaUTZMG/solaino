/** Prioridad por proyecto (0 = normal). Orden global entre OCs: mayor número = más urgente. */
export type ProjectPrioridadNivel = 0 | 1 | 2 | 3 | 4

export type ProjectPrioridadMeta = {
  nivel: ProjectPrioridadNivel
  label: string
  short: string
  badgeClass: string
  cardRingClass: string
}

export const PROJECT_PRIORIDAD_OPTIONS: readonly ProjectPrioridadMeta[] = [
  {
    nivel: 0,
    label: 'Normal',
    short: 'Normal',
    badgeClass: '',
    cardRingClass: '',
  },
  {
    nivel: 1,
    label: 'Prioridad baja',
    short: 'Baja',
    badgeClass: 'border-amber-300/90 bg-amber-100 text-amber-950',
    cardRingClass: 'ring-1 ring-amber-200/80',
  },
  {
    nivel: 2,
    label: 'Prioridad media',
    short: 'Media',
    badgeClass: 'border-orange-300/90 bg-orange-500 text-white',
    cardRingClass: 'ring-1 ring-orange-200/80',
  },
  {
    nivel: 3,
    label: 'Prioridad alta',
    short: 'Alta',
    badgeClass: 'border-rose-400/90 bg-rose-600 text-white',
    cardRingClass: 'ring-1 ring-rose-300/80',
  },
  {
    nivel: 4,
    label: 'Urgente',
    short: 'Urgente',
    badgeClass: 'border-rose-500 bg-rose-700 text-white shadow-sm',
    cardRingClass: 'ring-2 ring-rose-400/70',
  },
] as const

const BY_NIVEL = new Map(PROJECT_PRIORIDAD_OPTIONS.map((o) => [o.nivel, o]))

export function normalizePrioridadNivel(v: unknown): ProjectPrioridadNivel {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return 0
  const i = Math.round(n)
  if (i <= 0) return 0
  if (i >= 4) return 4
  return i as ProjectPrioridadNivel
}

/** Lee `prioridad_nivel` o el booleano legado `prioridad` (true → alta = 3). */
export function parsePrioridadFromRow(row: {
  prioridad_nivel?: unknown
  prioridad?: unknown
}): ProjectPrioridadNivel {
  if (row.prioridad_nivel !== undefined && row.prioridad_nivel !== null) {
    return normalizePrioridadNivel(row.prioridad_nivel)
  }
  if (Boolean(row.prioridad)) return 3
  return 0
}

export function prioridadMeta(nivel: ProjectPrioridadNivel): ProjectPrioridadMeta {
  return BY_NIVEL.get(nivel) ?? BY_NIVEL.get(0)!
}

export function hasProjectPrioridad(nivel: ProjectPrioridadNivel): boolean {
  return nivel > 0
}

/** Ordenar: más urgente primero; empate por folio. */
export function compareProjectPrioridadNivel(a: ProjectPrioridadNivel, b: ProjectPrioridadNivel): number {
  if (a !== b) return b - a
  return 0
}

/**
 * Número en plan de trabajo / proyector: 1 = más urgente, 4 = menos.
 * (Invierte el nivel interno 4→1, 3→2, 2→3, 1→4.)
 */
export function weeklyPlanPrioridadDisplay(nivel: ProjectPrioridadNivel): string {
  if (nivel <= 0) return '—'
  return String(5 - nivel)
}

export function maxPrioridadNivel(levels: ProjectPrioridadNivel[]): ProjectPrioridadNivel {
  let max = 0 as ProjectPrioridadNivel
  for (const n of levels) {
    if (n > max) max = n
  }
  return max
}

export function prioridadRowHighlightClass(nivel: ProjectPrioridadNivel): string {
  if (!hasProjectPrioridad(nivel)) return ''
  if (nivel >= 4) return 'bg-rose-50/50 ring-1 ring-inset ring-rose-300/70'
  if (nivel >= 3) return 'bg-rose-50/40 ring-1 ring-inset ring-rose-200/60'
  if (nivel >= 2) return 'bg-orange-50/40 ring-1 ring-inset ring-orange-200/55'
  return 'bg-amber-50/40 ring-1 ring-inset ring-amber-200/50'
}

export const BODEGA_PRIORIDAD_NIVEL_PATCH = 'supabase/patch_bodega_project_prioridad_nivel.sql'
