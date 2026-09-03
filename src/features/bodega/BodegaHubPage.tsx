import type { AppRole } from '../../lib/roles'
import { BodegaPage, type BodegaDeliveryJump } from './BodegaPage.tsx'

/** Módulo Bodega: proyectos y archivos por proyecto (maquinado/taller en pestañas del proyecto). */
export function BodegaHubPage(props: {
  role: AppRole
  deliveryJumpRequest?: BodegaDeliveryJump | null
  onDeliveryJumpConsumed?: () => void
  onBodegaDeliveriesChanged?: () => void
  onProjectDeliveryScreenOpen?: (open: boolean) => void
}) {
  return (
    <BodegaPage
      role={props.role}
      deliveryJumpRequest={props.deliveryJumpRequest}
      onDeliveryJumpConsumed={props.onDeliveryJumpConsumed}
      onBodegaDeliveriesChanged={props.onBodegaDeliveriesChanged}
      onProjectDeliveryScreenOpen={props.onProjectDeliveryScreenOpen}
    />
  )
}
