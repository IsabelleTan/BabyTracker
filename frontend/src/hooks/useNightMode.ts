import { useState, useEffect } from 'react'

function isNight(): boolean {
  const h = new Date().getHours()
  return h >= 21 || h < 7
}

/**
 * Returns true between 21:00 and 07:00 local time.
 * Re-evaluates at the top of each minute.
 */
export function useNightMode(): boolean {
  const [night, setNight] = useState(isNight)

  useEffect(() => {
    const tick = () => setNight(isNight())
    const id = setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [])

  return night
}
