import { useMemo, useState } from 'react'
import { ProduccionProgressDetail } from './ProduccionSemanalTaskList'
import {
  isProduccionNoteLine,
  manualBadge,
  taskProgressBadge,
  type ProduccionProjectLive,
  type ProduccionProjectPick,
  type ProduccionSemanalTask,
  type ProduccionTaskLane,
  type ProduccionTaskManual,
} from '../../lib/bodegaProduccionSemanalTasks'

const MANUALS: Array<{ id: ProduccionTaskManual; label: string }> = [
  { id: 'pendiente', label: 'Pendiente' },
  { id: 'en_proceso', label: 'En proceso' },
  { id: 'lista', label: 'Lista' },
]

export function ProduccionSemanalTaskEditor(props: {
  tasks: ProduccionSemanalTask[]
  lane: ProduccionTaskLane
  projects: ProduccionProjectPick[]
  liveByProject: Map<string, ProduccionProjectLive>
  onChange: (tasks: ProduccionSemanalTask[]) => void
}) {
  const rows = props.tasks
    .map((task, index) => ({ task, index }))
    .filter((row) => !isProduccionNoteLine(row.task.text))
  if (rows.length === 0) return null
  return (
    <div className="produccion-semanal-no-print mt-2 space-y-2">
      {rows.map(({ task, index }) => (
        <TaskRow
          key={`${index}-${task.text}`}
          task={task}
          lane={props.lane}
          projects={props.projects}
          liveByProject={props.liveByProject}
          onChange={(next) => {
            const tasks = props.tasks.slice()
            tasks[index] = next
            props.onChange(tasks)
          }}
        />
      ))}
    </div>
  )
}

function TaskRow(props: {
  task: ProduccionSemanalTask
  lane: ProduccionTaskLane
  projects: ProduccionProjectPick[]
  liveByProject: Map<string, ProduccionProjectLive>
  onChange: (task: ProduccionSemanalTask) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const linked = props.projects.find((project) => project.id === props.task.projectId)
    ?? (props.task.projectId ? props.liveByProject.get(props.task.projectId) : undefined)
  const badge = taskProgressBadge(props.task, props.lane, props.liveByProject)
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 2) return []
    return props.projects
      .filter((project) => `${project.folio} ${project.nombre}`.toLowerCase().includes(q))
      .slice(0, 6)
  }, [props.projects, query])

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
      <p className="text-[11px] font-semibold leading-snug text-slate-800">{props.task.text}</p>
      {props.task.projectId ? (
        <div className="mt-1">
          <div className="flex flex-wrap items-center gap-1">
            <span className="font-mono text-[10px] font-bold text-slate-700">{linked?.folio || 'Proyecto'}</span>
            <button
              type="button"
              className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-700"
              onClick={() => props.onChange({ ...props.task, projectId: null, manual: null })}
            >
              Quitar
            </button>
          </div>
          {badge ? <ProduccionProgressDetail badge={badge} variant="edit" /> : null}
        </div>
      ) : (
        <div className="mt-1 space-y-1">
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            placeholder="Vincular folio o nombre"
            className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-800"
          />
          {open && matches.length > 0 ? (
            <ul className="max-h-28 overflow-auto rounded border border-slate-200 bg-white">
              {matches.map((project) => (
                <li key={project.id}>
                  <button
                    type="button"
                    className="block w-full px-2 py-1 text-left text-[11px] hover:bg-sky-50"
                    onClick={() => {
                      props.onChange({ ...props.task, projectId: project.id, manual: null })
                      setQuery('')
                      setOpen(false)
                    }}
                  >
                    <span className="font-mono font-bold">{project.folio}</span>
                    <span className="ml-1 text-slate-600">{project.nombre}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-wrap gap-1">
            {MANUALS.map((item) => {
              const active = props.task.manual === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  className={[
                    'rounded px-1.5 py-0.5 text-[10px] font-bold',
                    active ? 'bg-slate-800 text-white' : 'border border-slate-300 bg-white text-slate-700',
                  ].join(' ')}
                  onClick={() =>
                    props.onChange({
                      ...props.task,
                      manual: active ? null : item.id,
                    })
                  }
                >
                  {item.label}
                </button>
              )
            })}
          </div>
          {manualBadge(props.task.manual) ? null : (
            <p className="text-[10px] text-slate-500">Sin marcar</p>
          )}
        </div>
      )}
      {props.lane === 'armado' ? <ArmadoHelpers task={props.task} onChange={props.onChange} /> : null}
    </div>
  )
}

function ArmadoHelpers(props: {
  task: ProduccionSemanalTask
  onChange: (task: ProduccionSemanalTask) => void
}) {
  const [name, setName] = useState('')
  function add() {
    const next = name.trim().replace(/\s+/g, ' ').slice(0, 40)
    if (!next || props.task.helpers.length >= 8) return
    if (props.task.helpers.some((item) => item.toLowerCase() === next.toLowerCase())) {
      setName('')
      return
    }
    props.onChange({ ...props.task, helpers: [...props.task.helpers, next] })
    setName('')
  }
  return (
    <div className="mt-1 space-y-1">
      <p className="text-[10px] font-semibold text-slate-600">Quién ayudó en el armado</p>
      <div className="flex gap-1">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            e.preventDefault()
            add()
          }}
          placeholder="Nombre"
          className="min-w-0 flex-1 rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-800"
        />
        <button
          type="button"
          className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-700"
          onClick={add}
        >
          Agregar
        </button>
      </div>
      {props.task.helpers.length > 0 ? (
        <ul className="flex flex-wrap gap-1">
          {props.task.helpers.map((helper) => (
            <li key={helper} className="flex items-center gap-1 rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-800">
              {helper}
              <button
                type="button"
                className="text-slate-500"
                aria-label={`Quitar a ${helper}`}
                onClick={() =>
                  props.onChange({
                    ...props.task,
                    helpers: props.task.helpers.filter((item) => item !== helper),
                  })
                }
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[10px] text-slate-500">Nadie anotado</p>
      )}
    </div>
  )
}

