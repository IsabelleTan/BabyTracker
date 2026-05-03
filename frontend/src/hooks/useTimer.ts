import { useState, useRef, useEffect } from 'react'

export function useTimer(onStop: (minutes: number) => void) {
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

  return { elapsedMs, toggle, reset }
}
