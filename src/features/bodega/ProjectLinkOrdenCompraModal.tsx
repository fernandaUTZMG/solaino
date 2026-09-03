import { useEffect, useMemo, useState } from 'react'
import type { CatalogOpt } from '../../lib/ordenCompraPdfExtract'
import { filterCotizacionLineas } from '../../lib/ordenCompraPdfExtract'
import { uploadOrdenCompraFromPdf } from '../../lib/bodegaOrdenCompraUpload'
import type { OrdenCompraRow } from '../../lib/bodegaOrdenes'
import { linkProjectToOrdenCompra } from '../../lib/bodegaProjectOrdenLink'

type ProjectSummary = {
  id: string
  folio: string
  nombre: string
  cliente: string
  empresa: string | null
}

type Mode = 'existing' | 'upload'

function numeroFromFilename(name: string): string {
  const base = name.replace(/\.pdf$/i, '').trim()
  const m = base.match(/C-\d+/i)
  return m ? m[0].toUpperCase() : base.slice(0, 40).toUpperCase()
}

export function ProjectLinkOrdenCompraModal(props: {
  project: ProjectSummary
  ordenes: OrdenCompraRow[]
  empresaOpts: CatalogOpt[]
  requisitorOpts: CatalogOpt[]
  onClose: () => void
  onLinked: (oc: OrdenCompraRow) => void
}) {
  const [mode, setMode] = useState<Mode>('existing')
  const [ordenCompraId, setOrdenCompraId] = useState('')
  const [partidaIdx, setPartidaIdx] = useState('')
  const [syncFields, setSyncFields] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadNumero, setUploadNumero] = useState('')
  const [uploadFecha, setUploadFecha] = useState(() => new Date().toISOString().slice(0, 10))
  const [uploadEmpresaId, setUploadEmpresaId] = useState('')
  const [uploadRequisitorId, setUploadRequisitorId] = useState('')
  const [uploadCotizacionLineas, setUploadCotizacionLineas] = useState<string[]>([])
  const [uploadPdfParsing, setUploadPdfParsing] = useState(false)
  const [uploadPdfNote, setUploadPdfNote] = useState<string | null>(null)

  const selectedOc = useMemo(
    () => props.ordenes.find((o) => o.id === ordenCompraId) ?? null,
    [props.ordenes, ordenCompraId],
  )

  const partidas = useMemo(
    () => (selectedOc ? filterCotizacionLineas(selectedOc.cotizacion_lineas) : []),
    [selectedOc],
  )

  useEffect(() => {
    setPartidaIdx('')
  }, [ordenCompraId])

  async function parsePdf(f: File) {
    setUploadPdfParsing(true)
    setUploadPdfNote(null)
    setUploadCotizacionLineas([])
    try {
      const { parseOrdenCompraPdfViaEdge } = await import('../../lib/parseOrdenCompraPdfEdge')
      const {
        extractPdfPlainText,
        matchCatalogByName,
        parseOrdenCompraFromText,
        extractCotizacionLineDescriptions,
      } = await import('../../lib/ordenCompraPdfExtract')
      const baseNumero = numeroFromFilename(f.name)
      const edge = await parseOrdenCompraPdfViaEdge(f)
      if (edge.ok) {
        const inferred = edge.inferred
        if (inferred.numero) setUploadNumero(inferred.numero)
        const fechaFinal = inferred.fechaIso ?? edge.metadataDateIso
        if (fechaFinal) setUploadFecha(fechaFinal)
        if (edge.cotizacion_lineas.length) setUploadCotizacionLineas(edge.cotizacion_lineas)
        const emp = matchCatalogByName(inferred.empresaHint, props.empresaOpts)
        if (emp) setUploadEmpresaId(emp)
        const req = matchCatalogByName(inferred.requisitorHint, props.requisitorOpts)
        if (req) setUploadRequisitorId(req)
        return
      }
      const { text, metadataDateIso } = await extractPdfPlainText(f)
      const inferred = parseOrdenCompraFromText(text, baseNumero)
      if (inferred.numero) setUploadNumero(inferred.numero)
      const fechaFinal = inferred.fechaIso ?? metadataDateIso
      if (fechaFinal) setUploadFecha(fechaFinal)
      const lines = extractCotizacionLineDescriptions(text)
      if (lines.length) setUploadCotizacionLineas(lines)
      const emp = matchCatalogByName(inferred.empresaHint, props.empresaOpts)
      if (emp) setUploadEmpresaId(emp)
      const req = matchCatalogByName(inferred.requisitorHint, props.requisitorOpts)
      if (req) setUploadRequisitorId(req)
      if (!inferred.numero && !lines.length) {
        setUploadPdfNote('No se detectaron datos automáticos; completa número y fecha manualmente.')
      }
    } catch (e) {
      setUploadPdfNote(e instanceof Error ? e.message : 'No se pudo leer el PDF.')
    } finally {
      setUploadPdfParsing(false)
    }
  }

  async function submit() {
    setError(null)
    setBusy(true)
    try {
      let oc: OrdenCompraRow

      if (mode === 'existing') {
        if (!selectedOc) {
          setError('Selecciona una orden de compra.')
          return
        }
        oc = selectedOc
      } else {
        if (!uploadFile) {
          setError('Selecciona el PDF de la orden.')
          return
        }
        const numero = (uploadNumero.trim() || numeroFromFilename(uploadFile.name)).toUpperCase()
        if (numero.length < 2) {
          setError('Indica el número de orden de compra.')
          return
        }
        oc = await uploadOrdenCompraFromPdf({
          file: uploadFile,
          numero,
          fecha: uploadFecha,
          empresaId: uploadEmpresaId,
          requisitorId: uploadRequisitorId,
          cotizacionLineas: uploadCotizacionLineas,
        })
      }

      const lineIdx = partidaIdx ? Number(partidaIdx) : null
      await linkProjectToOrdenCompra({
        projectId: props.project.id,
        ordenCompra: oc,
        cotizacionLineaIdx: lineIdx && Number.isFinite(lineIdx) ? lineIdx : null,
        syncClienteEmpresa: syncFields,
      })
      props.onLinked(oc)
      props.onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo vincular la orden.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-4 sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-[2px]"
        aria-label="Cerrar"
        onClick={() => props.onClose()}
      />
      <div className="relative flex max-h-[min(92vh,780px)] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-blue-950/25 bg-white shadow-2xl">
        <div className="shrink-0 border-b border-blue-950/25 bg-section-navy px-5 py-4 text-white">
          <div className="text-lg font-bold">Vincular orden de compra</div>
          <p className="mt-1 font-mono text-sm text-blue-100/90">{props.project.folio}</p>
          <p className="mt-0.5 text-sm text-blue-100/80">{props.project.nombre}</p>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          {error ? (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-900">{error}</p>
          ) : null}

          <div className="flex gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              className={[
                'flex-1 rounded-lg px-3 py-2 text-[13px] font-semibold',
                mode === 'existing' ? 'bg-white text-section-navy shadow-sm' : 'text-slate-600',
              ].join(' ')}
              onClick={() => setMode('existing')}
            >
              OC registrada
            </button>
            <button
              type="button"
              className={[
                'flex-1 rounded-lg px-3 py-2 text-[13px] font-semibold',
                mode === 'upload' ? 'bg-white text-section-navy shadow-sm' : 'text-slate-600',
              ].join(' ')}
              onClick={() => setMode('upload')}
            >
              Adjuntar PDF
            </button>
          </div>

          {mode === 'existing' ? (
            <>
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Orden de compra
                </span>
                <select
                  value={ordenCompraId}
                  onChange={(e) => setOrdenCompraId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-950/45 focus:ring-2 focus:ring-section-navy/20"
                >
                  <option value="">— Selecciona —</option>
                  {props.ordenes.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.numero} · {o.empresa?.nombre ?? 'Sin empresa'}
                    </option>
                  ))}
                </select>
              </label>

              {partidas.length > 0 ? (
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Partida del PDF (opcional)
                  </span>
                  <select
                    value={partidaIdx}
                    onChange={(e) => setPartidaIdx(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-950/45 focus:ring-2 focus:ring-section-navy/20"
                  >
                    <option value="">— Sin partida específica —</option>
                    {partidas.map((desc, i) => (
                      <option key={i} value={String(i + 1)}>
                        {i + 1}. {desc.slice(0, 80)}
                        {desc.length > 80 ? '…' : ''}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </>
          ) : (
            <>
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Archivo PDF</span>
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  disabled={uploadPdfParsing}
                  className="mt-1 w-full text-[13px]"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null
                    setUploadFile(f)
                    if (f) {
                      if (!uploadNumero.trim()) setUploadNumero(numeroFromFilename(f.name))
                      void parsePdf(f)
                    }
                  }}
                />
                {uploadPdfParsing ? (
                  <p className="mt-1 text-[12px] text-slate-600">Leyendo PDF…</p>
                ) : null}
                {uploadPdfNote ? (
                  <p className="mt-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[12px] text-amber-950">
                    {uploadPdfNote}
                  </p>
                ) : null}
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Número de orden</span>
                <input
                  value={uploadNumero}
                  onChange={(e) => setUploadNumero(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Fecha</span>
                <input
                  type="date"
                  value={uploadFecha}
                  onChange={(e) => setUploadFecha(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Empresa</span>
                <select
                  value={uploadEmpresaId}
                  onChange={(e) => setUploadEmpresaId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="">—</option>
                  {props.empresaOpts.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Requisitor</span>
                <select
                  value={uploadRequisitorId}
                  onChange={(e) => setUploadRequisitorId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="">—</option>
                  {props.requisitorOpts.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.nombre}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}

          <label className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            <input
              type="checkbox"
              checked={syncFields}
              onChange={(e) => setSyncFields(e.target.checked)}
              className="mt-0.5"
            />
            <span className="text-[12px] leading-snug text-slate-700">
              Actualizar cliente y empresa del proyecto con los datos de la orden vinculada.
            </span>
          </label>
        </div>

        <div className="shrink-0 flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800"
            onClick={() => props.onClose()}
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy || uploadPdfParsing}
            className="rounded-xl bg-section-navy px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
            onClick={() => void submit()}
          >
            {busy ? 'Guardando…' : 'Vincular orden'}
          </button>
        </div>
      </div>
    </div>
  )
}
