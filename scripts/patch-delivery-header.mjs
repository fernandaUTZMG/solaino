import fs from 'fs'

const p = 'src/features/bodega/BodegaPage.tsx'
let s = fs.readFileSync(p, 'utf8')

const marker = `        <BodegaProjectDeliveryFullscreen
          folio={designModalProject.folio}
          projectName={designModalProject.nombre}
          onClose={closeDesignModal}
          meta={`

const idx = s.indexOf(marker)
if (idx < 0) {
  console.error('marker not found')
  process.exit(1)
}

const tabsIdx = s.indexOf('          tabs={', idx)
const metaEnd = s.lastIndexOf('          }', tabsIdx)

const replacement = `        <BodegaProjectDeliveryFullscreen
          folio={designModalProject.folio}
          projectName={designModalProject.nombre}
          statusLabel={statusLabel(designModalProject.status)}
          avancePct={designModalProject.avance_pct}
          onClose={closeDesignModal}
          headerActions={
            <>
              <button
                type="button"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/35 bg-white/10 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm transition hover:bg-white/20"
                aria-expanded={designModalProjectInfoOpen}
                aria-controls="design-modal-project-details"
                title={designModalProjectInfoOpen ? 'Ocultar descripción completa' : 'Ver descripción completa'}
                onClick={() => setDesignModalProjectInfoOpen((v) => !v)}
              >
                <svg
                  className="h-3.5 w-3.5 opacity-95"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 16v-4" />
                  <path d="M12 8h.01" />
                </svg>
                Descripción
              </button>
              {designModalProject.prioridad ? <PrioridadBadge /> : null}
              {canTogglePrioridad ? (
                <button
                  type="button"
                  className="rounded-lg border border-white/35 bg-white/15 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm transition hover:bg-white/25 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={prioridadBusyId === designModalProject.id}
                  onClick={() => void toggleProjectPrioridad(designModalProject)}
                >
                  {prioridadBusyId === designModalProject.id
                    ? '…'
                    : designModalProject.prioridad
                      ? 'Quitar prioridad'
                      : 'Marcar prioridad'}
                </button>
              ) : null}
              {designModalProjectInfoOpen ? (
                <p
                  id="design-modal-project-details"
                  className="w-full basis-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-[12px] leading-relaxed text-blue-50/95"
                >
                  {designModalProject.nombre}
                </p>
              ) : null}
            </>
          }
`

s = s.slice(0, idx) + replacement + s.slice(metaEnd + '          }'.length)

s = s.replace(
  'className="inline-flex w-full max-w-4xl flex-wrap rounded-2xl bg-black/20 p-1 ring-1 ring-white/10 sm:w-auto"',
  'className="grid w-full grid-cols-2 gap-1 rounded-xl bg-black/25 p-1 ring-1 ring-white/10 sm:grid-cols-3 lg:grid-cols-5"',
)

fs.writeFileSync(p, s)
console.log('ok')
