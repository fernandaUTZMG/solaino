import { useEffect, useRef, useState } from 'react'
import { nowDate, nowMs, syncServerClock } from '../../lib/serverNow'

/** Hora alineada con Supabase; se actualiza ~4 veces por segundo si `ticking`. */
export function useLiveClockTick(ticking: boolean): Date {
  const [now, setNow] = useState(() => nowDate())
  const intervalRef = useRef<number | null>(null)

  useEffect(() => {
    void syncServerClock().then(() => setNow(nowDate()))
  }, [])

  useEffect(() => {
    if (intervalRef.current != null) {
      window.clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    if (!ticking) {
      setNow(nowDate())
      return
    }
    const pulse = () => setNow(new Date(nowMs()))
    pulse()
    intervalRef.current = window.setInterval(pulse, 250)
    const onVis = () => {
      if (document.visibilityState === 'visible') pulse()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      if (intervalRef.current != null) {
        window.clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [ticking])

  return now
}
