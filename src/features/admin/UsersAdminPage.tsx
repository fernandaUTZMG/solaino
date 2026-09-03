import { useCallback, useEffect, useMemo, useState } from 'react'
import { PaginationBar } from '../../ui/PaginationBar.tsx'
import { isAppRole, type AppRole, canManagerEditUserProfile, rolesAssignableByManager } from '../../lib/roles'
import { formatFechaHoraLocal } from '../../lib/formatDateTime'
import {
  fetchPendingPasswordRecoveries,
  markPasswordRecoveryDone,
  type PasswordRecoveryRow,
} from '../../lib/passwordRecoveryRepo'
import { adminSetUserPassword } from '../../lib/adminSetPassword'
import { adminCreateUser } from '../../lib/adminCreateUser'
import { adminDeleteUser } from '../../lib/adminUserLifecycle'
import {
  adminSyncAuthEmailForUsername,
  fetchProfilesAdmin,
  updateProfileRole,
  type ProfileAdminRow,
} from '../../lib/profilesAdminRepo'
import { getSupabase } from '../../lib/supabaseClient'
import {
  CatalogAddButton,
  CatalogPageHero,
  CatalogSearchField,
} from './catalogListUi'
import { catalogDeleteBtnClass, catalogEditBtnClass } from './catalogListUi'
import { IconPencil, IconPlus, IconRefresh, IconSave, IconTrash, IconX } from '../../ui/shellIcons'

type Props = {
  role: AppRole
  onChanged?: () => void
}

const ROLE_LABELS: Record<AppRole, string> = {
  user: 'Usuario',
  admin: 'Administrador (mayor)',
  encargado: 'Supervisor / encargado (Bodega)',
  disenadora: 'Diseñadora (Bodega)',
  programadora_maquinaria: 'Programadora maquinaria (Bodega)',
  operador_bodega: 'Operador taller — perfilado, armado, detallado',
}

function roleBadgeClass(role: string): string {
  const x = String(role).toLowerCase()
  if (x === 'admin') return 'bg-red-100 text-red-700'
  if (x === 'encargado') return 'bg-amber-100 text-amber-800'
  if (x === 'disenadora') return 'bg-fuchsia-100 text-fuchsia-800'
  if (x === 'programadora_maquinaria') return 'bg-indigo-100 text-indigo-800'
  if (x === 'operador_bodega') return 'bg-teal-100 text-teal-900'
  return 'bg-blue-100 text-blue-800'
}

export function UsersAdminPage(props: Props) {
  const managerRole = props.role
  const assignableRoles = useMemo(() => rolesAssignableByManager(managerRole), [managerRole])
  const [profiles, setProfiles] = useState<ProfileAdminRow[]>([])
  const [recoveries, setRecoveries] = useState<PasswordRecoveryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<ProfileAdminRow | null>(null)
  const [creating, setCreating] = useState(false)
  const [createUsername, setCreateUsername] = useState('')
  const [createRole, setCreateRole] = useState<AppRole>('user')
  const [createPassword, setCreatePassword] = useState('')
  const [createPasswordConfirm, setCreatePasswordConfirm] = useState('')
  const [createBusy, setCreateBusy] = useState(false)
  const [editUsername, setEditUsername] = useState('')
  const [editRole, setEditRole] = useState<AppRole>('user')
  const [saveBusy, setSaveBusy] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [editPassword, setEditPassword] = useState('')
  const [editPasswordConfirm, setEditPasswordConfirm] = useState('')
  const [pwdBusy, setPwdBusy] = useState(false)
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 12
  const [myUserId, setMyUserId] = useState<string | null>(null)
  const [lifecycleBusyId, setLifecycleBusyId] = useState<string | null>(null)

  useEffect(() => {
    void getSupabase()
      .auth.getSession()
      .then(({ data }) => setMyUserId(data.session?.user.id ?? null))
  }, [])

  const load = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const p = await fetchProfilesAdmin()
      setProfiles(p)
      setRecoveries(await fetchPendingPasswordRecoveries())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar')
      setProfiles([])
      setRecoveries([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filteredProfiles = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return profiles
    return profiles.filter(
      (u) =>
        (u.username ?? '').toLowerCase().includes(s) ||
        (u.email ?? '').toLowerCase().includes(s) ||
        String(u.role ?? '').toLowerCase().includes(s) ||
        u.id.toLowerCase().includes(s),
    )
  }, [profiles, q])

  useEffect(() => {
    queueMicrotask(() => setPage(1))
  }, [q])

  const totalPages = Math.max(1, Math.ceil(filteredProfiles.length / pageSize))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const paginatedProfiles = useMemo(() => {
    const start = (safePage - 1) * pageSize
    return filteredProfiles.slice(start, start + pageSize)
  }, [filteredProfiles, safePage])

  async function onMarkRecoveryDone(id: string) {
    try {
      await markPasswordRecoveryDone(id)
      await load()
      props.onChanged?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al marcar solicitud')
    }
  }

  function openEdit(u: ProfileAdminRow) {
    if (!canManagerEditUserProfile(managerRole, u.role)) {
      setError('No puedes editar cuentas de administrador.')
      return
    }
    setEditing(u)
    setEditUsername(u.username ?? '')
    setEditRole(isAppRole(u.role) ? u.role : 'user')
    setEditPassword('')
    setEditPasswordConfirm('')
    setSaveMsg(null)
    setError(null)
  }

  function openCreate() {
    setCreating(true)
    setCreateUsername('')
    setCreateRole(assignableRoles.includes('disenadora') ? 'disenadora' : assignableRoles[0] ?? 'user')
    setCreatePassword('')
    setCreatePasswordConfirm('')
    setSaveMsg(null)
    setError(null)
  }

  async function createNewUser() {
    setError(null)
    setSaveMsg(null)
    const u = createUsername.trim().toLowerCase()
    if (u.length < 3) {
      setError('El usuario debe tener al menos 3 caracteres.')
      return
    }
    if (createPassword.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.')
      return
    }
    if (createPassword !== createPasswordConfirm) {
      setError('Las contraseñas no coinciden.')
      return
    }
    if (!assignableRoles.includes(createRole)) {
      setError('No puedes asignar ese rol.')
      return
    }
    setCreateBusy(true)
    try {
      const res = await adminCreateUser({ username: u, password: createPassword, role: createRole })
      setSaveMsg(`Usuario creado: ${u} (${res.email}).`)
      await load()
      props.onChanged?.()
      setCreating(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear el usuario')
    } finally {
      setCreateBusy(false)
    }
  }

  async function saveEdit() {
    if (!editing) return
    if (!canManagerEditUserProfile(managerRole, editing.role)) {
      setError('No puedes editar cuentas de administrador.')
      return
    }
    if (!assignableRoles.includes(editRole)) {
      setError('No puedes asignar ese rol.')
      return
    }
    setSaveBusy(true)
    setSaveMsg(null)
    setError(null)
    try {
      const u = editUsername.trim().toLowerCase()
      if (u.length < 3) throw new Error('El usuario debe tener al menos 3 caracteres.')
      if (u !== (editing.username ?? '').toLowerCase()) {
        await adminSyncAuthEmailForUsername(editing.id, u)
      }
      if (editRole !== editing.role) {
        await updateProfileRole(editing.id, editRole)
      }
      setSaveMsg('Cambios guardados.')
      await load()
      props.onChanged?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar')
    } finally {
      setSaveBusy(false)
    }
  }

  async function onDeleteUser(u: ProfileAdminRow) {
    if (u.id === myUserId) return
    if (!canManagerEditUserProfile(managerRole, u.role)) {
      setError('No puedes eliminar cuentas de administrador.')
      return
    }
    const label = (u.username ?? u.email ?? u.id).trim()
    if (
      !window.confirm(
        `¿Eliminar definitivamente a «${label}»?\n\nSe borrará la cuenta en Authentication y su perfil. Esta acción no se puede deshacer.`,
      )
    ) {
      return
    }
    setLifecycleBusyId(u.id)
    setError(null)
    setSaveMsg(null)
    try {
      await adminDeleteUser(u.id)
      setSaveMsg(`Usuario eliminado: ${label}.`)
      if (editing?.id === u.id) setEditing(null)
      await load()
      props.onChanged?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo eliminar el usuario')
    } finally {
      setLifecycleBusyId(null)
    }
  }

  async function applyNewPassword() {
    if (!editing) return
    setError(null)
    setSaveMsg(null)
    const p = editPassword
    const p2 = editPasswordConfirm
    if (p.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.')
      return
    }
    if (p !== p2) {
      setError('Las contraseñas no coinciden.')
      return
    }
    if (
      !window.confirm(
        'Se guardará esta contraseña en el sistema. Asegúrate de comunicársela al usuario por un canal seguro (en persona, etc.). ¿Continuar?',
      )
    ) {
      return
    }
    setPwdBusy(true)
    try {
      const { loginEmail, warning } = await adminSetUserPassword(editing.id, p)
      setEditPassword('')
      setEditPasswordConfirm('')
      const udisp = editing.username?.trim() ? `«${editing.username.trim()}»` : 'su usuario'
      setSaveMsg(
        `Contraseña guardada en Auth. Para entrar: ${udisp} (sin @) o el correo ${loginEmail}. Comunícale la clave por un canal privado.` +
          (warning ? ` Aviso: ${warning}` : ''),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar la contraseña')
    } finally {
      setPwdBusy(false)
    }
  }

  return (
    <section className="space-y-4">
      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 shadow-sm">
          {error}
        </div>
      ) : null}
      {saveMsg && !editing && !creating ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-950 shadow-sm">
          {saveMsg}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-3xl border border-slate-200/70 bg-white shadow-[0_20px_50px_-24px_rgba(4,26,56,0.22),0_1px_0_rgba(255,255,255,0.8)_inset] ring-1 ring-slate-900/[0.03]">
        <CatalogPageHero
          accent="sky"
          title="Usuarios"
          subtitle="Cuentas de acceso, roles y solicitudes de recuperación de contraseña."
          toolbar={
            <>
              <CatalogSearchField
                value={q}
                onChange={setQ}
                placeholder="Buscar por usuario, correo, rol o ID…"
              />
              <CatalogAddButton label="Nuevo usuario" onClick={openCreate} />
              <button
                type="button"
                disabled={loading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200/90 bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-700 shadow-sm transition hover:border-sky-300/70 hover:bg-sky-50/60 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                onClick={() => void load()}
              >
                <IconRefresh className={`h-4 w-4 shrink-0 opacity-95 ${loading ? 'animate-spin' : ''}`} aria-hidden />
                Recargar
              </button>
            </>
          }
        />

        <div className="border-b border-slate-100 bg-gradient-to-r from-amber-50/50 via-white to-amber-50/30 px-4 py-4 sm:px-6">
          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-amber-900/80">Recuperación de contraseña</div>
          {loading ? (
            <p className="mt-2 text-[13px] text-amber-900/70">Cargando solicitudes…</p>
          ) : recoveries.length === 0 ? (
            <p className="mt-2 text-[13px] text-slate-500">No hay solicitudes de recuperación pendientes.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {recoveries.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-col gap-2 rounded-2xl border border-amber-200/70 bg-white/90 px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <span className="text-[13px] font-semibold text-slate-900">{r.username}</span>
                    <span className="mt-0.5 block text-[12px] tabular-nums text-slate-500">
                      {formatFechaHoraLocal(r.created_at)}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 rounded-xl bg-amber-600 px-4 py-2 text-[12px] font-semibold text-white shadow-sm transition hover:bg-amber-500"
                    onClick={() => void onMarkRecoveryDone(r.id)}
                  >
                    Marcar atendida
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="p-4 sm:p-5 md:p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200/90 bg-white py-16 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
              <div
                className="h-9 w-9 animate-spin rounded-full border-2 border-slate-200 border-t-sky-600 border-t-transparent"
                aria-hidden
              />
              <p className="text-[13px] font-medium text-slate-500">Cargando usuarios…</p>
            </div>
          ) : filteredProfiles.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-14 text-center">
              <p className="text-[14px] font-medium text-slate-600">
                {profiles.length === 0
                  ? 'No hay usuarios registrados.'
                  : 'No se encontraron usuarios con ese criterio.'}
              </p>
              <p className="mt-1 text-[12px] text-slate-400">Prueba otra búsqueda o usa «Nuevo usuario».</p>
            </div>
          ) : (
            <>
              <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
                <div className="h-1 bg-gradient-to-r from-sky-500/90 via-sky-400/50 to-transparent" aria-hidden />
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] border-collapse text-left">
                    <thead>
                      <tr className="border-b border-slate-200/90 bg-gradient-to-b from-slate-100/95 to-slate-50/90">
                        <th className="px-4 py-3.5 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 sm:px-5 md:w-[120px]">
                          ID
                        </th>
                        <th className="px-4 py-3.5 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 sm:px-5">
                          Usuario
                        </th>
                        <th className="px-4 py-3.5 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 sm:px-5">
                          Correo
                        </th>
                        <th className="px-4 py-3.5 text-center text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 sm:px-5 md:w-[140px]">
                          Rol
                        </th>
                        <th className="px-4 py-3.5 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 sm:px-5 md:w-[160px]">
                          Alta
                        </th>
                        <th className="w-[1%] whitespace-nowrap px-3 py-3.5 text-right text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500 sm:px-4">
                          Acciones
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {paginatedProfiles.map((u, i) => {
                        const isSelf = u.id === myUserId
                        const canEdit = canManagerEditUserProfile(managerRole, u.role)
                        const busy = lifecycleBusyId === u.id
                        return (
                        <tr
                          key={u.id}
                          className={[
                            'group transition-colors hover:bg-slate-50/95',
                            i % 2 === 1 ? 'bg-slate-50/35' : 'bg-white',
                          ].join(' ')}
                        >
                          <td className="px-4 py-3.5 font-mono text-[11px] text-slate-500 sm:px-5" title={u.id}>
                            <span className="rounded-lg bg-slate-100/90 px-2 py-1 ring-1 ring-slate-200/80">
                              {u.id.length > 12 ? `${u.id.slice(0, 8)}…` : u.id}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-[14px] font-semibold text-slate-900 sm:px-5">
                            {u.username ?? '—'}
                          </td>
                          <td className="max-w-[220px] truncate px-4 py-3.5 text-[13px] font-bold text-slate-900 sm:max-w-none sm:px-5">
                            {u.email ?? '—'}
                          </td>
                          <td className="px-4 py-3.5 text-center sm:px-5">
                            <span
                              className={`inline-flex rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${roleBadgeClass(u.role)}`}
                            >
                              {String(u.role).replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-[13px] font-bold tabular-nums text-slate-900 sm:px-5">
                            {formatFechaHoraLocal(u.created_at)}
                          </td>
                          <td className="whitespace-nowrap px-2 py-2 text-right sm:px-3">
                            <div className="flex flex-wrap items-center justify-end gap-1">
                              <button
                                type="button"
                                title={canEdit ? 'Editar' : 'Solo el administrador puede editar esta cuenta'}
                                disabled={!canEdit}
                                className={catalogEditBtnClass}
                                onClick={() => openEdit(u)}
                              >
                                <IconPencil className="h-4 w-4" aria-hidden />
                              </button>
                              <button
                                type="button"
                                title={canEdit ? 'Eliminar usuario' : 'Solo el administrador puede eliminar esta cuenta'}
                                disabled={isSelf || busy || !canEdit}
                                className={catalogDeleteBtnClass}
                                onClick={() => void onDeleteUser(u)}
                              >
                                <IconTrash className="h-4 w-4" aria-hidden />
                              </button>
                            </div>
                          </td>
                        </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-2.5 text-center text-[11px] font-medium uppercase tracking-wide text-slate-400 sm:text-left sm:px-5">
                  Mostrando {paginatedProfiles.length} de {filteredProfiles.length}{' '}
                  {filteredProfiles.length === 1 ? 'usuario' : 'usuarios'}
                </div>
              </div>

              <div className="mt-4">
                <PaginationBar
                  page={safePage}
                  totalPages={totalPages}
                  totalItems={filteredProfiles.length}
                  pageSize={pageSize}
                  onPageChange={setPage}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {editing ? (
        <div className="fixed inset-0 z-50 grid place-items-center p-4 sm:p-6">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-[2px] transition hover:bg-slate-900/65"
            aria-label="Cerrar"
            onClick={() => setEditing(null)}
          />
          <div className="relative flex w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-blue-950/25 bg-white shadow-2xl shadow-blue-950/15 ring-1 ring-blue-950/10">
            <div className="relative overflow-hidden border-b border-blue-950/25 bg-section-navy px-4 py-4 text-white sm:px-6 sm:py-5">
              <div className="pointer-events-none absolute -right-8 -top-12 h-36 w-36 rounded-full bg-blue-400/15 blur-2xl" />
              <div className="relative flex items-start justify-between gap-4">
                <div className="flex min-w-0 flex-1 items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20 shadow-lg">
                    <IconPencil className="h-6 w-6 text-blue-100" />
                  </div>
                  <div className="min-w-0 pt-0.5">
                    <div className="m-0 text-lg font-bold tracking-tight text-white sm:text-xl">Editar usuario</div>
                    <p className="mt-1 text-sm leading-snug text-blue-100/88">
                      El inicio de sesión usa <span className="font-mono">usuario@solaino.local</span>. Al cambiar el
                      nombre se actualiza también en Authentication.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition hover:bg-white/20"
                  onClick={() => setEditing(null)}
                  aria-label="Cerrar"
                >
                  <IconX className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="max-h-[min(74vh,620px)] overflow-y-auto bg-gradient-to-b from-slate-50 via-white to-slate-50/90 p-4 sm:p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Nombre de usuario</span>
                  <input
                    value={editUsername}
                    onChange={(e) => setEditUsername(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-950/45 focus:ring-2 focus:ring-section-navy/20"
                    autoComplete="off"
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Rol</span>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value as AppRole)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-950/45 focus:ring-2 focus:ring-section-navy/20"
                  >
                    {assignableRoles.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
                <div className="text-sm font-bold text-slate-900">Nueva contraseña</div>
                <p className="mt-1 text-xs leading-snug text-slate-500">
                  Se guarda en Supabase Auth. Notifica al usuario la contraseña por un medio privado (no queda
                  registrada en el historial de la app).
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Contraseña nueva</span>
                    <input
                      type="password"
                      value={editPassword}
                      onChange={(e) => setEditPassword(e.target.value)}
                      autoComplete="new-password"
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-950/45 focus:ring-2 focus:ring-section-navy/20"
                      placeholder="Mínimo 6 caracteres"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Confirmar contraseña</span>
                    <input
                      type="password"
                      value={editPasswordConfirm}
                      onChange={(e) => setEditPasswordConfirm(e.target.value)}
                      autoComplete="new-password"
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-950/45 focus:ring-2 focus:ring-section-navy/20"
                    />
                  </label>
                </div>
                <button
                  type="button"
                  disabled={pwdBusy || editPassword.length < 6}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-section-navy px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => void applyNewPassword()}
                >
                  {pwdBusy ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Aplicando…
                    </>
                  ) : (
                    <>
                      <IconSave className="h-4 w-4 shrink-0 opacity-95" />
                      Establecer contraseña
                    </>
                  )}
                </button>
              </div>

              {saveMsg ? <p className="mt-4 text-sm font-semibold text-emerald-700">{saveMsg}</p> : null}
            </div>

            <div className="border-t border-slate-200/90 bg-gradient-to-r from-slate-50 to-white px-4 py-4 sm:px-6">
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
                  onClick={() => setEditing(null)}
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  disabled={saveBusy}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-section-navy px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-950/25 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => void saveEdit()}
                >
                  {saveBusy ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Guardando…
                    </>
                  ) : (
                    <>
                      <IconSave className="h-4 w-4 shrink-0 opacity-95" />
                      Guardar usuario y rol
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {creating ? (
        <div className="fixed inset-0 z-50 grid place-items-center p-4 sm:p-6">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-[2px] transition hover:bg-slate-900/65"
            aria-label="Cerrar"
            onClick={() => setCreating(false)}
          />
          <div className="relative flex w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-blue-950/25 bg-white shadow-2xl shadow-blue-950/15 ring-1 ring-blue-950/10">
            <div className="relative overflow-hidden border-b border-blue-950/25 bg-section-navy px-4 py-4 text-white sm:px-6 sm:py-5">
              <div className="pointer-events-none absolute -right-8 -top-12 h-36 w-36 rounded-full bg-blue-400/15 blur-2xl" />
              <div className="relative flex items-start justify-between gap-4">
                <div className="flex min-w-0 flex-1 items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20 shadow-lg">
                    <IconPlus className="h-6 w-6 text-blue-100" />
                  </div>
                  <div className="min-w-0 pt-0.5">
                    <div className="m-0 text-lg font-bold tracking-tight text-white sm:text-xl">Nuevo usuario</div>
                    <p className="mt-1 text-sm leading-snug text-blue-100/88">
                      Se crea un correo interno <span className="font-mono">usuario@solaino.local</span> en Supabase Auth.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition hover:bg-white/20"
                  onClick={() => setCreating(false)}
                  aria-label="Cerrar"
                >
                  <IconX className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="max-h-[min(74vh,620px)] overflow-y-auto bg-gradient-to-b from-slate-50 via-white to-slate-50/90 p-4 sm:p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Nombre de usuario</span>
                  <input
                    value={createUsername}
                    onChange={(e) => setCreateUsername(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-950/45 focus:ring-2 focus:ring-section-navy/20"
                    autoComplete="off"
                    placeholder="Ej: juan"
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Tipo</span>
                  <select
                    value={createRole}
                    onChange={(e) => setCreateRole(e.target.value as AppRole)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-950/45 focus:ring-2 focus:ring-section-navy/20"
                  >
                    {assignableRoles.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
                <div className="text-sm font-bold text-slate-900">Contraseña</div>
                <p className="mt-1 text-xs leading-snug text-slate-500">Mínimo 6 caracteres. Comunícala al usuario por un medio privado.</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Contraseña</span>
                    <input
                      type="password"
                      value={createPassword}
                      onChange={(e) => setCreatePassword(e.target.value)}
                      autoComplete="new-password"
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-950/45 focus:ring-2 focus:ring-section-navy/20"
                      placeholder="Mínimo 6 caracteres"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Confirmar contraseña</span>
                    <input
                      type="password"
                      value={createPasswordConfirm}
                      onChange={(e) => setCreatePasswordConfirm(e.target.value)}
                      autoComplete="new-password"
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-950/45 focus:ring-2 focus:ring-section-navy/20"
                    />
                  </label>
                </div>
              </div>

              {saveMsg ? <p className="mt-4 text-sm font-semibold text-emerald-700">{saveMsg}</p> : null}
            </div>

            <div className="border-t border-slate-200/90 bg-gradient-to-r from-slate-50 to-white px-4 py-4 sm:px-6">
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
                  onClick={() => setCreating(false)}
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  disabled={createBusy || createUsername.trim().length < 3 || createPassword.length < 6}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-section-navy px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-950/25 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => void createNewUser()}
                >
                  {createBusy ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Creando…
                    </>
                  ) : (
                    <>
                      <IconSave className="h-4 w-4 shrink-0 opacity-95" />
                      Crear usuario
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
