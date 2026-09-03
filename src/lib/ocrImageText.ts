/**
 * OCR de imagen en el navegador (Tesseract). La primera vez descarga idiomas (~MB).
 */

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('No se pudo cargar la imagen para OCR.'))
    }
    img.src = url
  })
}

type CropRect = {
  leftRatio?: number
  topRatio?: number
  widthRatio?: number
  heightRatio?: number
  /** Recorte inferior: fracción de altura desde abajo (alternativa a top/height). */
  bottomRatio?: number
}

function canvasFromImage(img: HTMLImageElement, scale: number, crop?: CropRect): HTMLCanvasElement {
  let sx = 0
  let sy = 0
  let sw = img.width
  let sh = img.height

  if (crop?.bottomRatio != null) {
    const cropTop = Math.floor(img.height * (1 - crop.bottomRatio))
    sy = cropTop
    sh = img.height - cropTop
  } else if (crop) {
    sx = Math.floor(img.width * (crop.leftRatio ?? 0))
    sy = Math.floor(img.height * (crop.topRatio ?? 0))
    sw = Math.max(1, Math.floor(img.width * (crop.widthRatio ?? 1)))
    sh = Math.max(1, Math.floor(img.height * (crop.heightRatio ?? 1)))
    sw = Math.min(sw, img.width - sx)
    sh = Math.min(sh, img.height - sy)
  }

  sw = Math.max(1, sw)
  sh = Math.max(1, sh)

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.floor(sw * scale))
  canvas.height = Math.max(1, Math.floor(sh * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No se pudo preparar la imagen para OCR.')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
  return canvas
}

async function recognizeCanvas(
  canvas: HTMLCanvasElement,
  worker: Awaited<ReturnType<typeof import('tesseract.js')['createWorker']>>,
): Promise<string> {
  const {
    data: { text },
  } = await worker.recognize(canvas)
  return (text ?? '').trim()
}

/**
 * OCR con imagen ampliada (mejor para capturas SURFCAM).
 * Pasadas: completa, zona inferior (fila Overall) y columna Cycle Time (abajo-derecha).
 */
export async function ocrImageFileAsText(file: File): Promise<string> {
  const { createWorker, PSM } = await import('tesseract.js')
  const worker = await createWorker(['eng'], 1, {
    logger: () => {},
  })

  try {
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
    })

    const img = await loadImageFromFile(file)
    const scale = img.width < 1400 ? 2.5 : 1.75

    const fullCanvas = canvasFromImage(img, scale)
    const bottomCanvas = canvasFromImage(img, scale, { bottomRatio: 0.42 })
    const cycleTimeCanvas = canvasFromImage(img, scale, {
      leftRatio: 0.52,
      topRatio: 0.28,
      widthRatio: 0.48,
      heightRatio: 0.55,
    })

    const [fullText, bottomText, cycleText] = await Promise.all([
      recognizeCanvas(fullCanvas, worker),
      recognizeCanvas(bottomCanvas, worker),
      recognizeCanvas(cycleTimeCanvas, worker),
    ])

    return [fullText, bottomText, cycleText].filter(Boolean).join('\n\n---\n\n')
  } finally {
    await worker.terminate()
  }
}
