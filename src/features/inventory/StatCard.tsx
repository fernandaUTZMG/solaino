type Tone = 'danger' | 'warning' | 'ok'

function toneClasses(tone: Tone) {
  switch (tone) {
    case 'danger':
      return {
        border: 'border-rose-200',
        bg: 'bg-rose-50',
        text: 'text-rose-800',
        title: 'text-rose-800',
      }
    case 'warning':
      return {
        border: 'border-amber-200',
        bg: 'bg-amber-50',
        text: 'text-amber-800',
        title: 'text-amber-800',
      }
    case 'ok':
      return {
        border: 'border-emerald-200',
        bg: 'bg-emerald-50',
        text: 'text-emerald-800',
        title: 'text-emerald-800',
      }
  }
}

function StatIcon({ tone, className }: { tone: Tone; className?: string }) {
  const cn = className ?? ''
  if (tone === 'danger') {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn}
        aria-hidden
      >
        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
      </svg>
    )
  }
  if (tone === 'warning') {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn}
        aria-hidden
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4" />
        <path d="M12 16h.01" />
      </svg>
    )
  }
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn}
      aria-hidden
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  )
}

export function StatCard(props: {
  title: string
  value: number
  subtitle: string
  tone: Tone
}) {
  const c = toneClasses(props.tone)
  return (
    <div className={`rounded-xl border ${c.border} ${c.bg} p-3 shadow-sm`}>
      <div className="flex items-center gap-2">
        <StatIcon tone={props.tone} className={`h-4 w-4 shrink-0 ${c.text}`} />
        <div
          className={`text-[10px] font-bold uppercase tracking-[0.08em] ${c.title}`}
        >
          {props.title}
        </div>
      </div>
      <div className={`mt-1.5 text-2xl font-bold tabular-nums tracking-tight ${c.text}`}>
        {props.value}
      </div>
      <div className="mt-0.5 text-[12px] font-semibold leading-snug text-slate-800">{props.subtitle}</div>
    </div>
  )
}
