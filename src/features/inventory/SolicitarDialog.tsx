import { useEffect, useMemo, useState } from 'react'
import type { InventoryItem } from '../../types/inventory'
import { insertSolicitud } from '../../lib/solicitudesRepo'
import {
  IconEye,
  IconHash,
  IconMessage,
  IconNavInventory,
  IconNavSolicitudes,
  IconSend,
  IconX,
} from '../../ui/shellIcons'

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

export function SolicitarDialog(props: {
  open: boolean
  item: InventoryItem | null
  onClose: () => void
  onCreated?: () => void
}) {
  const [cantidad, setCantidad] = useState<number>(1)
  const [nota, setNota] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!props.open || !props.item) return
    setCantidad(1)
    setNota('')
    setError(null)
  }, [props.open, props.item?.id])

  const canSubmit = useMemo(() => Boolean(props.item) && cantidad > 0 && Number.isFinite(cantidad), [props.item, cantidad])

  if (!props.open || !props.item) return null

  async function onSubmit() {
    if (!props.item || !canSubmit) return
    setError(null)
    setBusy(true)
    try {
      await insertSolicitud({ productoId: props.item.id, cantidad, nota })
      props.onCreated?.()
      props.onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear solicitud')
    } finally {
      setBusy(false)
    }
  }

  const item = props.item

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
        aria-labelledby="solicitar-dialog-title"
        className="relative flex w-full max-w-2xl max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-3xl border border-blue-950/25 bg-white shadow-2xl shadow-blue-950/15 ring-1 ring-blue-950/10 sm:max-h-[calc(100vh-3rem)]"
      >
        <div className="relative overflow-hidden border-b border-blue-950/25 bg-section-navy px-4 py-4 text-white sm:px-6 sm:py-5">
          <div className="pointer-events-none absolute -right-8 -top-12 h-36 w-36 rounded-full bg-blue-400/15 blur-2xl" />
          <div className="relative flex items-start justify-between gap-4">
            <div className="flex min-w-0 flex-1 flex-col gap-4">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20 shadow-lg">
                  <IconNavSolicitudes className="h-6 w-6 text-blue-100" />
                </div>
                <div className="min-w-0 pt-0.5">
                  <h2 id="solicitar-dialog-title" className="text-lg font-bold tracking-tight sm:text-xl">
                    Solicitar producto
                  </h2>
                  <p className="mt-1 text-sm leading-snug text-blue-100/88">
                    Tu solicitud queda registrada para que el administrador la revise y surta.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 sm:px-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15">
                  <IconNavInventory className="h-5 w-5 text-blue-100" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-xs font-medium text-blue-100/90">{item.codigo}</p>
                  <p className="truncate text-sm font-semibold text-white">{item.nombre}</p>
                </div>
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
          <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
            {error ? (
              <div
                role="alert"
                className="flex gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 sm:col-span-2"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-sm font-bold text-rose-700">
                  !
                </span>
                <span>{error}</span>
              </div>
            ) : null}

            <SectionTitle title="Detalle de la solicitud" icon={IconNavSolicitudes} />

            <Field label="Cantidad solicitada" icon={<IconHash className="h-3.5 w-3.5 opacity-80" />}>
              <TextInput
                type="number"
                inputMode="decimal"
                min={0}
                step="1"
                value={cantidad}
                onChange={(e) => setCantidad(Number(e.target.value))}
              />
            </Field>

            <div className="sm:col-span-2">
              <Field label="Nota (opcional)" icon={<IconMessage className="h-3.5 w-3.5 opacity-80" />}>
                <TextArea
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                  placeholder="¿Para qué se usará? ¿Quién la solicita?"
                />
              </Field>
            </div>

            <SectionTitle title="Vista previa" icon={IconEye} className="mt-1" />

            <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:col-span-2">
              <p className="text-xs leading-snug text-slate-500">
                Visible para ti y el administrador.
              </p>
              <dl className="mt-3 space-y-2 text-sm text-slate-800">
                <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                  <dt className="text-slate-500">Cantidad</dt>
                  <dd className="font-semibold text-slate-900">{cantidad}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Nota</dt>
                  <dd className="mt-0.5 font-normal leading-relaxed text-slate-800">
                    {nota.trim() ? (
                      <span className="block whitespace-pre-wrap break-words">{nota}</span>
                    ) : (
                      <span className="text-slate-400">— (sin nota)</span>
                    )}
                  </dd>
                </div>
              </dl>
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
              onClick={() => void onSubmit()}
            >
              {busy ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Enviando…
                </>
              ) : (
                <>
                  <IconSend className="h-4 w-4 shrink-0 opacity-95" />
                  Solicitar
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
