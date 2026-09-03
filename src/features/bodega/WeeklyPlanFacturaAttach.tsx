import { useRef, useState } from 'react'
import type { BodegaWeeklyPlanItemEnriched } from '../../lib/bodegaWeeklyPlanRepo'
import {
  clearWeeklyPlanFacturaAttachment,
  downloadWeeklyPlanFacturaFile,
  facturaNumeroFromFilename,
  isWeeklyPlanFacturaArchivoColumnError,
  saveWeeklyPlanFacturaAttachment,
  uploadWeeklyPlanFacturaFile,
  weeklyPlanFacturaAcceptAttr,
  BODEGA_WEEKLY_PLAN_FACTURA_PATCH,
} from '../../lib/bodegaWeeklyPlanFactura'

export function WeeklyPlanFacturaAttach(props: {
  item: BodegaWeeklyPlanItemEnriched
  canManage: boolean
  facturaNumero: string
  disabled?: boolean
  compact?: boolean
  onFacturaNumeroChange?: (value: string) => void
  onReload: () => Promise<void>
  onError: (message: string) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const hasFile = Boolean(props.item.factura_archivo_path?.trim())
  const fileLabel = props.item.factura_archivo_nombre?.trim() || 'Factura adjunta'

  async function onPickFile(file: File | null) {
    if (!file || !props.canManage) return
    setBusy(true)
    props.onError('')
    try {
      const { storagePath, displayName } = await uploadWeeklyPlanFacturaFile(props.item.id, file)
      const suggested = facturaNumeroFromFilename(displayName)
      const nextNumero = props.facturaNumero.trim() || suggested
      await saveWeeklyPlanFacturaAttachment(props.item.id, {
        storagePath,
        displayName,
        facturaNumero: nextNumero,
      })
      if (nextNumero !== props.facturaNumero) {
        props.onFacturaNumeroChange?.(nextNumero)
      }
      await props.onReload()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'No se pudo adjuntar la factura'
      props.onError(
        isWeeklyPlanFacturaArchivoColumnError(e)
          ? `Falta soporte de archivo en la base de datos. Ejecuta ${BODEGA_WEEKLY_PLAN_FACTURA_PATCH} en Supabase.`
          : msg,
      )
    } finally {
      setBusy(false)
    }
  }

  async function onRemoveFile() {
    if (!props.canManage || !hasFile) return
    setBusy(true)
    props.onError('')
    try {
      await clearWeeklyPlanFacturaAttachment(props.item.id)
      await props.onReload()
    } catch (e) {
      props.onError(e instanceof Error ? e.message : 'No se pudo quitar el archivo')
    } finally {
      setBusy(false)
    }
  }

  async function onDownload() {
    const path = props.item.factura_archivo_path?.trim()
    if (!path) return
    try {
      await downloadWeeklyPlanFacturaFile(path, props.item.factura_archivo_nombre?.trim() || 'factura')
    } catch (e) {
      props.onError(e instanceof Error ? e.message : 'No se pudo descargar')
    }
  }

  const btnCls = props.compact
    ? 'rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50'
    : 'rounded-lg border border-amber-300/80 bg-white px-3 py-1.5 text-[11px] font-semibold text-amber-950 shadow-sm hover:bg-amber-50 disabled:opacity-50'

  return (
    <div className={props.compact ? 'mt-1.5 space-y-1' : 'mt-2 space-y-2'}>
      <div className={`flex flex-wrap items-center gap-1.5 ${props.compact ? '' : 'gap-2'}`}>
        {props.canManage ? (
          <>
            <button
              type="button"
              className={btnCls}
              disabled={props.disabled || busy}
              onClick={() => fileRef.current?.click()}
            >
              {busy ? 'Subiendo…' : hasFile ? 'Cambiar archivo' : 'Adjuntar archivo'}
            </button>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              accept={weeklyPlanFacturaAcceptAttr()}
              disabled={props.disabled || busy}
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null
                void onPickFile(f)
                e.currentTarget.value = ''
              }}
            />
          </>
        ) : null}
        {hasFile ? (
          <button
            type="button"
            className={btnCls}
            disabled={busy}
            onClick={() => void onDownload()}
          >
            Ver / descargar
          </button>
        ) : null}
        {props.canManage && hasFile ? (
          <button
            type="button"
            className={`${btnCls} border-rose-200 text-rose-800 hover:bg-rose-50`}
            disabled={props.disabled || busy}
            onClick={() => void onRemoveFile()}
          >
            Quitar archivo
          </button>
        ) : null}
      </div>
      {hasFile ? (
        <p className={`truncate text-slate-600 ${props.compact ? 'text-[9px]' : 'text-[10px]'}`} title={fileLabel}>
          Archivo: {fileLabel}
        </p>
      ) : props.canManage ? (
        <p className={props.compact ? 'text-[9px] text-slate-500' : 'text-[10px] text-slate-500'}>
          PDF, XML o imagen de la factura (opcional).
        </p>
      ) : null}
    </div>
  )
}
