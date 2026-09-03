import { useEffect, useState } from 'react'

/** Devuelve la hora actual; se actualiza cada segundo si `ticking` es true. */
export function useLiveClockTick(ticking: boolean): Date {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    if (!ticking) return
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [ticking])

  return now
}
