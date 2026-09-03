import { filterCotizacionLineas } from './ordenCompraPdfExtract'
import { uploadBodegaProyectosBinary } from './bodegaStorageUpload'
import { BODEGA_ORDENES_BUCKET, sanitizeStorageFileName, type OrdenCompraRow } from './bodegaOrdenes'
import { getSupabase } from './supabaseClient'

export type UploadOrdenCompraInput = {
  file: File
  numero: string
  fecha: string
  empresaId: string
  requisitorId: string
  cotizacionLineas: string[]
  empresaPdfText?: string
  requisitorPdfText?: string
}

export async function uploadOrdenCompraFromPdf(input: UploadOrdenCompraInput): Promise<OrdenCompraRow> {
  const sb = getSupabase()
  const numero = input.numero.trim().toUpperCase()
  const safeName = sanitizeStorageFileName(input.file.name)
  const path = `${numero}/${crypto.randomUUID()}-${safeName}`

  await uploadBodegaProyectosBinary(
    sb,
    BODEGA_ORDENES_BUCKET,
    path,
    input.file,
    input.file.type || 'application/pdf',
  )

  const notasParts: string[] = []
  if (input.empresaPdfText?.trim() && !input.empresaId) {
    notasParts.push(`Empresa según PDF: ${input.empresaPdfText.trim()}`)
  }
  if (input.requisitorPdfText?.trim() && !input.requisitorId) {
    notasParts.push(`Requisitor según PDF: ${input.requisitorPdfText.trim()}`)
  }

  let lineasGuardar = filterCotizacionLineas(input.cotizacionLineas)
  if (lineasGuardar.length === 0) {
    const { parseOrdenCompraPdfViaEdge } = await import('./parseOrdenCompraPdfEdge')
    const edgeRetry = await parseOrdenCompraPdfViaEdge(input.file)
    if (edgeRetry.ok && edgeRetry.cotizacion_lineas.length > 0) {
      lineasGuardar = edgeRetry.cotizacion_lineas
    } else {
      const mod = await import('./ordenCompraPdfExtract')
      try {
        const { text } = await mod.extractPdfPlainText(input.file)
        lineasGuardar = mod.extractCotizacionLineDescriptions(text)
      } catch {
        /* ignore */
      }
    }
  }

  const insertPayload: Record<string, unknown> = {
    numero,
    archivo_storage_path: path,
    archivo_nombre: input.file.name,
    fecha: input.fecha,
    empresa_id: input.empresaId || null,
    requisitor_id: input.requisitorId || null,
    notas: notasParts.length ? notasParts.join('\n') : null,
  }
  if (lineasGuardar.length > 0) insertPayload.cotizacion_lineas = lineasGuardar

  let res = await sb
    .from('bodega_ordenes_compra')
    .insert(insertPayload)
    .select(
      `id, numero, archivo_storage_path, archivo_nombre, fecha, empresa_id, requisitor_id, cotizacion_lineas, empresa:empresas (nombre), requisitor:requisitores (nombre)`,
    )
    .single()

  if (res.error) {
    const im = [res.error.message, (res.error as { details?: string }).details].filter(Boolean).join(' ')
    if (/cotizacion_lineas|column.*does not exist/i.test(im) && insertPayload.cotizacion_lineas != null) {
      const { cotizacion_lineas: _cl, ...rest } = insertPayload
      res = await sb
        .from('bodega_ordenes_compra')
        .insert(rest)
        .select(
          `id, numero, archivo_storage_path, archivo_nombre, fecha, empresa_id, requisitor_id, empresa:empresas (nombre), requisitor:requisitores (nombre)`,
        )
        .single()
    }
    if (res.error) throw res.error
  }

  const row = res.data as Omit<OrdenCompraRow, 'cotizacion_lineas' | 'empresa' | 'requisitor'> & {
    cotizacion_lineas?: string[] | null
    empresa: { nombre: string } | { nombre: string }[] | null
    requisitor: { nombre: string } | { nombre: string }[] | null
  }

  const empresa = Array.isArray(row.empresa) ? row.empresa[0] ?? null : row.empresa
  const requisitor = Array.isArray(row.requisitor) ? row.requisitor[0] ?? null : row.requisitor

  return {
    ...row,
    cotizacion_lineas: Array.isArray(row.cotizacion_lineas) ? row.cotizacion_lineas : lineasGuardar,
    empresa,
    requisitor,
  }
}
