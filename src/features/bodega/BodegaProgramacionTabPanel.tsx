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
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-programacion-600 text-white shadow-md">
            <IconRoute className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wide text-programacion-800">Antes de programar</p>
            <p className="mt-1 text-[14px] leading-relaxed text-programacion-950">
              En el <strong>paso 2</strong> asigna cada pieza a <strong>CNC</strong>, <strong>Torno</strong> o{' '}
              <strong>Perfilado</strong> y pulsa <strong>Confirmar asignación</strong>. Solo después podrás subir
              archivos y registrar tiempos por pieza.
            </p>
            <ul className="mt-3 space-y-1.5 text-[12px] text-programacion-900/90">
              <li className="flex gap-2">
                <span className="font-bold text-programacion-700">1.</span>
                Verifica que cada pieza tenga plano PDF (en Diseño si falta).
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-programacion-700">2.</span>
                Arrastra o usa los botones → CNC / Torno / Perfilado.
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-programacion-700">3.</span>
                Confirma cuando el contador muestre todas asignadas.
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
          <p className="text-[11px] font-bold uppercase tracking-wide text-programacion-800">Siguiente etapa</p>
          <p className="mt-1 text-[14px] leading-relaxed text-programacion-950">
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
        <p className="shrink-0 rounded-lg bg-programacion-600/10 px-3 py-2 text-[12px] font-semibold text-programacion-900">
          Módulo: {mod}
        </p>
      </div>
    </div>
  )
}
