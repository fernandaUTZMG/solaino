import { useEffect, useMemo, useRef, useState } from 'react'
import type { ProjectDesignVersionRow } from '../../lib/designVersionsRepo'
import { isXtDesignFile, parseXtFile, type XtParseResult } from '../../lib/xtParasolidPieces'
import { matchPlanoPdfToPieceName } from '../../lib/designPlanoNaming'
import {
  disenoAccentBtn,
  disenoAccentIconBox,
  disenoBarraAcciones,
  disenoGhostBtn,
  disenoStepBody,
  disenoStepCard,
  disenoStepHeader,
  disenoStepNumber,
  disenoSuccessBtn,
} from './bodegaDisenoUi.ts'
import { BodegaXtPieceList } from './BodegaXtPieceList.tsx'

/**
 * `sumar`: los .x_t nuevos se agregan a lo que el encargado ya tiene por revisar.
 * `corregir`: reemplazan la entrega pendiente anterior.
 */
export type DesignEntregaMode = 'sumar' | 'corregir'

export type DesignEntregaSubmit = {
  files: File[]
  planos: File[]
  mode: DesignEntregaMode
  /** Nombre del .x_t → piezas que sí se entregan. Las quitadas no se registran. */
  keepPieceNamesByFile: Record<string, string[]>
}

type Props = {
  canUploadDesign: boolean
  designUploadBusy: boolean
  designUploadPhase: string
  designEntregaVersions: ProjectDesignVersionRow[]
  clienteInfoVersions: ProjectDesignVersionRow[]
  onUploadDesign: (submit: DesignEntregaSubmit) => void
  onDownload: (v: ProjectDesignVersionRow) => void
  formatDateTime: (d: Date) => string
}

type XtQueueItem = { file: File; result: XtParseResult; elapsedMs: number }

/** Clave estable por archivo+pieza: el mismo nombre puede repetirse en dos .x_t. */
function excludeKey(fileName: string, pieceName: string): string {
  return `${fileName}\u0000${pieceName}`
}

function statusShort(status: ProjectDesignVersionRow['status'], comentarios?: string | null): string {
  if (status === 'aprobada') return 'Aprobada'
  if (status === 'requiere_cambios') return 'Cambios solicitados'
  if (status === 'en_revision') return 'En revisión'
  if (/reemplazada|cerrada al resolver/i.test(comentarios ?? '')) return 'Reemplazada'
  return 'Subida'
}

function statusBadgeClass(status: ProjectDesignVersionRow['status']): string {
  if (status === 'aprobada') return 'bg-emerald-600 text-white border-emerald-700'
  if (status === 'requiere_cambios') return 'bg-rose-600 text-white border-rose-700'
  if (status === 'en_revision') return 'bg-amber-500 text-amber-950 border-amber-600'
  return 'bg-slate-700 text-white border-slate-800'
}

function isXtFilename(name: string): boolean {
  return /\.x_t$/i.test(name) || /\.xt$/i.test(name)
}

function StepHeader(props: { n: number; title: string; subtitle: string }) {
  return (
    <div className={disenoStepHeader}>
      <span className={disenoStepNumber}>{props.n}</span>
      <div className="min-w-0 flex-1">
        <h3 className="text-[15px] font-bold text-section-navy">{props.title}</h3>
        <p className="mt-0.5 text-[13px] leading-snug text-slate-500">{props.subtitle}</p>
      </div>
    </div>
  )
}

function VersionRow(props: {
  v: ProjectDesignVersionRow
  badge?: string
  onDownload: (v: ProjectDesignVersionRow) => void
  formatDateTime: (d: Date) => string
}) {
  const { v } = props
  const xt = isXtFilename(v.zip_filename)
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3.5 last:border-0 sm:px-5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {props.badge ? (
            <span className="rounded-lg bg-section-navy px-2 py-0.5 font-mono text-[11px] font-bold text-white">
              {props.badge}
            </span>
          ) : null}
          <span
            className={[
              'rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
              statusBadgeClass(v.status),
            ].join(' ')}
          >
            {statusShort(v.status, v.comentarios)}
          </span>
        </div>
        <p className="mt-1 truncate text-[14px] font-semibold text-slate-900" title={v.zip_filename}>
          {v.zip_filename}
        </p>
        <p className="mt-0.5 text-[12px] text-slate-500">
          {props.formatDateTime(new Date(v.created_at))}
          {v.comentarios?.trim() ? ` · ${v.comentarios.trim()}` : ''}
        </p>
      </div>
      <button
        type="button"
        className={`shrink-0 ${disenoGhostBtn}`}
        onClick={() => props.onDownload(v)}
      >
        {xt ? 'Descargar .x_t' : 'Descargar ZIP'}
      </button>
    </li>
  )
}

export function BodegaDisenoTabPanel(props: Props) {
  const latestEntrega = props.designEntregaVersions[0]
  const [xtBusy, setXtBusy] = useState(false)
  const [xtError, setXtError] = useState<string | null>(null)
  const [xtItems, setXtItems] = useState<XtQueueItem[]>([])
  const [excludedKeys, setExcludedKeys] = useState<Set<string>>(new Set())
  const [entregaMode, setEntregaMode] = useState<DesignEntregaMode>('sumar')
  const [planoFiles, setPlanoFiles] = useState<File[]>([])
  const planoInputRef = useRef<HTMLInputElement>(null)
  const latestEntregaId = latestEntrega?.id

  const pendingEntregaCount = props.designEntregaVersions.filter((v) => v.status === 'en_revision').length

  useEffect(() => {
    setXtItems([])
    setExcludedKeys(new Set())
    setXtError(null)
    setEntregaMode('sumar')
    setPlanoFiles([])
  }, [latestEntregaId])

  function clearXtPreview() {
    setXtItems([])
    setExcludedKeys(new Set())
    setXtError(null)
    setPlanoFiles([])
  }

  function removeXtItem(name: string) {
    setXtItems((prev) => prev.filter((it) => it.file.name !== name))
    setExcludedKeys((prev) => {
      const next = new Set<string>()
      for (const k of prev) if (!k.startsWith(`${name}\u0000`)) next.add(k)
      return next
    })
  }

  function toggleExcludedPiece(fileName: string, pieceName: string) {
    const key = excludeKey(fileName, pieceName)
    setExcludedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function addPlanoFiles(files: FileList | File[]) {
    const all = Array.from(files)
    const next = all.filter((f) => /\.pdf$/i.test(f.name) || f.type === 'application/pdf')
    if (next.length === 0) {
      setXtError(
        all.length > 0
          ? 'Los planos deben ser PDF (.pdf). Ningún archivo seleccionado era PDF.'
          : 'No se seleccionó ningún archivo.',
      )
      return
    }
    setXtError(null)
    setPlanoFiles((prev) => {
      const byKey = new Map(prev.map((f) => [f.name.toLowerCase(), f]))
      for (const f of next) byKey.set(f.name.toLowerCase(), f)
      return Array.from(byKey.values()).sort((a, b) => a.name.localeCompare(b.name, 'es'))
    })
  }

  function removePlanoFile(name: string) {
    setPlanoFiles((prev) => prev.filter((f) => f.name !== name))
  }

  function openPlanoPicker() {
    if (props.designUploadBusy) return
    planoInputRef.current?.click()
  }

  /** Piezas que sí se entregan, por archivo. Lo quitado no cuenta para planos ni para la subida. */
  const keepPieceNamesByFile = useMemo(() => {
    const map: Record<string, string[]> = {}
    for (const it of xtItems) {
      map[it.file.name] = it.result.pieces
        .map((p) => p.name)
        .filter((name) => !excludedKeys.has(excludeKey(it.file.name, name)))
    }
    return map
  }, [xtItems, excludedKeys])

  /** Piezas de todos los .x_t en cola: los planos se emparejan contra el conjunto completo. */
  const allPieceNames = useMemo(() => {
    const names = new Set<string>()
    for (const list of Object.values(keepPieceNamesByFile)) for (const name of list) names.add(name)
    return [...names]
  }, [keepPieceNamesByFile])

  const planoPdfByPiece = useMemo(() => {
    const map: Record<string, string> = {}
    if (allPieceNames.length === 0) return map
    for (const f of planoFiles) {
      const match = matchPlanoPdfToPieceName(f.name, allPieceNames)
      if (match) map[match] = f.name
    }
    return map
  }, [allPieceNames, planoFiles])

  const matchedPlanoCount = Object.keys(planoPdfByPiece).length
  const detectedPieces = xtItems.reduce((n, it) => n + it.result.pieces.length, 0)
  const totalQueuedPieces = Object.values(keepPieceNamesByFile).reduce((n, list) => n + list.length, 0)
  const removedPieces = detectedPieces - totalQueuedPieces
  /** Un .x_t sin piezas no se puede entregar: la subida lo rechazaría. */
  const emptyFiles = xtItems.filter((it) => (keepPieceNamesByFile[it.file.name]?.length ?? 0) === 0)

  async function addXtFiles(files: FileList | File[]): Promise<void> {
    const list = Array.from(files).filter((f) => isXtDesignFile(f))
    if (list.length === 0) {
      setXtError('Elige archivos .x_t (Parasolid en texto).')
      return
    }
    setXtBusy(true)
    setXtError(null)
    const added: XtQueueItem[] = []
    const problems: string[] = []
    try {
      for (const file of list) {
        if (xtItems.some((it) => it.file.name === file.name) || added.some((it) => it.file.name === file.name)) {
          problems.push(`${file.name}: ya estaba en la lista`)
          continue
        }
        try {
          const t0 = performance.now()
          const parsed = await parseXtFile(file)
          const elapsedMs = performance.now() - t0
          if (parsed.format !== 'text') {
            problems.push(`${file.name}: es FORMAT=${parsed.format}; solo se lee Parasolid en texto (.x_t)`)
            continue
          }
          if (parsed.pieces.length === 0) {
            problems.push(`${file.name}: no se detectaron piezas`)
            continue
          }
          added.push({ file, result: parsed, elapsedMs })
        } catch (e) {
          problems.push(`${file.name}: ${e instanceof Error ? e.message : 'no se pudo leer'}`)
        }
      }
      if (added.length > 0) setXtItems((prev) => [...prev, ...added])
      setXtError(problems.length > 0 ? problems.join(' · ') : null)
    } finally {
      setXtBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <section className={disenoStepCard}>
        <StepHeader
          n={1}
          title="Información del cliente"
          subtitle="Archivos de referencia que el encargado cargó para esta orden. La diseñadora los usa para modelar."
        />
        <div className={disenoStepBody}>
          {props.clienteInfoVersions.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-slate-300 bg-white px-4 py-5">
              <p className="text-[13px] font-bold text-slate-900">Sin referencias aún</p>
              <p className="mt-1 text-[13px] leading-relaxed text-slate-600">
                El encargado debe subir planos o notas del cliente en <strong>Bodega → Archivos</strong>. Aparecerán
                aquí.
              </p>
            </div>
          ) : (
            <ul className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm">
              {props.clienteInfoVersions.map((v) => (
                <VersionRow
                  key={v.id}
                  v={v}
                  badge="Ref."
                  onDownload={props.onDownload}
                  formatDateTime={props.formatDateTime}
                />
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className={disenoStepCard}>
        <StepHeader
          n={2}
          title="Entrega de diseño (.x_t + planos)"
          subtitle="Sube uno o varios ensambles y los PDF con el mismo nombre que cada pieza. Luego eliges el destino de cada pieza."
        />
        <div className={disenoStepBody}>
          {props.canUploadDesign ? (
            <div className={disenoBarraAcciones}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <span className={disenoAccentIconBox}>
                  <span className="font-mono text-[13px] font-bold">XT</span>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-bold text-slate-900">Elegir ensamble Parasolid</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-slate-600">
                    Cada archivo se lee aquí para listar sus piezas. Puedes subir <strong>varios .x_t</strong> si el
                    ensamble viene partido: cada uno queda como una entrega que el encargado confirma por separado.
                  </p>
                  <label className={`mt-3 inline-flex min-h-[44px] cursor-pointer items-center justify-center ${disenoAccentBtn}`}>
                    {xtBusy
                      ? 'Leyendo .x_t…'
                      : props.designUploadBusy
                        ? props.designUploadPhase || 'Subiendo…'
                        : xtItems.length > 0
                          ? 'Agregar otro .x_t'
                          : 'Seleccionar archivo(s) .x_t'}
                    <input
                      type="file"
                      accept=".x_t,.xt,.X_T"
                      multiple
                      className="hidden"
                      disabled={props.designUploadBusy || xtBusy}
                      onChange={(e) => {
                        // Copiar antes de limpiar: `files` es una lista viva y `value = ''` la vacía.
                        const picked = Array.from(e.target.files ?? [])
                        e.currentTarget.value = ''
                        if (picked.length === 0) return
                        void addXtFiles(picked)
                      }}
                    />
                  </label>
                </div>
              </div>
            </div>
          ) : (
            <p className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-[13px] text-slate-700">
              Solo la <strong>diseñadora</strong> puede entregar el ensamble .x_t aquí.
            </p>
          )}

          {xtError ? (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-800">{xtError}</p>
          ) : null}

          {xtItems.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-section-navy/30 bg-white shadow-md">
              <div className="flex flex-wrap items-center justify-between gap-3 bg-section-navy px-4 py-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-bold text-white">
                    {xtItems.length === 1
                      ? '1 ensamble .x_t listo para entregar'
                      : `${xtItems.length} ensambles .x_t listos para entregar`}
                  </p>
                  <p className="mt-0.5 text-[11px] text-sky-100/90">
                    {totalQueuedPieces} pieza{totalQueuedPieces === 1 ? '' : 's'} en total
                    {removedPieces > 0 ? ` · ${removedPieces} quitada${removedPieces === 1 ? '' : 's'}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded-lg border border-white/45 bg-white px-3.5 py-2 text-[13px] font-bold text-section-navy shadow-sm transition hover:bg-rose-50 hover:text-rose-800 disabled:opacity-60"
                  onClick={clearXtPreview}
                  disabled={props.designUploadBusy}
                >
                  {xtItems.length === 1 ? 'Quitar archivo' : 'Quitar todos'}
                </button>
              </div>
              <ul className="divide-y divide-slate-100 border-b border-slate-200">
                {xtItems.map((it) => (
                  <li
                    key={it.file.name}
                    className="flex flex-wrap items-center justify-between gap-2 bg-white px-4 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-mono text-[12px] font-semibold text-slate-900" title={it.file.name}>
                        {it.file.name}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {(it.file.size / (1024 * 1024)).toFixed(1)} MB ·{' '}
                        {keepPieceNamesByFile[it.file.name]?.length ?? it.result.pieces.length} de{' '}
                        {it.result.pieces.length} pieza{it.result.pieces.length === 1 ? '' : 's'}
                        {it.elapsedMs > 0 ? ` · leído en ${(it.elapsedMs / 1000).toFixed(1)} s` : ''}
                      </p>
                    </div>
                    {xtItems.length > 1 ? (
                      <button
                        type="button"
                        className="shrink-0 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-800 disabled:opacity-50"
                        disabled={props.designUploadBusy}
                        onClick={() => removeXtItem(it.file.name)}
                      >
                        Quitar
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
              <div className="space-y-3 bg-slate-50 p-3 sm:p-4">
                {props.canUploadDesign ? (
                  <div
                    className="rounded-xl border-2 border-dashed border-emerald-400/70 bg-white p-3 sm:p-4"
                    onDragOver={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                    }}
                    onDrop={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      if (props.designUploadBusy) return
                      const list = e.dataTransfer.files
                      if (list?.length) addPlanoFiles(list)
                    }}
                  >
                    <p className="text-[13px] font-bold text-section-navy">Planos PDF → icono en la pieza</p>
                    <p className="mt-1 text-[12px] leading-relaxed text-slate-600">
                      El PDF debe llamarse igual que la pieza (ej. <span className="font-mono">BASE.pdf</span>). Al
                      elegirlo verás el badge <span className="font-bold text-emerald-800">PDF · Plano listo</span>{' '}
                      al lado. El plano no limita el destino: cualquier pieza puede ir a CNC, torno, perfiladora o
                      accesorio.
                    </p>
                    <input
                      ref={planoInputRef}
                      type="file"
                      accept=".pdf,application/pdf"
                      multiple
                      className="sr-only"
                      tabIndex={-1}
                      disabled={props.designUploadBusy}
                      onChange={(e) => {
                        const list = e.target.files
                        if (list?.length) addPlanoFiles(list)
                        else setXtError('No se seleccionó ningún archivo PDF.')
                        e.target.value = ''
                      }}
                    />
                    <button
                      type="button"
                      disabled={props.designUploadBusy}
                      onClick={openPlanoPicker}
                      className="mt-3 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border-2 border-dashed border-section-navy/50 bg-sky-50 px-4 py-2.5 text-[13px] font-bold text-section-navy hover:bg-sky-100 disabled:opacity-50"
                    >
                      <span
                        className="flex h-6 w-6 items-center justify-center rounded bg-rose-600 text-[9px] font-black text-white"
                        aria-hidden
                      >
                        PDF
                      </span>
                      {planoFiles.length > 0
                        ? `Agregar más planos… (${planoFiles.length})`
                        : 'Elegir planos PDF'}
                    </button>
                    {planoFiles.length > 0 ? (
                      <p className="mt-2 text-[12px] font-semibold text-emerald-800">
                        {matchedPlanoCount} de {planoFiles.length} PDF coinciden · revisa el badge en la lista de abajo.
                      </p>
                    ) : (
                      <p className="mt-2 text-[12px] text-slate-500">También puedes arrastrar los PDF a este cuadro.</p>
                    )}
                    {planoFiles.length > 0 ? (
                      <ul className="mt-3 max-h-40 divide-y divide-slate-100 overflow-auto rounded-lg border border-slate-200">
                        {planoFiles.map((f) => {
                          const match = matchPlanoPdfToPieceName(f.name, allPieceNames)
                          return (
                            <li
                              key={f.name}
                              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[12px]"
                            >
                              <div className="min-w-0">
                                <p className="truncate font-mono font-semibold text-slate-900">{f.name}</p>
                                {match ? (
                                  <p className="font-semibold text-emerald-800">→ pieza «{match}»</p>
                                ) : (
                                  <p className="text-amber-800">Nombre no coincide con ninguna pieza</p>
                                )}
                              </div>
                              <button
                                type="button"
                                className="shrink-0 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-bold text-rose-800"
                                disabled={props.designUploadBusy}
                                onClick={() => removePlanoFile(f.name)}
                              >
                                Quitar
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    ) : null}
                  </div>
                ) : null}

                <div className="space-y-3">
                  {props.canUploadDesign ? (
                    <p className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-[12px] leading-relaxed text-slate-600">
                      Si una pieza no debe entrar (está mal, sobra o no se maquina), usa{' '}
                      <strong className="text-rose-800">Quitar</strong> y no se registrará. Puedes{' '}
                      <strong className="text-emerald-800">Restaurar</strong>la antes de entregar.
                    </p>
                  ) : null}
                  <p className="text-[12px] font-bold uppercase tracking-wide text-slate-600">
                    Piezas del ensamble
                    {removedPieces > 0 ? (
                      <span className="ml-2 font-semibold normal-case text-rose-800">
                        · {removedPieces} quitada{removedPieces === 1 ? '' : 's'}
                      </span>
                    ) : null}
                    {matchedPlanoCount > 0 ? (
                      <span className="ml-2 font-semibold normal-case text-emerald-800">
                        · {matchedPlanoCount} con plano PDF
                      </span>
                    ) : planoFiles.length > 0 ? (
                      <span className="ml-2 font-semibold normal-case text-amber-800">
                        · ningún PDF coincide por nombre
                      </span>
                    ) : null}
                  </p>
                  {xtItems.map((it) => (
                    <div key={it.file.name}>
                      {xtItems.length > 1 ? (
                        <p className="mb-1 truncate font-mono text-[11px] font-bold text-section-navy" title={it.file.name}>
                          {it.file.name}
                        </p>
                      ) : null}
                      <BodegaXtPieceList
                        result={it.result}
                        compact
                        planoPdfByPiece={planoPdfByPiece}
                        excludedNames={
                          new Set(
                            it.result.pieces
                              .map((p) => p.name)
                              .filter((name) => excludedKeys.has(excludeKey(it.file.name, name))),
                          )
                        }
                        onToggleExclude={
                          props.canUploadDesign
                            ? (pieceName) => toggleExcludedPiece(it.file.name, pieceName)
                            : undefined
                        }
                        toggleDisabled={props.designUploadBusy}
                      />
                    </div>
                  ))}
                </div>

                {props.canUploadDesign && pendingEntregaCount > 0 ? (
                  <fieldset className="rounded-xl border border-amber-300 bg-amber-50 p-3 sm:p-4">
                    <legend className="px-1 text-[12px] font-bold text-amber-950">
                      El encargado tiene {pendingEntregaCount} entrega(s) sin confirmar
                    </legend>
                    <label className="flex cursor-pointer items-start gap-2.5 text-[13px] text-amber-950">
                      <input
                        type="radio"
                        name="modo-entrega-xt"
                        className="mt-1"
                        checked={entregaMode === 'sumar'}
                        disabled={props.designUploadBusy}
                        onChange={() => setEntregaMode('sumar')}
                      />
                      <span>
                        <strong>Se suma</strong> — falta parte del ensamble. Lo anterior sigue en pie y el encargado
                        confirma cada archivo por separado.
                      </span>
                    </label>
                    <label className="mt-2 flex cursor-pointer items-start gap-2.5 text-[13px] text-amber-950">
                      <input
                        type="radio"
                        name="modo-entrega-xt"
                        className="mt-1"
                        checked={entregaMode === 'corregir'}
                        disabled={props.designUploadBusy}
                        onChange={() => setEntregaMode('corregir')}
                      />
                      <span>
                        <strong>Corrige</strong> — esto reemplaza lo que entregué antes. Las entregas pendientes quedan
                        marcadas como reemplazadas.
                      </span>
                    </label>
                  </fieldset>
                ) : null}

                {props.canUploadDesign ? (
                  <>
                    {emptyFiles.length > 0 ? (
                      <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-900">
                        Quitaste todas las piezas de{' '}
                        <span className="font-mono font-bold">
                          {emptyFiles.map((it) => it.file.name).join(', ')}
                        </span>
                        . Restaura alguna pieza o quita el archivo de la lista.
                      </p>
                    ) : null}
                    <button
                      type="button"
                      disabled={props.designUploadBusy || emptyFiles.length > 0}
                      className={`w-full sm:w-auto ${disenoSuccessBtn}`}
                      onClick={() =>
                        props.onUploadDesign({
                          files: xtItems.map((it) => it.file),
                          planos: planoFiles,
                          mode: entregaMode,
                          keepPieceNamesByFile,
                        })
                      }
                    >
                      {props.designUploadBusy
                        ? props.designUploadPhase || 'Entregando…'
                        : [
                            xtItems.length === 1 ? 'Entregar este ensamble' : `Entregar ${xtItems.length} ensambles`,
                            ` (${totalQueuedPieces} pieza${totalQueuedPieces === 1 ? '' : 's'})`,
                            planoFiles.length > 0 ? ` + ${planoFiles.length} plano(s)` : '',
                          ].join('')}
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          ) : null}

          {latestEntrega && props.designEntregaVersions.length > 0 ? (
            <p className="text-[13px] text-slate-600">
              Última entrega:{' '}
              <span className="font-mono font-bold text-slate-900">V{latestEntrega.version}</span> —{' '}
              {statusShort(latestEntrega.status, latestEntrega.comentarios)}
            </p>
          ) : null}

          {props.designEntregaVersions.length === 0 ? (
            <div className="rounded-xl border border-slate-300 bg-white px-4 py-4 text-[13px] text-slate-700">
              <strong>Aún no hay entregas.</strong> Cuando subas el .x_t, el proyecto pasa a revisión del supervisor y
              el reloj de diseño se pausa.
            </div>
          ) : (
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-700">Historial de entregas</p>
              <ul className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm">
                {props.designEntregaVersions.map((v) => (
                  <VersionRow
                    key={v.id}
                    v={v}
                    badge={`V${v.version}`}
                    onDownload={props.onDownload}
                    formatDateTime={props.formatDateTime}
                  />
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
