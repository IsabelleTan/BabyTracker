import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { getLeaderboards, buildNotifications, type LeaderboardData } from '@/lib/leaderboards'

interface LeaderboardCtx {
  data: LeaderboardData | null
  notifications: string[]
  loading: boolean
  error: boolean
}

const LeaderboardContext = createContext<LeaderboardCtx>({
  data: null,
  notifications: [],
  loading: true,
  error: false,
})

export const useLeaderboardData = () => useContext(LeaderboardContext)

const TTL_MS = 5 * 60 * 1000 // re-fetch at most once per 5 minutes

export function LeaderboardProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<LeaderboardData | null>(null)
  const [notifications, setNotifications] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const lastFetchAt = useRef<number>(0)

  function fetchData() {
    if (Date.now() - lastFetchAt.current < TTL_MS) return
    lastFetchAt.current = Date.now()
    getLeaderboards()
      .then((d) => {
        setData(d)
        setNotifications(buildNotifications(d))
        setError(false)
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchData()
    function onVisibility() {
      if (!document.hidden) fetchData()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  return (
    <LeaderboardContext.Provider value={{ data, notifications, loading, error }}>
      {children}
    </LeaderboardContext.Provider>
  )
}
