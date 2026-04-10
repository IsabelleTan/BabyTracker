import { useState, useEffect, useRef } from 'react'

/** Returns a human-readable "X ago" string that updates every minute.
 *  Pauses ticking when the page is hidden (tab/app in background). */
export function useTimeSince(date: Date | null): string {
  const [, setTick] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    function start() {
      intervalRef.current = setInterval(() => setTick((t) => t + 1), 60_000)
    }
    function stop() {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    function onVisibility() {
      if (document.hidden) stop()
      else start()
    }

    start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  if (!date) return '—'
  return formatTimeSince(date)
}

export function formatTimeSince(date: Date): string {
  const mins = Math.floor((Date.now() - date.getTime()) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m === 0 ? `${h}h ago` : `${h}h ${m}m ago`
}

export function formatDuration(ms: number): string {
  const totalMins = Math.floor(ms / 60_000)
  const h = Math.floor(totalMins / 60)
  const m = totalMins % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}
