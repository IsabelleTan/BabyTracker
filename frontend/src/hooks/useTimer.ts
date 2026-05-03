import { useState, useRef, useEffect } from 'react'

const MAX_MS = 60 * 60 * 1000

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
        const elapsed = Date.now() - startMsRef.current
        if (elapsed >= MAX_MS) {
          clearInterval(intervalRef.current!); intervalRef.current = null
          setElapsedMs(null)
          onStop(60)
        } else {
          setElapsedMs(elapsed)
        }
      }, 100)
    }
  }

  function cancel() {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
    setElapsedMs(null)
  }

  return { elapsedMs, toggle, cancel }
}
