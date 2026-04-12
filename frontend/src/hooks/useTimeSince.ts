import { useState, useEffect, useRef } from 'react'
import { formatAgo, formatDurationMs } from '@/lib/time'

export { formatAgo as formatTimeSince, formatDurationMs as formatDuration }

/** Causes the component to re-render every minute, pausing when the page is hidden. */
export function useTick(): void {
  const [, setTick] = useState(0)
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null
    function start() { interval = setInterval(() => setTick((t) => t + 1), 60_000) }
    function stop() { if (interval) clearInterval(interval) }
    function onVisibility() { document.hidden ? stop() : start() }
    start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => { stop(); document.removeEventListener('visibilitychange', onVisibility) }
  }, [])
}

/** Returns a human-readable "X ago" string that updates every minute.
 *  Pauses ticking when the page is hidden (tab/app in background). */
export function useTimeSince(date: Date | null): string {
  const [, setTick] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!date) return
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
  }, [date])

  if (!date) return '—'
  return formatAgo(date)
}
