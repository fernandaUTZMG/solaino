import { useMemo } from 'react'
import type { AppRole } from '../../lib/roles'
import { canAttachPieceDesignDrawing } from '../../lib/roles'
import type { BodegaProjectPieceRow } from '../../lib/bodegaPiecesRepo'
import { pieceDisplayLabel } from '../../lib/bodegaStep3Supervisor'
import { buildDesignKitLabelMap, groupDesignItemsByKit } from '../../lib/designZipScope'
import { visibleDesignPieces } from '../../lib/designZipPiecePairs'
import type { ProjectDesignVersionRow } from '../../lib/designVersionsRepo'
import { pieceHasPlano } from '../../lib/bodegaPieceDesignDrawing'
import { isSwPartZipPath } from '../../lib/zipDesignPackage'
import { disenoSeccion, disenoTitulo } from './bodegaDisenoUi.ts'
import { BodegaPiecePlanoAttach } from './BodegaPiecePlanoAttach.tsx'
import { DesignPathIdentity } from './DesignPathIdentity.tsx'

type Props = {
  embedded?: boolean
  role: AppRole
  projectFolio: string
  pieces: BodegaProjectPieceRow[]
  designZipPaths: string[]
  designEntregaVersions?: ProjectDesignVersionRow[]
  onReload: () => void | Promise<void>
}

export function BodegaDesignPiecePlanosPanel(props: Props) {
  const canAttach = canAttachPieceDesignDrawing(props.role)

  const swPieces = useMemo(() => {
    const visible = visibleDesignPieces(props.pieces, props.designZipPaths)
    return visible.filter((p) => p.source_path && isSwPartZipPath(p.source_path))
  }, [props.pieces, props.designZipPaths])

  const missingCount = swPieces.filter((p) => !pieceHasPlano(p, props.designZipPaths)).length

  const kitLabels = useMemo(
    () => buildDesignKitLabelMap(props.designEntregaVersions ?? []),
    [props.designEntregaVersions],
  )

  const pieceGroups = useMemo(
    () =>
      groupDesignItemsByKit(
        swPieces,
        (p) => p.source_path ?? p.label,
        kitLabels,
      ),
    [swPieces, kitLabels],
  )

  const multipleModels = kitLabels.size > 1

  if (swPieces.length === 0) return null

  const inner = (
      <div className="space-y-4">
        <p className="text-[13px] leading-relaxed text-slate-600">
          Si te pasaron un plano PDF aparte (no va en el ZIP o llegó después), adjúntalo a la pieza correspondiente.
          Maquinado, perfilado y taller usarán ese PDF.
        </p>
        {multipleModels ? (
          <p className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-[13px] text-indigo-950">
            Hay <strong>{kitLabels.size} modelos</strong> en este proyecto. Cada pieza muestra de qué modelo es para
            no confundir nombres iguales con medidas distintas.
          </p>
        ) : null}
        {missingCount > 0 ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-950">
            Faltan planos en <strong>{missingCount}</strong> pieza(s). Idealmente el PDF tiene el mismo nombre que el
            .SLDPRT; si no, súbelo manualmente aquí.
          </p>
        ) : null}
        <div className="space-y-4">
          {pieceGroups.map((group) => (
            <div key={group.scopeKey ?? 'default'} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              {multipleModels ? (
                <div className="border-b border-slate-100 bg-slate-50 px-4 py-2.5">
                  <p className="text-[11px] font-bold uppercase text-slate-700">Modelo {group.label}</p>
                </div>
              ) : null}
              <ul className="divide-y divide-slate-100">
                {group.items.map((p) => (
                  <li key={p.id} className="px-4 py-4">
                    {p.source_path ? (
                      <DesignPathIdentity path={p.source_path} kitLabels={kitLabels} compact />
                    ) : (
                      <p className="font-semibold text-slate-900">{pieceDisplayLabel(p)}</p>
                    )}
                    <div className="mt-2">
                      <BodegaPiecePlanoAttach
                        piece={p}
                        projectFolio={props.projectFolio}
                        designZipPaths={props.designZipPaths}
                        canEdit={canAttach}
                        onUpdated={props.onReload}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
  )

  if (props.embedded) return inner

  return (
    <section className={disenoSeccion}>
      <h3 className={disenoTitulo}>Planos por pieza</h3>
      <div className="space-y-4 p-5 sm:p-6">{inner}</div>
    </section>
  )
}
