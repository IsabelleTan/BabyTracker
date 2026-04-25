import { useState, useEffect, useCallback } from 'react'
import { isNightHours } from '@/lib/time'

const OVERRIDE_KEY = 'night_mode_override'

function readStoredOverride(): boolean | null {
  const v = localStorage.getItem(OVERRIDE_KEY)
  if (v === 'true') return true
  if (v === 'false') return false
  return null
}

/**
 * Returns current night-mode state and a manual toggle.
 * Auto-switches at 21:00 and 07:00; manual override persists across refreshes
 * via localStorage. If the clock crosses a boundary while an override is active,
 * the override is cleared so auto-detection takes over at the next transition.
 */
export function useNightMode(): { night: boolean; toggle: () => void } {
  const [auto, setAuto] = useState(isNightHours)
  const [override, setOverride] = useState<boolean | null>(readStoredOverride)

  // Re-check auto value every minute; clear override if it now matches auto
  useEffect(() => {
    const tick = () => {
      const next = isNightHours()
      setAuto(next)
      setOverride((prev) => {
        if (prev === next) {
          localStorage.removeItem(OVERRIDE_KEY)
          return null
        }
        return prev
      })
    }
    const id = setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [])

  const night = override ?? auto
  const toggle = useCallback(() => {
    setOverride((prev) => {
      const next = !(prev ?? auto)
      try { localStorage.setItem(OVERRIDE_KEY, String(next)) } catch { /* quota exceeded */ }
      return next
    })
  }, [auto])

  return { night, toggle }
}
