import type { CncModuleKind } from '../../lib/machineVersionsRepo'
import { progBarraAcciones, progModuleLabel } from './bodegaProgramacionUi.ts'

type Props = {
  activeModule: CncModuleKind
  routesLocked: boolean
}

function IconRoute(props: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      className={props.className}
      aria-hidden
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  )
}

/** Guía contextual según el estado de asignación y módulo activo. */
export function BodegaProgramacionTabPanel(props: Props) {
  if (!props.routesLocked) {
    return (
      <div className={progBarraAcciones}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-section-navy text-white shadow-md">
            <IconRoute className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wide text-section-navy">Antes de programar</p>
            <p className="mt-1 text-[14px] leading-relaxed text-slate-800">
              En el <strong>paso 2</strong>, cada pieza tiene cuatro botones. Elige uno y, al terminar, pulsa{' '}
              <strong>Confirmar asignación</strong>.
            </p>
            <ul className="mt-3 space-y-1.5 text-[12px] text-slate-600">
              <li className="flex gap-2">
                <span className="font-bold text-section-navy">CNC / Torno</span>
                — se programan aquí.
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-section-navy">Perfiladora</span>
                — va a Taller, sin programa.
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-section-navy">Accesorio</span>
                — sin proceso.
              </li>
            </ul>
          </div>
        </div>
      </div>
    )
  }

  const mod = progModuleLabel(props.activeModule)

  return (
    <div className={progBarraAcciones}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-section-navy">Siguiente etapa</p>
          <p className="mt-1 text-[14px] leading-relaxed text-slate-800">
            {props.activeModule === 'perfilado' ? (
              <>
                Piezas en <strong>Perfilado</strong> siguen en <strong>Taller</strong>. Revisa el avance en esa pestaña.
              </>
            ) : (
              <>
                En <strong>{mod}</strong>: termina cada pieza con su archivo. Luego revisa{' '}
                <strong>Maquinado</strong> o <strong>Taller → Perfilado</strong> según el cierre elegido.
              </>
            )}
          </p>
        </div>
        <p className="shrink-0 rounded-lg bg-section-navy/10 px-3 py-2 text-[12px] font-semibold text-section-navy">
          Módulo: {mod}
        </p>
      </div>
    </div>
  )
}
