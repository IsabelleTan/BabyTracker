import { useState, useRef, useEffect } from 'react'

export interface UseTimerReturn {
  elapsedMs: number | null  // null = not running; number = running, value is elapsed time
  toggle: () => void
  reset: () => void
  getElapsedMinutes: () => number
}

export function useTimer(onStop: (minutes: number) => void): UseTimerReturn {
  const [elapsedMs, setElapsedMs] = useState<number | null>(null)
  const startMsRef = useRef(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  function toggle() {
    if (elapsedMs !== null) {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
      const elapsed = Date.now() - startMsRef.current
      setElapsedMs(null)
      onStop(Math.round(elapsed / 60000))
    } else {
      startMsRef.current = Date.now()
      intervalRef.current = setInterval(() => {
        setElapsedMs(Date.now() - startMsRef.current)
      }, 100)
    }
  }

  function reset() {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
    setElapsedMs(null)
  }

  function getElapsedMinutes() {
    return Math.round((Date.now() - startMsRef.current) / 60000)
  }

  return { elapsedMs, toggle, reset, getElapsedMinutes }
}
