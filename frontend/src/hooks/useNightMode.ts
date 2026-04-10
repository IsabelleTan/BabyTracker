import { useState, useEffect, useCallback } from 'react'

function isAutoNight(): boolean {
  const h = new Date().getHours()
  return h >= 21 || h < 7
}

/**
 * Returns current night-mode state and a manual toggle.
 * Auto-switches at 21:00 and 07:00; manual override persists until toggled again.
 * If the clock crosses a boundary while an override is active, the override is
 * cleared so auto-detection takes over at the next natural transition.
 */
export function useNightMode(): { night: boolean; toggle: () => void } {
  const [auto, setAuto] = useState(isAutoNight)
  const [override, setOverride] = useState<boolean | null>(null)

  // Re-check auto value every minute; clear override if it now matches auto
  useEffect(() => {
    const tick = () => {
      const next = isAutoNight()
      setAuto(next)
      setOverride((prev) => (prev === next ? null : prev))
    }
    const id = setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [])

  const night = override ?? auto
  const toggle = useCallback(() => setOverride((prev) => !(prev ?? auto)), [auto])

  return { night, toggle }
}
