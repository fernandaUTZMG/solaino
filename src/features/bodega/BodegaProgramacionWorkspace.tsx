import { useMemo, useRef, type ReactNode } from 'react'
import type { AppRole } from '../../lib/roles'
import { canManageBodegaLikeAdmin, canUploadBodegaMachine } from '../../lib/roles'
import type { CncModuleKind } from '../../lib/machineVersionsRepo'
import {
  aggregateBusinessMinutesByLane,
  workLaneElapsedSeconds,
  type BodegaWorkIntervalRow,
} from '../../lib/bodegaWorkIntervalsRepo'
import { BodegaProgramacionGuide } from './BodegaProgramacionGuide.tsx'
import { BodegaProgramacionTabPanel } from './BodegaProgramacionTabPanel.tsx'
import { BodegaLiveClock } from './BodegaLiveClock.tsx'
import { useLiveClockTick } from './useLiveClockTick.ts'
import { progStepBody, progStepCard, progStepHeader, progStepNumber } from './bodegaProgramacionUi.ts'

function StepBlock(props: { n?: number; title: string; subtitle: string; children: ReactNode }) {
  return (
    <section className={progStepCard}>
      <div className={progStepHeader}>
        {props.n != null && props.n > 0 ? <span className={progStepNumber}>{props.n}</span> : null}
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-bold text-section-navy">{props.title}</h3>
          <p className="mt-0.5 text-[13px] leading-snug text-slate-500">{props.subtitle}</p>
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
  workIntervals?: BodegaWorkIntervalRow[]
}

export function BodegaProgramacionWorkspace(props: Props) {
  const canWork = canUploadBodegaMachine(props.role) || canManageBodegaLikeAdmin(props.role)
  const showModuleTabs = props.routesLocked && canWork && props.cncModuleTabsVisible.length > 0
  const intervals = props.workIntervals ?? []
  const programmingDone = Boolean(props.allProgrammingFinished)
  const clockOpen = intervals.some((r) => r.lane === 'cnc_programacion' && !r.ended_at)
  // No seguir tickeando ni contando si la programación ya terminó (aunque el intervalo tarde en cerrarse).
  const clockLive = clockOpen && !programmingDone
  const clockNow = useLiveClockTick(clockLive)
  const freezeAtRef = useRef<string | null>(null)
  if (programmingDone) {
    if (freezeAtRef.current == null) freezeAtRef.current = new Date().toISOString()
  } else {
    freezeAtRef.current = null
  }
  const displayIntervals = useMemo(() => {
    if (!programmingDone || freezeAtRef.current == null) return intervals
    const ended = freezeAtRef.current
    return intervals.map((r) =>
      r.lane === 'cnc_programacion' && !r.ended_at ? { ...r, ended_at: ended } : r,
    )
  }, [intervals, programmingDone])
  const clockSec = workLaneElapsedSeconds(displayIntervals, 'cnc_programacion', clockNow)
  const clockMins = aggregateBusinessMinutesByLane(displayIntervals, clockNow).get('cnc_programacion') ?? 0

  return (
    <div className="space-y-5">
      <BodegaProgramacionGuide
        role={props.role}
        projectStatus={props.projectStatus}
        routesLocked={props.routesLocked}
        designReady={props.designReady}
        assignmentComplete={props.assignmentComplete}
        hasCncOrTornoPieces={props.hasCncOrTornoPieces}
        allProgrammingFinished={props.allProgrammingFinished}
      />

      <StepBlock
        title="Tiempo de programación"
        subtitle={
          programmingDone
            ? 'Programación CNC terminada: el reloj se detuvo al cerrar todas las piezas con archivo.'
            : 'Corre mientras hay piezas CNC pendientes. Al terminar todas con archivo, el reloj se detiene.'
        }
      >
        <BodegaLiveClock
          seconds={clockSec}
          active={clockLive}
          label="Programación"
          idleLabel={programmingDone ? 'Programación terminada' : 'Se inicia al entrar al proyecto'}
          hint={
            programmingDone
              ? 'Todas las piezas CNC ya tienen archivo. Siguiente: maquinado (con Inicio/Fin) o perfilado (sin tiempo).'
              : clockOpen
                ? 'Reloj activo — hay piezas CNC por programar.'
                : undefined
          }
          tone="navy"
          businessMinutes={clockMins > 0 ? clockMins : undefined}
          businessMinutesLabel="Min. hábiles"
        />
      </StepBlock>

      {!props.designReady ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-4 text-[13px] leading-relaxed text-amber-950 shadow-sm">
          <strong>Falta confirmación de diseño.</strong> El encargado debe confirmar el ensamble en la pestaña{' '}
          <strong>Diseño</strong> antes de programar aquí.
        </div>
      ) : null}

      {props.deliveryPanel ? (
        <StepBlock
          n={1}
          title="Ensamble .x_t"
          subtitle="Descarga el archivo de la diseñadora. Cada pieza de la lista se abre en tu programa desde ese ensamble."
        >
          {props.deliveryPanel}
        </StepBlock>
      ) : null}

      {props.assignmentPanel ? (
        <StepBlock
          n={2}
          title="Asignar piezas"
          subtitle="Los destinos los confirma la diseñadora. CNC se programa; torno y perfiladora salen sin tiempo."
        >
          {props.assignmentPanel}
        </StepBlock>
      ) : null}

      {props.routesLocked && showModuleTabs ? (
        <StepBlock
          n={3}
          title="Módulo activo"
          subtitle="Solo CNC se programa aquí. Perfilado y torno no llevan tiempo de oficina."
        >
          <div
            role="tablist"
            aria-label="Módulo de programación"
            className="inline-flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm"
          >
            {props.cncModuleTabsVisible.map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={props.cncModuleTab === m}
                className={[
                  'min-h-[44px] rounded-lg px-4 py-2.5 text-[13px] font-semibold transition outline-none focus-visible:ring-2 focus-visible:ring-section-navy/40',
                  props.cncModuleTab === m
                    ? 'bg-section-navy text-white shadow-sm'
                    : 'text-slate-700 hover:bg-slate-100',
                ].join(' ')}
                onClick={() => props.onCncModuleTabChange(m)}
              >
                {m === 'programacion' ? 'CNC' : m === 'torno' ? 'Torno' : 'Perfilado'}
              </button>
            ))}
          </div>
        </StepBlock>
      ) : null}

      {props.programmingPanel ? (
        <StepBlock
          n={4}
          title="Programar piezas"
          subtitle="Inicia el tiempo de oficina CNC, sube el archivo y cierra. Contratiempos van en comentarios."
        >
          {props.programmingPanel}
        </StepBlock>
      ) : props.routesLocked && props.cncModuleTab === 'perfilado' ? (
        <div className="rounded-2xl border border-sky-300 bg-sky-50 px-4 py-4 text-[13px] text-sky-950 shadow-sm">
          Las piezas en <strong>Perfilado</strong> y <strong>Torno</strong> no se programan ni se cronometran. Las
          dirigió diseño y salen como accesorios.
        </div>
      ) : null}

      <BodegaProgramacionTabPanel routesLocked={props.routesLocked} activeModule={props.cncModuleTab} />

      {props.timesPanel ? (
        <section className={progStepCard}>
          <div className={progStepHeader}>
            <div>
              <h3 className="text-[15px] font-bold text-section-navy">Tiempos por línea</h3>
              <p className="mt-0.5 text-[13px] text-slate-500">Minutos hábiles acumulados en programación.</p>
            </div>
          </div>
          <div className={progStepBody}>{props.timesPanel}</div>
        </section>
      ) : null}
    </div>
  )
}
