import { useEffect, useMemo, useState } from 'react'
import { isSupabaseConfigured } from '../../env'
import { uploadProductoImagen } from '../../lib/productoImagenStorage'
import type { InventoryItem } from '../../types/inventory'
import {
  IconBoxes,
  IconHash,
  IconImage,
  IconMapPin,
  IconNavInventory,
  IconPencil,
  IconPlus,
  IconSave,
  IconX,
} from '../../ui/shellIcons'

type Mode = 'create' | 'edit'

function TextInput(props: React.ComponentProps<'input'>) {
  return (
    <input
      {...props}
      className={[
        'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none',
        'placeholder:text-slate-400 focus:border-blue-950/40 focus:ring-2 focus:ring-section-navy/20',
        props.className ?? '',
      ].join(' ')}
    />
  )
}

function TextArea(props: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      {...props}
      className={[
        'min-h-[90px] w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none',
        'placeholder:text-slate-400 focus:border-blue-950/40 focus:ring-2 focus:ring-section-navy/20',
        props.className ?? '',
      ].join(' ')}
    />
  )
}

function Field(props: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {props.icon ? <span className="text-blue-900/55">{props.icon}</span> : null}
        <span>{props.label}</span>
      </div>
      {props.children}
    </label>
  )
}

function Toggle(props: { label: string; checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      className={[
        'flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left shadow-sm transition',
        props.checked ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-200 bg-white hover:bg-slate-50',
      ].join(' ')}
      onClick={() => props.onChange(!props.checked)}
      aria-pressed={props.checked}
    >
      <span className="text-sm font-semibold text-slate-800">{props.label}</span>
      <span
        className={[
          'inline-flex h-6 w-11 items-center rounded-full p-0.5 ring-1 transition',
          props.checked ? 'bg-emerald-600 ring-emerald-600/30' : 'bg-slate-300 ring-slate-900/10',
        ].join(' ')}
        aria-hidden
      >
        <span
          className={[
            'h-5 w-5 rounded-full bg-white shadow-sm transition',
            props.checked ? 'translate-x-5' : 'translate-x-0',
          ].join(' ')}
        />
      </span>
    </button>
  )
}

function SectionTitle(props: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  className?: string
}) {
  const Icon = props.icon
  return (
    <div
      className={[
        'flex items-center gap-3 border-b border-slate-200/90 pb-2.5 sm:col-span-2',
        props.className ?? '',
      ].join(' ')}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-950/12 via-slate-100 to-slate-200/80 text-blue-950 shadow-sm ring-1 ring-blue-950/12">
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <span className="text-[12px] font-bold uppercase tracking-[0.08em] text-slate-700">{props.title}</span>
    </div>
  )
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'))
    reader.readAsDataURL(file)
  })
}

const defaultItem: Omit<InventoryItem, 'id'> = {
  codigo: '',
  nombre: '',
  medida: '',
  codigoProducto: '',
  descripcion: '',
  categoriaId: 'cat_componentes',
  stockActual: 0,
  stockMinimo: 0,
  unidad: 'piezas',
  ubicacion: { area: 'Almacén principal', ubicacion: '' },
  costoUnitario: 0,
  proveedorId: '',
  partNumber: '',
  fabricante: '',
  estado: 'Disponible',
  imagenUrl: '',
  datasheetUrl: '',
}

export type CreateProductSubmit = Omit<InventoryItem, 'id'>

export function ProductFormDialog(props: {
  open: boolean
  title: string
  mode: Mode
  initial?: InventoryItem
  onClose: () => void
  onSubmit: (value: CreateProductSubmit | InventoryItem) => void
  onPreviewImage?: (url: string) => void
}) {
  const [form, setForm] = useState<Omit<InventoryItem, 'id'>>(defaultItem)
  const [busy, setBusy] = useState(false)
  const [imageFolderId, setImageFolderId] = useState<string>(() => crypto.randomUUID())
  const [imageError, setImageError] = useState<string | null>(null)

  useEffect(() => {
    if (!props.open) return
    if (props.initial) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, ...rest } = props.initial
      setForm({ ...defaultItem, ...rest })
      setImageFolderId(id)
    } else {
      setForm(defaultItem)
      setImageFolderId(crypto.randomUUID())
    }
    setImageError(null)
  }, [props.open, props.initial])

  const canSubmit = useMemo(() => {
    return form.codigo.trim().length > 0 && form.nombre.trim().length > 0
  }, [form.codigo, form.nombre])

  if (!props.open) return null

  const ModeIcon = props.mode === 'create' ? IconPlus : IconPencil

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-[2px] transition hover:bg-slate-900/65"
        onClick={() => props.onClose()}
        aria-label="Cerrar"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-form-title"
        className="relative flex w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-blue-950/25 bg-white shadow-2xl shadow-blue-950/15 ring-1 ring-blue-950/10"
      >
        <div className="relative overflow-hidden border-b border-blue-950/25 bg-section-navy px-4 py-4 text-white sm:px-6 sm:py-5">
          <div className="pointer-events-none absolute -right-8 -top-12 h-36 w-36 rounded-full bg-blue-400/15 blur-2xl" />
          <div className="relative flex items-start justify-between gap-4">
            <div className="flex min-w-0 flex-1 items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20 shadow-lg">
                <ModeIcon className="h-6 w-6 text-blue-100" />
              </div>
              <div className="min-w-0 pt-0.5">
                <h2 id="product-form-title" className="text-lg font-bold tracking-tight sm:text-xl">
                  {props.title}
                </h2>
                <p className="mt-1 text-sm leading-snug text-blue-100/88">
                  {props.mode === 'create'
                    ? 'Completa los datos para dar de alta un producto en inventario.'
                    : 'Actualiza la información; los cambios se guardan al pulsar Guardar.'}
                </p>
              </div>
            </div>
            <button
              type="button"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition hover:bg-white/20"
              onClick={() => props.onClose()}
              aria-label="Cerrar"
            >
              <IconX className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="max-h-[min(72vh,580px)] overflow-y-auto bg-gradient-to-b from-slate-50 via-white to-slate-50/90 p-4 sm:p-6">
          <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
            <SectionTitle title="Identificación" icon={IconNavInventory} />
            <Field label="Código" icon={<IconNavInventory className="h-3.5 w-3.5 opacity-80" />}>
              <TextInput
                value={form.codigo}
                onChange={(e) => setForm((s) => ({ ...s, codigo: e.target.value }))}
                placeholder="CMP-001"
                autoFocus
              />
            </Field>
            <Field label="Nombre" icon={<IconPencil className="h-3.5 w-3.5 opacity-80" />}>
              <TextInput
                value={form.nombre}
                onChange={(e) => setForm((s) => ({ ...s, nombre: e.target.value }))}
                placeholder="Resistencia 10kΩ"
              />
            </Field>
            <Field label="Medida">
              <TextInput
                value={form.medida ?? ''}
                onChange={(e) => setForm((s) => ({ ...s, medida: e.target.value }))}
                placeholder="12*30*12*75"
              />
            </Field>
            <Field label="Cód. prod.">
              <TextInput
                value={form.codigoProducto ?? ''}
                onChange={(e) => setForm((s) => ({ ...s, codigoProducto: e.target.value }))}
                placeholder="GEN-4F121275"
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Descripción">
                <TextArea
                  value={form.descripcion ?? ''}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, descripcion: e.target.value }))
                  }
                  placeholder="Características técnicas..."
                />
              </Field>
            </div>

            <SectionTitle title="Ubicación" icon={IconMapPin} className="mt-2" />
            <Field label="Área" icon={<IconMapPin className="h-3.5 w-3.5 opacity-80" />}>
              <TextInput
                value={form.ubicacion.area}
                onChange={(e) =>
                  setForm((s) => ({
                    ...s,
                    ubicacion: { ...s.ubicacion, area: e.target.value },
                  }))
                }
                placeholder="Almacén principal"
              />
            </Field>
            <Field label="Ubicación específica" icon={<IconMapPin className="h-3.5 w-3.5 opacity-80" />}>
              <TextInput
                value={form.ubicacion.ubicacion}
                onChange={(e) =>
                  setForm((s) => ({
                    ...s,
                    ubicacion: { ...s.ubicacion, ubicacion: e.target.value },
                  }))
                }
                placeholder="Estante A1"
              />
            </Field>

            <SectionTitle title="Existencias y costo" icon={IconBoxes} className="mt-2" />
            <div className="sm:col-span-2">
              <Field label="Control por serie">
                <Toggle
                  label="El producto requiere número de serie (1 serie = 1 unidad)"
                  checked={Boolean(form.tieneSerie)}
                  onChange={(next) => setForm((s) => ({ ...s, tieneSerie: next }))}
                />
              </Field>
            </div>
            <Field label="Cantidad" icon={<IconBoxes className="h-3.5 w-3.5 opacity-80" />}>
              <TextInput
                type="number"
                inputMode="numeric"
                value={form.stockActual}
                onChange={(e) =>
                  setForm((s) => ({ ...s, stockActual: Number(e.target.value) }))
                }
              />
            </Field>
            <Field label="Stock mínimo" icon={<IconBoxes className="h-3.5 w-3.5 opacity-80" />}>
              <TextInput
                type="number"
                inputMode="numeric"
                value={form.stockMinimo}
                onChange={(e) =>
                  setForm((s) => ({ ...s, stockMinimo: Number(e.target.value) }))
                }
              />
            </Field>
            <Field label="Costo unitario (MXN)" icon={<IconHash className="h-3.5 w-3.5 opacity-80" />}>
              <TextInput
                type="number"
                inputMode="decimal"
                step="0.01"
                value={form.costoUnitario}
                onChange={(e) =>
                  setForm((s) => ({ ...s, costoUnitario: Number(e.target.value) }))
                }
              />
            </Field>

            <SectionTitle title="Imagen" icon={IconImage} className="mt-2 sm:col-span-2" />
            <div className="sm:col-span-2">
            <Field label="Imagen del producto" icon={<IconImage className="h-3.5 w-3.5 opacity-80" />}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                type="file"
                accept="image/*"
                className="block w-full min-w-0 text-sm text-slate-600 file:mr-3 file:rounded-lg file:border file:border-slate-200 file:bg-white file:px-3 file:py-2 file:text-sm file:font-semibold file:text-slate-800 file:shadow-sm hover:file:border-slate-300 hover:file:bg-slate-50"
                onChange={async (e) => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  setImageError(null)
                  setBusy(true)
                  try {
                    if (isSupabaseConfigured()) {
                      const url = await uploadProductoImagen(f, imageFolderId)
                      setForm((s) => ({ ...s, imagenUrl: url }))
                    } else {
                      const url = await readAsDataUrl(f)
                      setForm((s) => ({ ...s, imagenUrl: url }))
                    }
                  } catch (err) {
                    setImageError(err instanceof Error ? err.message : 'No se pudo subir la imagen.')
                  } finally {
                    setBusy(false)
                    e.target.value = ''
                  }
                }}
              />
              {form.imagenUrl ? (
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    title="Ver imagen en grande"
                    className="rounded-xl border border-slate-200 bg-white p-0.5 shadow-sm transition hover:border-blue-400 hover:shadow"
                    onClick={() => props.onPreviewImage?.(form.imagenUrl!)}
                  >
                    <img
                      src={form.imagenUrl}
                      alt=""
                      className="h-12 w-12 rounded-lg object-cover"
                    />
                  </button>
                  <button
                    type="button"
                    title="Quitar imagen"
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                    onClick={() => setForm((s) => ({ ...s, imagenUrl: '' }))}
                  >
                    Quitar
                  </button>
                </div>
              ) : null}
            </div>
            <div className="mt-1 text-xs leading-snug text-slate-500">
              {isSupabaseConfigured()
                ? 'Con Supabase activo: la imagen se sube al bucket y solo se guarda la URL en la base de datos.'
                : 'Sin Supabase: la imagen se guarda como base64 en el navegador (modo local).'}
            </div>
            {imageError ? (
              <div className="mt-1 text-xs font-medium text-rose-700">{imageError}</div>
            ) : null}
          </Field>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-200/90 bg-gradient-to-r from-slate-50 to-white px-4 py-4 sm:px-6">
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
            <button
              type="button"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
              onClick={() => props.onClose()}
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={!canSubmit || busy}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-section-navy px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-950/25 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => {
                if (!canSubmit) return
                if (props.mode === 'edit' && props.initial) {
                  props.onSubmit({ ...props.initial, ...form })
                } else {
                  props.onSubmit(form)
                }
              }}
            >
              {busy ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Guardando…
                </>
              ) : (
                <>
                  <IconSave className="h-4 w-4 shrink-0 opacity-95" />
                  Guardar
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

