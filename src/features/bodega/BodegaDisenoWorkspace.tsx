import type { ReactNode } from 'react'
import type { AppRole } from '../../lib/roles'
import { canReviewBodegaDesign } from '../../lib/roles'
import type { ProjectDesignVersionRow } from '../../lib/designVersionsRepo'
import { nextDesignVersionPendingReview } from '../../lib/designVersionsRepo'
import { BodegaDisenoGuide } from './BodegaDisenoGuide.tsx'
import { BodegaDisenoTabPanel } from './BodegaDisenoTabPanel.tsx'
import { disenoStepBody, disenoStepCard, disenoStepHeader, disenoStepNumber } from './bodegaDisenoUi.ts'

type Props = {
  role: AppRole
  projectStatus: string
  canUploadDesign: boolean
  designUploadBusy: boolean
  designUploadPhase: string
  designEntregaVersions: ProjectDesignVersionRow[]
  clienteInfoVersions: ProjectDesignVersionRow[]
  onUploadDesign: (file: File) => void
  onDownload: (v: ProjectDesignVersionRow) => void
  formatDateTime: (d: Date) => string
  step3Complete?: boolean
  showPlanosStep?: boolean
  clockPanel: ReactNode
  supervisorPanel: ReactNode | null
  planosPanel: ReactNode | null
}

function StepBlock(props: { n: number; title: string; subtitle: string; children: ReactNode }) {
  return (
    <section className={disenoStepCard}>
      <div className={disenoStepHeader}>
        <span className={disenoStepNumber}>{props.n}</span>
        <div className="min-w-0 flex-1">
        <h3 className="text-[15px] font-bold text-pink-950">{props.title}</h3>
        <p className="mt-0.5 text-[12px] leading-snug text-pink-900/85">{props.subtitle}</p>
        </div>
      </div>
      <div className={disenoStepBody}>{props.children}</div>
    </section>
  )
}

export function BodegaDisenoWorkspace(props: Props) {
  const pendingReview = nextDesignVersionPendingReview(props.designEntregaVersions)
  const showSupervisor = canReviewBodegaDesign(props.role) && props.supervisorPanel != null
  const showPlanos = props.showPlanosStep === true && props.planosPanel != null

  return (
    <div className="space-y-6">
      <BodegaDisenoGuide
        role={props.role}
        projectStatus={props.projectStatus}
        hasClienteInfo={props.clienteInfoVersions.length > 0}
        hasEntregaZip={props.designEntregaVersions.length > 0}
        pendingReview={pendingReview != null}
        step3Complete={props.step3Complete}
      />

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

      <StepBlock
        n={3}
        title="Tiempos de trabajo"
        subtitle="El reloj registra diseño inicial y cada ronda de corrección. Al subir un ZIP el tiempo se pausa hasta la revisión del supervisor."
      >
        {props.clockPanel}
      </StepBlock>

      {showSupervisor ? (
        <StepBlock
          n={4}
          title="Revisión y piezas (supervisor)"
          subtitle="Revisa pieza por pieza, aprueba las listas y marca correcciones con motivo. Las aprobadas pueden avanzar a programación."
        >
          {props.supervisorPanel}
        </StepBlock>
      ) : props.projectStatus === 'revision_diseno' ? (
        <div className="rounded-2xl border-2 border-pink-300 bg-pink-100/80 px-4 py-4 text-[13px] text-pink-950">
          <strong>En revisión.</strong> El supervisor está evaluando tu última entrega pieza por pieza. Si alguna
          requiere cambios, verás el motivo aquí y podrás subir un ZIP de corrección en el paso 2.
        </div>
      ) : props.projectStatus === 'diseno_parcial' ? (
        <div className="rounded-2xl border-2 border-teal-300 bg-teal-50 px-4 py-4 text-[13px] text-teal-950">
          <strong>Diseño parcial.</strong> Algunas piezas ya fueron aprobadas y avanzan en planta. Corrige solo las
          piezas indicadas y sube un nuevo ZIP con esas correcciones; el reloj registrará el tiempo extra de diseño.
        </div>
      ) : props.projectStatus === 'modificacion_diseno' ? (
        <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 px-4 py-4 text-[13px] text-amber-950">
          <strong>Corrección requerida.</strong> Revisa los comentarios del supervisor, corrige las piezas y sube una
          nueva versión del ZIP en el paso 2.
        </div>
      ) : null}

      {showPlanos ? (
        <div id="bodega-planos-pieza-section">
          <StepBlock
            n={showSupervisor ? 5 : 4}
            title="Planos adicionales por pieza"
            subtitle="Si un PDF llegó aparte del ZIP, adjúntalo a la pieza correcta para maquinado y taller."
          >
            {props.planosPanel}
          </StepBlock>
        </div>
      ) : null}

      <p className="rounded-xl border-2 border-pink-300/90 bg-pink-100/70 px-4 py-3 text-[12px] leading-relaxed text-pink-950">
        <strong className="text-pink-900">Seguimiento:</strong> más abajo en esta pantalla están las notas de avance y
        el historial de todo lo que ocurre en el proyecto (subidas, aprobaciones, comentarios).
      </p>
    </div>
  )
}
