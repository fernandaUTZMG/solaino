import type { ReactNode } from 'react'
import type { AppRole } from '../../lib/roles'
import { canReviewBodegaDesign } from '../../lib/roles'
import type { ProjectDesignVersionRow } from '../../lib/designVersionsRepo'
import { nextDesignVersionPendingReview } from '../../lib/designVersionsRepo'
import { BodegaDisenoGuide } from './BodegaDisenoGuide.tsx'
import { BodegaDisenoTabPanel, type DesignEntregaSubmit } from './BodegaDisenoTabPanel.tsx'
import { disenoStepBody, disenoStepCard, disenoStepHeader, disenoStepNumber } from './bodegaDisenoUi.ts'

type Props = {
  role: AppRole
  projectStatus: string
  canUploadDesign: boolean
  designUploadBusy: boolean
  designUploadPhase: string
  designEntregaVersions: ProjectDesignVersionRow[]
  clienteInfoVersions: ProjectDesignVersionRow[]
  onUploadDesign: (submit: DesignEntregaSubmit) => void
  onDownload: (v: ProjectDesignVersionRow) => void
  formatDateTime: (d: Date) => string
  destinosComplete?: boolean
  showPlanosStep?: boolean
  clockPanel: ReactNode
  supervisorPanel: ReactNode | null
  destinosPanel?: ReactNode | null
  planosPanel: ReactNode | null
}

function StepBlock(props: { n?: number; title: string; subtitle: string; children: ReactNode }) {
  return (
    <section className={disenoStepCard}>
      <div className={disenoStepHeader}>
        {props.n != null && props.n > 0 ? <span className={disenoStepNumber}>{props.n}</span> : null}
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-bold text-section-navy">{props.title}</h3>
          <p className="mt-0.5 text-[13px] leading-snug text-slate-500">{props.subtitle}</p>
        </div>
      </div>
      <div className={disenoStepBody}>{props.children}</div>
    </section>
  )
}

export function BodegaDisenoWorkspace(props: Props) {
  const pendingReview = nextDesignVersionPendingReview(props.designEntregaVersions)
  const showSupervisor = canReviewBodegaDesign(props.role) && props.supervisorPanel != null
  const showDestinos = props.destinosPanel != null
  const showPlanos = props.showPlanosStep === true && props.planosPanel != null

  return (
    <div className="space-y-5">
      <BodegaDisenoGuide
        role={props.role}
        projectStatus={props.projectStatus}
        hasClienteInfo={props.clienteInfoVersions.length > 0}
        hasEntregaZip={props.designEntregaVersions.length > 0}
        pendingReview={pendingReview != null}
        destinosComplete={props.destinosComplete}
      />

      <StepBlock
        title="Tiempo de diseño"
        subtitle="Empieza al entrar al proyecto. Se pausa cuando entregas el ensamble .x_t."
      >
        {props.clockPanel}
      </StepBlock>

      <BodegaDisenoTabPanel
        canUploadDesign={props.canUploadDesign}
        designUploadBusy={props.designUploadBusy}
        designUploadPhase={props.designUploadPhase}
        designEntregaVersions={props.designEntregaVersions}
        clienteInfoVersions={props.clienteInfoVersions}
        onUploadDesign={props.onUploadDesign}
        onDownload={props.onDownload}
        formatDateTime={props.formatDateTime}
      />

      {showSupervisor ? (
        <StepBlock
          n={3}
          title="Revisión (supervisor)"
          subtitle="Revisa la entrega .x_t, aprueba o pide correcciones con un motivo claro."
        >
          {props.supervisorPanel}
        </StepBlock>
      ) : props.projectStatus === 'revision_diseno' ? (
        <div className="rounded-2xl border border-sky-300 bg-sky-50 px-4 py-4 text-[13px] text-sky-950 shadow-sm">
          <strong>En revisión.</strong> El supervisor está evaluando tu última entrega. Si pide cambios, verás el motivo
          aquí y podrás subir un nuevo .x_t.
        </div>
      ) : props.projectStatus === 'diseno_parcial' ? (
        <div className="rounded-2xl border border-sky-300 bg-sky-50 px-4 py-4 text-[13px] text-sky-950 shadow-sm">
          <strong>Diseño parcial.</strong> Algunas piezas ya avanzan. Corrige solo las indicadas y entrega un nuevo
          .x_t; el reloj registrará el tiempo extra.
        </div>
      ) : props.projectStatus === 'modificacion_diseno' ? (
        <div className="rounded-2xl border border-amber-400 bg-amber-50 px-4 py-4 text-[13px] text-amber-950 shadow-sm">
          <strong>Corrección requerida.</strong> Revisa los comentarios, corrige y entrega una nueva versión del .x_t.
        </div>
      ) : null}

      {showDestinos ? (
        <StepBlock
          n={showSupervisor ? 4 : 3}
          title="Destino de cada pieza"
          subtitle="Disponible cuando el encargado ya confirmó el diseño y los planos. CNC se programa; torno y perfiladora salen sin tiempo."
        >
          {props.destinosPanel}
        </StepBlock>
      ) : null}

      {showPlanos ? (
        <div id="bodega-planos-pieza-section">
          <StepBlock
            n={(showSupervisor ? 4 : 3) + (showDestinos ? 1 : 0)}
            title="Planos de torno y perfilado"
            subtitle="PDF con el mismo nombre que la pieza. Luego eliges torno o perfiladora."
          >
            {props.planosPanel}
          </StepBlock>
        </div>
      ) : null}
    </div>
  )
}
