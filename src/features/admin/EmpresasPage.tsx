import { useCallback, useEffect, useMemo, useState } from 'react'
import { getSupabase } from '../../lib/supabaseClient'
import { canAccessBodega, canManageBodegaLikeAdmin, type AppRole } from '../../lib/roles'
import {
  CatalogAddButton,
  CatalogDataTable,
  type CatalogAdminRowActions,
  CatalogPageHero,
  CatalogSearchField,
} from './catalogListUi'

type EmpresaRow = { id: string; nombre: string; created_at: string }

function normalizeNombre(x: string): string {
  return x.trim().replace(/\s+/g, ' ').toUpperCase()
}

type NameModal = null | { mode: 'create' } | { mode: 'edit'; row: EmpresaRow }

export function EmpresasPage(props: { role: AppRole }) {
  if (!canAccessBodega(props.role)) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 shadow-sm">
        No tienes acceso.
      </div>
    )
  }

  const canEditCatalog = canManageBodegaLikeAdmin(props.role)
  const [rows, setRows] = useState<EmpresaRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [nameModal, setNameModal] = useState<NameModal>(null)
  const [draftNombre, setDraftNombre] = useState('')
  const [formBusy, setFormBusy] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<EmpresaRow | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const sb = getSupabase()
      const { data, error } = await sb.from('empresas').select('id,nombre,created_at').order('nombre')
      if (error) throw error
      setRows(((data as EmpresaRow[] | null) ?? []).filter((r) => r && r.id && r.nombre))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar empresas')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const s = q.trim().toUpperCase()
    if (!s) return rows
    return rows.filter((r) => r.nombre.toUpperCase().includes(s))
  }, [rows, q])

  const emptyMessage = useMemo(() => {
    if (q.trim()) return 'Ningún resultado coincide con tu búsqueda.'
    return 'Aún no hay empresas en el catálogo.'
  }, [q])

  const adminRowActions = useMemo((): CatalogAdminRowActions | null => {
    if (!canEditCatalog) return null
    return {
      onEdit: (row) => {
        setNameModal({ mode: 'edit', row: row as EmpresaRow })
        setDraftNombre(row.nombre)
      },
      onDelete: (row) => setDeleteTarget(row as EmpresaRow),
      pendingDeleteId,
    }
  }, [canEditCatalog, pendingDeleteId])

  function openCreateModal() {
    setNameModal({ mode: 'create' })
    setDraftNombre('')
  }

  async function saveNameModal() {
    if (!canEditCatalog || !nameModal) return
    const nombre = normalizeNombre(draftNombre)
    if (nombre.length < 2) {
      setError('Escribe un nombre válido (mín. 2 caracteres).')
      return
    }
    setFormBusy(true)
    setError(null)
    try {
      const sb = getSupabase()
      if (nameModal.mode === 'create') {
        const { error } = await sb.from('empresas').insert({ nombre })
        if (error) throw error
      } else {
        const { error } = await sb.from('empresas').update({ nombre }).eq('id', nameModal.row.id)
        if (error) throw error
      }
      setNameModal(null)
      setDraftNombre('')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar')
    } finally {
      setFormBusy(false)
    }
  }

  async function confirmDelete() {
    if (!canEditCatalog || !deleteTarget) return
    setPendingDeleteId(deleteTarget.id)
    setError(null)
    try {
      const sb = getSupabase()
      const { error } = await sb.from('empresas').delete().eq('id', deleteTarget.id)
      if (error) throw error
      setDeleteTarget(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo eliminar')
    } finally {
      setPendingDeleteId(null)
    }
  }

  const modalTitle = nameModal?.mode === 'edit' ? 'Editar empresa' : 'Nueva empresa'

  return (
    <section className="space-y-4">
      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 shadow-sm">
          {error}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-3xl border border-slate-200/70 bg-white shadow-[0_20px_50px_-24px_rgba(4,26,56,0.22),0_1px_0_rgba(255,255,255,0.8)_inset] ring-1 ring-slate-900/[0.03]">
        <CatalogPageHero
          accent="amber"
          title="Empresas"
          subtitle="Clientes corporativos usados en órdenes de compra y proyectos de bodega."
          toolbar={
            <>
              <CatalogSearchField value={q} onChange={setQ} placeholder="Buscar por nombre…" />
              {canEditCatalog ? <CatalogAddButton label="Nueva empresa" onClick={openCreateModal} /> : null}
            </>
          }
        />

        <div className="p-4 sm:p-5 md:p-6">
          <CatalogDataTable
            accent="amber"
            rows={filtered}
            loading={loading}
            emptyMessage={emptyMessage}
            adminRowActions={adminRowActions}
          />
        </div>
      </div>

      {nameModal ? (
        <div className="fixed inset-0 z-50 grid place-items-center p-4 sm:p-6">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-[2px] transition hover:bg-slate-900/65"
            aria-label="Cerrar"
            onClick={() => !formBusy && setNameModal(null)}
          />
          <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-blue-950/25 bg-white shadow-2xl shadow-blue-950/15 ring-1 ring-blue-950/10">
            <div className="border-b border-blue-950/25 bg-section-navy px-4 py-4 text-white sm:px-6 sm:py-5">
              <div className="text-lg font-bold tracking-tight sm:text-xl">{modalTitle}</div>
              <p className="mt-1 text-sm text-blue-100/88">Se guardará en mayúsculas (nombre único en el catálogo).</p>
            </div>
            <div className="p-4 sm:p-6">
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Nombre</span>
                <input
                  value={draftNombre}
                  onChange={(e) => setDraftNombre(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-950/45 focus:ring-2 focus:ring-section-navy/20"
                  placeholder="Ej: JABIL"
                />
              </label>
            </div>
            <div className="border-t border-slate-200/90 bg-gradient-to-r from-slate-50 to-white px-4 py-4 sm:px-6">
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
                <button
                  type="button"
                  disabled={formBusy}
                  className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
                  onClick={() => setNameModal(null)}
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  disabled={formBusy}
                  className="inline-flex items-center justify-center rounded-xl bg-section-navy px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-950/25 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => void saveNameModal()}
                >
                  {formBusy ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="fixed inset-0 z-[60] grid place-items-center p-4 sm:p-6">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/55 backdrop-blur-[2px]"
            aria-label="Cerrar"
            onClick={() => !pendingDeleteId && setDeleteTarget(null)}
          />
          <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6">
            <div className="text-lg font-bold text-slate-900">¿Eliminar empresa?</div>
            <p className="mt-2 text-[13px] leading-relaxed text-slate-600">
              Se eliminará <span className="font-semibold text-slate-900">{deleteTarget.nombre}</span> del catálogo.
              Las órdenes de compra que la referenciaban quedarán sin empresa vinculada.
            </p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
              <button
                type="button"
                disabled={pendingDeleteId != null}
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
                onClick={() => setDeleteTarget(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={pendingDeleteId != null}
                className="inline-flex items-center justify-center rounded-xl border border-rose-200 bg-rose-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-60"
                onClick={() => void confirmDelete()}
              >
                {pendingDeleteId ? 'Eliminando…' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
