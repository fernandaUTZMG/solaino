import { useEffect, useMemo, useState } from 'react'
import type { InventoryItem } from '../../types/inventory'
import { isSupabaseConfigured } from '../../env'
import { fetchProductoByCodigo } from '../../lib/productosRepo'
import { formatRegistroAjusteUserMessage, registrarAjuste } from '../../lib/ajustesRepo'
import { IconHash, IconNavInventory, IconSave, IconX } from '../../ui/shellIcons'
import { canManageInventory, type AppRole } from '../../lib/roles'

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

export function AjusteDialog(props: {
  open: boolean
  onClose: () => void
  onSaved?: () => void
  role?: AppRole
  local?: {
    items: InventoryItem[]
    setItems: React.Dispatch<React.SetStateAction<InventoryItem[]>>
  } | null
}) {
  const isAdmin = canManageInventory(props.role ?? 'user')
  const [codigo, setCodigo] = useState('')
  const [found, setFound] = useState<InventoryItem | null>(null)
  const [stockContado, setStockContado] = useState<number>(0)
  const [motivo, setMotivo] = useState('Corrección')
  const [nota, setNota] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!props.open) return
    setCodigo('')
    setFound(null)
    setStockContado(0)
    setMotivo('Corrección')
    setNota('')
    setBusy(false)
    setError(null)
  }, [props.open])

  const canBuscar = useMemo(() => codigo.trim().length > 0 && !busy, [codigo, busy])
  const canGuardar = useMemo(() => {
    if (!isAdmin) return false
    if (!found) return false
    return Number.isFinite(stockContado) && stockContado >= 0 && stockContado === Math.floor(stockContado) && !busy
  }, [isAdmin, found, stockContado, busy])

  async function buscar() {
    if (!canBuscar) return
    setBusy(true)
    setError(null)
    try {
      const item = await fetchProductoByCodigo(codigo.trim())
      if (!item) {
        setFound(null)
        setError('Producto no encontrado. Verifica el código.')
        return
      }
      setFound(item)
      setStockContado(Math.max(0, Math.floor(item.stockActual)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo buscar el producto.')
    } finally {
      setBusy(false)
    }
  }

  async function guardar() {
    if (!canGuardar || !found) return
    setBusy(true)
    setError(null)
    try {
      if (!isSupabaseConfigured()) {
        const local = props.local
        if (!local) throw new Error('Modo local no está disponible en este contexto.')
        local.setItems((prev) =>
          prev.map((p) => (p.id === found.id ? { ...p, stockActual: stockContado } : p)),
        )
      } else {
        await registrarAjuste({
          codigo: found.codigo,
          stockContado,
          motivo,
          nota: nota.trim() ? nota.trim() : null,
        })
      }
      props.onSaved?.()
      props.onClose()
    } catch (e) {
      setError(formatRegistroAjusteUserMessage(e))
    } finally {
      setBusy(false)
    }
  }

  if (!props.open) return null

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
        aria-labelledby="ajuste-dialog-title"
        className="relative flex w-full max-w-xl max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-3xl border border-blue-950/25 bg-white shadow-2xl shadow-blue-950/15 ring-1 ring-blue-950/10 sm:max-h-[calc(100vh-3rem)]"
      >
        <div className="relative overflow-hidden border-b border-blue-950/25 bg-section-navy px-4 py-4 text-white sm:px-6 sm:py-5">
          <div className="pointer-events-none absolute -right-8 -top-12 h-36 w-36 rounded-full bg-blue-400/15 blur-2xl" />
          <div className="relative flex items-start justify-between gap-4">
            <div className="flex min-w-0 flex-1 items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20 shadow-lg">
                <IconNavInventory className="h-6 w-6 text-blue-100" />
              </div>
              <div className="min-w-0 pt-0.5">
                <h2 id="ajuste-dialog-title" className="text-lg font-bold tracking-tight sm:text-xl">
                  Ajuste de inventario
                </h2>
                <p className="mt-1 text-sm leading-snug text-blue-100/88">
                  Corrige el stock de un producto (conteo o error). Se registra un movimiento tipo{' '}
                  <span className="font-semibold text-white">Ajuste</span>.
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

        <div className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-slate-50 via-white to-slate-50/90 p-4 sm:p-6">
          <div className="grid gap-4">
            {!isAdmin ? (
              <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                Solo administradores pueden hacer ajustes.
              </div>
            ) : null}

            {error ? (
              <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                {error}
              </div>
            ) : null}

            <Field label="Código del producto" icon={<IconHash className="h-3.5 w-3.5 opacity-80" />}>
              <TextInput
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                placeholder="Ej. SOL-00280"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void buscar()
                }}
              />
            </Field>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={!canBuscar}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-section-navy px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => void buscar()}
              >
                Buscar
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
                onClick={() => {
                  setCodigo('')
                  setFound(null)
                  setError(null)
                }}
              >
                Otro código
              </button>
            </div>

            {found ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Producto</div>
                <div className="mt-1 text-base font-bold text-slate-900">
                  {found.codigo} · {found.nombre}
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  Stock actual: <span className="font-semibold text-slate-900">{found.stockActual}</span>
                </div>

                {found.tieneSerie ? (
                  <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-[12px] leading-snug text-amber-950">
                    Este producto usa <span className="font-semibold">control por serie</span>. Recomendado: corregir por entradas/salidas de series.
                  </p>
                ) : null}

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Field label="Stock contado (nuevo)">
                    <TextInput
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      value={stockContado}
                      onChange={(e) => {
                        const n = Number(e.target.value)
                        setStockContado(Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0)
                      }}
                    />
                  </Field>
                  <Field label="Motivo">
                    <TextInput value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Corrección" />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="Nota (opcional)">
                      <TextInput value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Detalle del ajuste…" />
                    </Field>
                  </div>
                </div>

                <div className="mt-4">
                  <button
                    type="button"
                    disabled={!canGuardar}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-section-navy px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-950/25 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => void guardar()}
                  >
                    <IconSave className="h-4 w-4 shrink-0 opacity-95" />
                    Guardar ajuste
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

