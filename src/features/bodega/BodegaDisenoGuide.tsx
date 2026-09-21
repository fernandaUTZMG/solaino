import type { AppRole } from '../../lib/roles'
import { canReviewBodegaDesign } from '../../lib/roles'
import { disenoHero } from './bodegaDisenoUi.ts'

const STEPS = [
  {
    n: 1,
    title: 'Referencias',
    short: 'Info del cliente',
    desc: 'Planos o notas que el encargado subió para esta orden.',
  },
  {
    n: 2,
    title: 'Entrega .x_t',
    short: 'Ensamble',
    desc: 'La diseñadora sube el ensamble Parasolid (.x_t). Eso cierra su tiempo de diseño.',
  },
  {
    n: 3,
    title: 'Revisión',
    short: 'Diseño + planos',
    desc: 'El encargado revisa el .x_t y los planos PDF, y confirma. Sin esa confirmación no se separan destinos.',
  },
  {
    n: 4,
    title: 'Destinos',
    short: 'CNC · Torno · Perfil',
    desc: 'Solo después de la confirmación: con plano eliges torno o perfiladora; sin plano, CNC o accesorio.',
  },
  {
    n: 5,
    title: 'Programación',
    short: 'Solo CNC',
    desc: 'Con destinos confirmados, programación solo recibe las piezas CNC.',
  },
] as const

function roleIntro(role: AppRole): { title: string; lines: string[] } {
  if (role === 'disenadora') {
    return {
      title: 'Tu trabajo aquí',
      lines: [
        'Al entrar, tu tiempo de diseño empieza a correr.',
        'Entrega el .x_t y los PDF. Cuando el encargado confirme, separas torno/perfil o CNC/accesorio.',
      ],
    }
  }
  if (canReviewBodegaDesign(role)) {
    return {
      title: 'Supervisión de diseño',
      lines: [
        'La diseñadora entrega el ensamble .x_t y los planos PDF.',
        'Revisa y confirma diseño + planos. Después se pueden separar las piezas por destino.',
      ],
    }
  }
  return {
    title: 'Vista de diseño',
    lines: [
      'Aquí se ve la información del cliente, el ensamble .x_t y el tiempo de diseño.',
      'Solo diseñadora y supervisor pueden subir o aprobar entregas.',
    ],
  }
}

export function BodegaDisenoGuide(props: {
  role: AppRole
  projectStatus: string
  hasClienteInfo: boolean
  hasEntregaZip: boolean
  pendingReview: boolean
  destinosComplete?: boolean
}) {
  const intro = roleIntro(props.role)

  let activeStep = 1
  if (props.pendingReview) activeStep = 3
  else if (props.projectStatus === 'modificacion_diseno') activeStep = 2
  else if (
    ['diseno_aprobado', 'diseno_parcial', 'en_programacion', 'revision_programacion', 'terminado'].includes(
      props.projectStatus,
    )
  ) {
    activeStep = props.destinosComplete ? 5 : 4
  } else if (props.hasEntregaZip) activeStep = 4
  else if (props.hasClienteInfo) activeStep = 2

  return (
    <div className={disenoHero}>
      <div className="border-b border-blue-950/20 bg-gradient-to-br from-section-navy via-[#0a2848] to-[#123d6b] px-4 py-4 sm:px-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-sky-300/90">Diseño</p>
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
