import type { ReactNode } from 'react'
import type { AppRole } from '../../lib/roles'
import { canManageBodegaLikeAdmin, canUploadBodegaMachine } from '../../lib/roles'
import type { CncModuleKind } from '../../lib/machineVersionsRepo'
import { BodegaProgramacionGuide } from './BodegaProgramacionGuide.tsx'
import { BodegaProgramacionTabPanel } from './BodegaProgramacionTabPanel.tsx'
import { progStepBody, progStepCard, progStepHeader, progStepNumber } from './bodegaProgramacionUi.ts'

function StepBlock(props: { n: number; title: string; subtitle: string; children: ReactNode }) {
  return (
    <section className={progStepCard}>
      <div className={progStepHeader}>
        <span className={progStepNumber}>{props.n}</span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-bold text-programacion-950">{props.title}</h3>
          <p className="mt-0.5 text-[12px] leading-snug text-programacion-900/85">{props.subtitle}</p>
        </div>
      </div>
      <div className={progStepBody}>{props.children}</div>
    </section>
  )
}

type Props = {
  role: AppRole
  projectStatus: string
  routesLocked: boolean
  designReady: boolean
  assignmentComplete: boolean
  hasCncOrTornoPieces: boolean
  allProgrammingFinished?: boolean
  cncModuleTab: CncModuleKind
  cncModuleTabsVisible: CncModuleKind[]
  onCncModuleTabChange: (m: CncModuleKind) => void
  deliveryPanel: ReactNode | null
  assignmentPanel: ReactNode | null
  programmingPanel: ReactNode | null
  timesPanel?: ReactNode | null
}

export function BodegaProgramacionWorkspace(props: Props) {
  const canWork = canUploadBodegaMachine(props.role) || canManageBodegaLikeAdmin(props.role)
  const showModuleTabs = props.routesLocked && canWork && props.cncModuleTabsVisible.length > 0

  return (
    <div className="space-y-6">
      <BodegaProgramacionGuide
        role={props.role}
        projectStatus={props.projectStatus}
        routesLocked={props.routesLocked}
        designReady={props.designReady}
        assignmentComplete={props.assignmentComplete}
        hasCncOrTornoPieces={props.hasCncOrTornoPieces}
        allProgrammingFinished={props.allProgrammingFinished}
      />

      {!props.designReady ? (
        <div className="rounded-2xl border-2 border-amber-300 bg-amber-50/90 px-4 py-4 text-[13px] leading-relaxed text-amber-950">
          <strong>Falta confirmación de diseño.</strong> El encargado debe confirmar las carpetas en la pestaña{' '}
          <strong>Diseño</strong> antes de programar aquí.
        </div>
      ) : null}

      {props.deliveryPanel ? (
        <StepBlock
          n={1}
          title="Entrega de programación"
          subtitle="Descarga el diseño confirmado, programa en tu PC y sube el ZIP con las piezas que sí se maquinarán."
        >
          {props.deliveryPanel}
        </StepBlock>
      ) : null}

      {props.assignmentPanel ? (
        <StepBlock
          n={2}
          title="Asignar piezas"
          subtitle="Arrastra piezas a CNC, Torno, Perfilado o Accesorios."
        >
          {props.assignmentPanel}
        </StepBlock>
      ) : null}

      {props.routesLocked && showModuleTabs ? (
        <StepBlock
          n={3}
          title="Módulo activo"
          subtitle="CNC y Torno se programan por separado. Perfilado (asignación) va directo a Taller."
        >
          <p className="text-[12px] leading-relaxed text-programacion-950/90">
            Elige la línea en la que vas a trabajar. Cada módulo tiene su historial de tiempos.
          </p>
          <div
            role="tablist"
            aria-label="Módulo de programación"
            className="mt-3 inline-flex flex-wrap gap-1 rounded-xl bg-white/90 p-1 ring-2 ring-programacion-200/80"
          >
            {props.cncModuleTabsVisible.map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={props.cncModuleTab === m}
                className={[
                  'min-h-[44px] rounded-lg px-4 py-2.5 text-[13px] font-semibold transition outline-none focus-visible:ring-2 focus-visible:ring-programacion-500/50',
                  props.cncModuleTab === m
                    ? m === 'torno'
                      ? 'bg-programacion-700 text-white shadow-sm'
                      : m === 'perfilado'
                        ? 'bg-programacion-800 text-white shadow-sm'
                        : 'bg-programacion-600 text-white shadow-sm'
                    : 'text-programacion-950/90 hover:bg-programacion-100/80',
                ].join(' ')}
                onClick={() => props.onCncModuleTabChange(m)}
              >
                {m === 'programacion' ? 'CNC' : m === 'torno' ? 'Torno' : 'Perfilado'}
              </button>
            ))}
          </div>
          {props.routesLocked ? (
            <p className="mt-3 rounded-xl border border-programacion-200 bg-programacion-50/80 px-3 py-2.5 text-[12px] text-programacion-950">
              <strong>CNC / Torno:</strong> programa cada pieza con plano PDF, archivo y cierre.{' '}
              <strong>Perfilado (asignación):</strong> van a <strong>Taller → Perfilado</strong>.
            </p>
          ) : null}
        </StepBlock>
      ) : null}

      {props.programmingPanel ? (
        <StepBlock
          n={4}
          title="Programar piezas"
          subtitle="Inicia el tiempo, revisa el plano, sube el archivo y termina eligiendo perfilado o maquinado."
        >
          {props.programmingPanel}
        </StepBlock>
      ) : props.routesLocked && props.cncModuleTab === 'perfilado' ? (
        <div className="rounded-2xl border-2 border-programacion-300 bg-programacion-100/70 px-4 py-4 text-[13px] text-programacion-950">
          Las piezas en <strong>Perfilado</strong> no requieren archivo CNC/Torno. Siguen en{' '}
          <strong>Taller → Perfilado</strong> cuando el flujo lo indique.
        </div>
      ) : null}

      <BodegaProgramacionTabPanel routesLocked={props.routesLocked} activeModule={props.cncModuleTab} />

      {props.timesPanel ? (
        <section className="overflow-hidden rounded-2xl border-2 border-programacion-200/90 bg-programacion-50/40 px-4 py-4 sm:px-5">
          <h3 className="text-[13px] font-bold text-programacion-950">Tiempos — oficina CNC</h3>
          <p className="mt-0.5 text-[12px] text-programacion-900/85">
            Minutos acumulados por línea (se registran al programar piezas).
          </p>
          <div className="mt-3">{props.timesPanel}</div>
        </section>
      ) : null}

      <p className="rounded-xl border-2 border-programacion-300/90 bg-programacion-100/70 px-4 py-3 text-[12px] leading-relaxed text-programacion-950">
        <strong className="text-programacion-900">Seguimiento:</strong> más abajo en esta pantalla están las notas de avance y
        el historial del proyecto (asignaciones, archivos, comentarios).
      </p>
    </div>
  )
}
