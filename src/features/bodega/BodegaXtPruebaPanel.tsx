import { useState } from 'react'
import { parseXtFile, type XtParseResult } from '../../lib/xtParasolidPieces'
import { BodegaXtPieceList } from './BodegaXtPieceList'

/**
 * Prueba de lectura de un ensamble Parasolid en texto (`.x_t`): muestra las piezas detectadas.
 * No sube nada ni escribe en la base; solo valida el extractor con archivos reales.
 */
export default function BodegaXtPruebaPanel({ onClose }: { onClose: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const [fileMb, setFileMb] = useState(0)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [result, setResult] = useState<XtParseResult | null>(null)

  async function handleFile(file: File): Promise<void> {
    setBusy(true)
    setError(null)
    setResult(null)
    setFileName(file.name)
    setFileMb(file.size / (1024 * 1024))
    try {
      const t0 = performance.now()
      const parsed = await parseXtFile(file)
      setElapsedMs(performance.now() - t0)
      if (parsed.format !== 'text') {
        setError(
          `El archivo es FORMAT=${parsed.format}. Solo se puede leer Parasolid en texto (.x_t). ` +
            'Si la diseñadora exporta .x_b (binario), no se pueden extraer los nombres.',
        )
        return
      }
      setResult(parsed)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer el archivo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/45 p-4">
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
        <h2 className="text-base font-bold text-slate-900">Prueba de lectura de ensamble .x_t</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-slate-600">
          Selecciona el archivo <span className="font-mono">.x_t</span> que exporta la diseñadora. Se lee en tu
          navegador para ver qué piezas detecta. No se sube nada ni se guarda en la base de datos.
        </p>

        <label className="mt-3 inline-flex w-fit cursor-pointer items-center justify-center rounded-xl bg-section-navy px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition hover:brightness-110">
          {busy ? 'Leyendo…' : 'Elegir archivo .x_t'}
          <input
            type="file"
            accept=".x_t,.xt,.X_T"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) void handleFile(f)
            }}
          />
        </label>

        {fileName ? (
          <p className="mt-2 text-[12px] text-slate-500">
            {fileName} · {fileMb.toFixed(1)} MB
            {elapsedMs > 0 ? ` · leído en ${(elapsedMs / 1000).toFixed(1)} s` : ''}
          </p>
        ) : null}

        {error ? (
          <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-800">
            {error}
          </p>
        ) : null}

        {result ? (
          <div className="mt-3 min-h-0 flex-1 overflow-auto">
            <BodegaXtPieceList result={result} compact />
          </div>
        ) : null}

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
            onClick={onClose}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
