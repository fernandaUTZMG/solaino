import type { AppRole } from '../../lib/roles'
import { canReviewBodegaDesign } from '../../lib/roles'
import { disenoHero } from './bodegaDisenoUi.ts'

const STEPS = [
  {
    n: 1,
    title: 'Referencias',
    short: 'Info del cliente',
    desc: 'Planos o notas que el supervisor subió en Bodega → Archivos.',
  },
  {
    n: 2,
    title: 'Entrega ZIP',
    short: 'Paquete de diseño',
    desc: 'La diseñadora sube la carpeta comprimida (.zip) con modelos y PDFs.',
  },
  {
    n: 3,
    title: 'Revisión',
    short: 'Supervisor',
    desc: 'El encargado aprueba el ZIP o pide correcciones con motivo.',
  },
  {
    n: 4,
    title: 'Piezas',
    short: 'Acabado y planos',
    desc: 'Importar piezas del ZIP, marcar anodizado/pavonado y PDF por pieza.',
  },
  {
    n: 5,
    title: 'Programación',
    short: 'Siguiente etapa',
    desc: 'Con diseño aprobado y paso 4 listo, el proyecto pasa a CNC / Torno.',
  },
] as const

function roleIntro(role: AppRole): { title: string; lines: string[] } {
  if (role === 'disenadora') {
    return {
      title: 'Tu trabajo en esta pestaña',
      lines: [
        'Consulta las referencias del cliente, sube tu ZIP cuando el modelado esté listo y registra avance o notas abajo.',
        'Cuando subas una entrega nueva, el supervisor la revisará en el paso 3.',
      ],
    }
  }
  if (canReviewBodegaDesign(role)) {
    return {
      title: 'Supervisión de diseño',
      lines: [
        'Revisa cada ZIP que suba la diseñadora, aprueba o pide cambios con un motivo claro.',
        'Tras aprobar, completa el paso 4 (piezas y acabado) antes de pasar a programación.',
      ],
    }
  }
  return {
    title: 'Vista de diseño',
    lines: [
      'Aquí ves referencias, entregas ZIP y el avance del modelado.',
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
  step3Complete?: boolean
}) {
  const intro = roleIntro(props.role)

  let activeStep = 1
  if (props.pendingReview) activeStep = 3
  else if (props.projectStatus === 'modificacion_diseno' || props.projectStatus === 'diseno_parcial') activeStep = 2
  else if (
    ['diseno_aprobado', 'diseno_parcial', 'en_programacion', 'revision_programacion', 'terminado'].includes(props.projectStatus)
  ) {
    activeStep = props.step3Complete ? 5 : 4
  } else if (props.hasEntregaZip) activeStep = 3
  else if (props.hasClienteInfo || props.role === 'disenadora') activeStep = 2

  return (
    <div className={disenoHero}>
      <div className="border-b-2 border-pink-300/90 bg-pink-200/50 px-4 py-4 sm:px-5 sm:py-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-pink-900">Guía — Pestaña Diseño</p>
        <h3 className="mt-1 text-[17px] font-bold tracking-tight text-pink-950 sm:text-lg">{intro.title}</h3>
        <ul className="mt-2 space-y-1.5 text-[13px] leading-relaxed text-pink-950/90">
          {intro.lines.map((line) => (
            <li key={line} className="flex gap-2">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-pink-600" aria-hidden />
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
                    ? 'border-pink-700 bg-gradient-to-b from-pink-600 to-pink-700 text-white shadow-lg shadow-pink-400/50 ring-2 ring-pink-400/60'
                    : isDone
                      ? 'border-pink-400 bg-pink-100 text-pink-950'
                      : 'border-pink-200 bg-pink-50/90 text-pink-900/80',
                ].join(' ')}
              >
                <span
                  className={[
                    'mx-auto flex h-7 w-7 items-center justify-center rounded-lg text-[12px] font-bold',
                    isActive
                      ? 'bg-white/25 text-white ring-1 ring-white/30'
                      : isDone
                        ? 'bg-pink-600 text-white'
                        : 'bg-pink-200 text-pink-800',
                  ].join(' ')}
                >
                  {isDone ? '✓' : s.n}
                </span>
                <span className="mt-1.5 text-[11px] font-bold leading-tight">{s.title}</span>
                <span
                  className={[
                    'mt-0.5 hidden text-[9px] font-medium leading-tight sm:block',
                    isActive ? 'text-pink-100' : isDone ? 'text-pink-800' : 'text-pink-700/80',
                  ].join(' ')}
                >
                  {s.short}
                </span>
              </li>
            )
          })}
        </ol>
        <p className="mt-3 rounded-xl border border-pink-300/80 bg-pink-100/80 px-3 py-2.5 text-center text-[12px] font-medium text-pink-950 sm:text-left">
          <span className="font-bold text-pink-800">Paso actual: {activeStep}.</span>{' '}
          {STEPS[activeStep - 1]?.desc}
        </p>
      </div>
    </div>
  )
}
