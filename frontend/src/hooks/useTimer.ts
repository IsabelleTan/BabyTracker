import { useState, useRef, useEffect } from 'react'

export interface UseTimerReturn {
  running: boolean
  elapsedMs: number
  toggle: () => void
  reset: () => void
  getElapsedMinutes: () => number
}

export function useTimer(onStop: (minutes: number) => void): UseTimerReturn {
  const [running, setRunning] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)
  const startMsRef = useRef(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  function toggle() {
    if (running) {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
      setRunning(false)
      const elapsed = Date.now() - startMsRef.current
      setElapsedMs(elapsed)
      onStop(Math.round(elapsed / 60000))
    } else {
      startMsRef.current = Date.now()
      setRunning(true)
      intervalRef.current = setInterval(() => {
        setElapsedMs(Date.now() - startMsRef.current)
      }, 100)
    }
  }

  function reset() {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
    setRunning(false)
    setElapsedMs(0)
  }

  function getElapsedMinutes() {
    return Math.round((Date.now() - startMsRef.current) / 60000)
  }

  return { running, elapsedMs, toggle, reset, getElapsedMinutes }
}
