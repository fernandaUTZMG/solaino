import type { AppRole } from '../../lib/roles'
import { canManageBodegaLikeAdmin, canUploadBodegaMachine } from '../../lib/roles'
import { progHero } from './bodegaProgramacionUi.ts'

const STEPS = [
  {
    n: 1,
    title: 'Ensamble',
    short: 'Ver .x_t',
    desc: 'Revisa el ensamble que subió la diseñadora y descarga la pieza que vas a programar.',
  },
  {
    n: 2,
    title: 'Destinos',
    short: 'Los pone diseño',
    desc: 'La diseñadora dirige CNC, torno y perfiladora. Torno y perfil salen sin tiempo, como accesorios.',
  },
  {
    n: 3,
    title: 'Confirmar',
    short: 'En Diseño',
    desc: 'Cuando diseño confirma destinos, aquí solo llegan las piezas CNC.',
  },
  {
    n: 4,
    title: 'Programar',
    short: 'Solo CNC',
    desc: 'Inicia el tiempo de oficina, sube el archivo y cierra. Si hay contratiempo, déjalo en comentarios.',
  },
  {
    n: 5,
    title: 'Siguiente',
    short: 'Taller / máquina',
    desc: 'CNC sigue a maquinado. Torno y perfiladora no se cronometran aquí.',
  },
] as const

function roleIntro(role: AppRole): { title: string; lines: string[] } {
  if (role === 'programadora_maquinaria') {
    return {
      title: 'Tu trabajo aquí',
      lines: [
        'Al entrar, tu tiempo de programación empieza a correr.',
        'Descarga el .x_t y programa solo las piezas CNC. Torno y perfiladora ya las dirigió diseño, sin tiempo.',
      ],
    }
  }
  if (canManageBodegaLikeAdmin(role) || role === 'encargado') {
    return {
      title: 'Supervisión de programación',
      lines: [
        'La programadora trabaja con el ensamble .x_t y las piezas CNC que dirigió diseño.',
        'Torno y perfiladora salen sin tiempo de oficina, igual que los accesorios.',
      ],
    }
  }
  return {
    title: 'Vista de programación',
    lines: [
      'Aquí se ve el ensamble .x_t y las piezas CNC a programar.',
      'Los destinos los confirma diseño; torno y perfiladora no llevan tiempo de programación.',
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
      <div className="border-b border-blue-950/20 bg-gradient-to-br from-section-navy via-[#0a2848] to-[#123d6b] px-4 py-4 sm:px-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-sky-300/90">Programación</p>
        <h3 className="mt-1 text-[17px] font-bold tracking-tight text-white">{intro.title}</h3>
        <ul className="mt-2 space-y-1 text-[13px] leading-relaxed text-sky-100/90">
          {intro.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>

      <div className="overflow-x-auto bg-slate-50 px-3 py-4 sm:px-4">
        <ol className="flex min-w-[min(100%,640px)] gap-2 sm:min-w-0 sm:grid sm:grid-cols-5 sm:gap-2">
          {STEPS.map((s) => {
            const isActive = s.n === activeStep
            const isDone = s.n < activeStep
            return (
              <li
                key={s.n}
                className={[
                  'flex min-w-[7.5rem] flex-1 flex-col rounded-xl border px-2.5 py-2.5 text-center shadow-sm sm:min-w-0',
                  isActive
                    ? 'border-section-navy bg-section-navy text-white'
                    : isDone
                      ? 'border-sky-200 bg-sky-50 text-slate-900'
                      : 'border-slate-300 bg-white text-slate-500',
                ].join(' ')}
              >
                <span
                  className={[
                    'mx-auto flex h-7 w-7 items-center justify-center rounded-lg text-[12px] font-bold',
                    isActive
                      ? 'bg-white/20 text-white'
                      : isDone
                        ? 'bg-section-navy text-white'
                        : 'bg-slate-200 text-slate-600',
                  ].join(' ')}
                >
                  {isDone ? '✓' : s.n}
                </span>
                <span className="mt-1.5 text-[11px] font-bold leading-tight">{s.title}</span>
                <span className={['mt-0.5 hidden text-[10px] sm:block', isActive ? 'text-sky-100' : 'text-slate-500'].join(' ')}>
                  {s.short}
                </span>
              </li>
            )
          })}
        </ol>
        <p className="mt-3 rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-[13px] text-slate-700 shadow-sm">
          <span className="font-bold text-section-navy">Paso actual: {activeStep}.</span> {STEPS[activeStep - 1]?.desc}
        </p>
      </div>
    </div>
  )
}
