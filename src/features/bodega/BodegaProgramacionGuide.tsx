import type { AppRole } from '../../lib/roles'
import { canManageBodegaLikeAdmin, canUploadBodegaMachine } from '../../lib/roles'
import { progHero } from './bodegaProgramacionUi.ts'

const STEPS = [
  {
    n: 1,
    title: 'Requisitos',
    short: 'Diseño listo',
    desc: 'El proyecto debe tener diseño aprobado, piezas importadas y acabado definido en la pestaña Diseño.',
  },
  {
    n: 2,
    title: 'Asignar',
    short: 'CNC · Torno · Perfilado',
    desc: 'Arrastra cada pieza del ZIP a su destino. Cada una necesita plano PDF antes de confirmar.',
  },
  {
    n: 3,
    title: 'Confirmar',
    short: 'Bloquear rutas',
    desc: 'Pulsa «Confirmar asignación» cuando todas las piezas tengan destino. Ya no podrás moverlas libremente.',
  },
  {
    n: 4,
    title: 'Programar',
    short: 'Archivo por pieza',
    desc: 'En CNC o Torno: inicia tiempo, sube el archivo de programación y termina (perfilado o maquinado).',
  },
  {
    n: 5,
    title: 'Siguiente',
    short: 'Taller / máquina',
    desc: 'Piezas a perfilado van a Taller; las demás siguen a Maquinado cuando el archivo esté listo.',
  },
] as const

function roleIntro(role: AppRole): { title: string; lines: string[] } {
  if (role === 'programadora_maquinaria') {
    return {
      title: 'Tu trabajo en programación',
      lines: [
        'Asigna cada pieza a CNC, Torno o Perfilado y confirma la asignación.',
        'Luego programa pieza por pieza: reloj, archivo y cierre con destino a taller o máquina.',
      ],
    }
  }
  if (canManageBodegaLikeAdmin(role) || role === 'encargado') {
    return {
      title: 'Supervisión de programación',
      lines: [
        'Revisa que todas las piezas tengan plano PDF y destino correcto antes de confirmar.',
        'Tras confirmar, el equipo programa en CNC/Torno; perfilado directo va a Taller.',
      ],
    }
  }
  return {
    title: 'Vista de programación',
    lines: [
      'Aquí se asignan rutas CNC/Torno/Perfilado y se suben los archivos de programación.',
      'Solo programadora y encargado pueden confirmar asignación y registrar tiempos.',
    ],
  }
}

export function BodegaProgramacionGuide(props: {
  role: AppRole
  projectStatus: string
  routesLocked: boolean
  designReady: boolean
  assignmentComplete: boolean
  hasCncOrTornoPieces: boolean
  allProgrammingFinished?: boolean
}) {
  const intro = roleIntro(props.role)
  const canWork = canUploadBodegaMachine(props.role) || canManageBodegaLikeAdmin(props.role)

  let activeStep = 1
  if (!props.designReady) activeStep = 1
  else if (!props.routesLocked) activeStep = props.assignmentComplete ? 3 : 2
  else if (props.allProgrammingFinished) activeStep = 5
  else if (props.hasCncOrTornoPieces && canWork) activeStep = 4
  else if (props.routesLocked) activeStep = 4
  else activeStep = 3

  return (
    <div className={progHero}>
      <div className="border-b-2 border-programacion-300/90 bg-programacion-200/50 px-4 py-4 sm:px-5 sm:py-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-programacion-900">
          Guía — Pestaña Programación
        </p>
        <h3 className="mt-1 text-[17px] font-bold tracking-tight text-programacion-950 sm:text-lg">{intro.title}</h3>
        <ul className="mt-2 space-y-1.5 text-[13px] leading-relaxed text-programacion-950/90">
          {intro.lines.map((line) => (
            <li key={line} className="flex gap-2">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-programacion-600" aria-hidden />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="overflow-x-auto px-3 py-4 sm:px-4">
        <ol className="flex min-w-[min(100%,640px)] gap-2 sm:min-w-0 sm:grid sm:grid-cols-5 sm:gap-1.5">
          {STEPS.map((s) => {
            const isActive = s.n === activeStep
            const isDone = s.n < activeStep
            return (
              <li
                key={s.n}
                className={[
                  'flex min-w-[7.5rem] flex-1 flex-col rounded-xl border px-2.5 py-2.5 text-center transition sm:min-w-0 sm:px-2',
                  isActive
                    ? 'border-programacion-700 bg-gradient-to-b from-programacion-600 to-programacion-700 text-white shadow-lg shadow-programacion-400/50 ring-2 ring-programacion-400/60'
                    : isDone
                      ? 'border-programacion-400 bg-programacion-100 text-programacion-950'
                      : 'border-programacion-200 bg-programacion-50/90 text-programacion-900/80',
                ].join(' ')}
              >
                <span
                  className={[
                    'mx-auto flex h-7 w-7 items-center justify-center rounded-lg text-[12px] font-bold',
                    isActive
                      ? 'bg-white/25 text-white ring-1 ring-white/30'
                      : isDone
                        ? 'bg-programacion-600 text-white'
                        : 'bg-programacion-200 text-programacion-800',
                  ].join(' ')}
                >
                  {isDone ? '✓' : s.n}
                </span>
                <span className="mt-1.5 text-[11px] font-bold leading-tight">{s.title}</span>
                <span
                  className={[
                    'mt-0.5 hidden text-[9px] font-medium leading-tight sm:block',
                    isActive ? 'text-programacion-100' : isDone ? 'text-programacion-800' : 'text-programacion-700/80',
                  ].join(' ')}
                >
                  {s.short}
                </span>
              </li>
            )
          })}
        </ol>
        <p className="mt-3 rounded-xl border border-programacion-300/80 bg-programacion-100/80 px-3 py-2.5 text-center text-[12px] font-medium text-programacion-950 sm:text-left">
          <span className="font-bold text-programacion-800">Paso actual: {activeStep}.</span>{' '}
          {STEPS[activeStep - 1]?.desc}
        </p>
      </div>
    </div>
  )
}
