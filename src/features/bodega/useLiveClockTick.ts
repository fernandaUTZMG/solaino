import { useEffect, useRef, useState } from 'react'

/** Devuelve la hora actual; se actualiza cada segundo si `ticking` es true. Al pausar, congela. */
export function useLiveClockTick(ticking: boolean): Date {
  const [now, setNow] = useState(() => new Date())
  const intervalRef = useRef<number | null>(null)

  useEffect(() => {
    if (intervalRef.current != null) {
      window.clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    if (!ticking) return
    setNow(new Date())
    intervalRef.current = window.setInterval(() => setNow(new Date()), 1000)
    return () => {
      if (intervalRef.current != null) {
        window.clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [ticking])

  return now
}
