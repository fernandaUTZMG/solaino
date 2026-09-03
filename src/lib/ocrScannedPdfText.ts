import * as pdfjs from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc

/** Texto mínimo para considerar que el OCR aportó algo usable. */
export const OCR_MIN_USABLE_CHARS = 72

/**
 * Para PDF escaneado (sin capa de texto): renderiza las primeras páginas a imagen y aplica Tesseract en el navegador.
 * Descarga idiomas spa+eng la primera vez (varios MB). Puede tardar decenas de segundos por página.
 */
export async function ocrPdfFirstPagesAsText(
  file: File,
  options: { maxPages?: number; scale?: number } = {},
): Promise<string> {
  const maxPages = Math.max(1, Math.min(options.maxPages ?? 2, 4))
  const scale = options.scale ?? 2

  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker(['spa', 'eng'], 1, {
    logger: () => {},
  })

  const data = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data }).promise
  const n = Math.min(maxPages, pdf.numPages)
  const parts: string[] = []

  try {
    for (let i = 1; i <= n; i++) {
      const page = await pdf.getPage(i)
      const viewport = page.getViewport({ scale })
      const w = Math.floor(viewport.width)
      const h = Math.floor(viewport.height)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('No se pudo crear contexto 2D del canvas.')

      const task = page.render({ canvasContext: ctx, viewport })
      await task.promise

      const {
        data: { text },
      } = await worker.recognize(canvas)
      const t = (text ?? '').trim()
      if (t) parts.push(t)
    }
  } finally {
    await worker.terminate()
  }

  return parts.join('\n\n')
}
