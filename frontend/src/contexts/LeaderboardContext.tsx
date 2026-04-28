import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { getLeaderboards, buildNotifications, type LeaderboardData } from '@/lib/leaderboards'

type FetchStatus = 'loading' | 'success' | 'error'

interface LeaderboardCtx {
  data: LeaderboardData | null
  notifications: string[]
  status: FetchStatus
}

const LeaderboardContext = createContext<LeaderboardCtx>({
  data: null,
  notifications: [],
  status: 'loading',
})

// eslint-disable-next-line react-refresh/only-export-components
export const useLeaderboardData = () => useContext(LeaderboardContext)

const TTL_MS = 5 * 60 * 1000 // re-fetch at most once per 5 minutes

export function LeaderboardProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<LeaderboardData | null>(null)
  const [notifications, setNotifications] = useState<string[]>([])
  const [status, setStatus] = useState<FetchStatus>('loading')
  const lastFetchAt = useRef<number>(0)

  function fetchData() {
    if (Date.now() - lastFetchAt.current < TTL_MS) return
    lastFetchAt.current = Date.now()
    getLeaderboards()
      .then((d) => {
        setData(d)
        setNotifications(d ? buildNotifications(d) : [])
        setStatus('success')
      })
      .catch(() => setStatus('error'))
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
    <LeaderboardContext.Provider value={{ data, notifications, status }}>
      {children}
    </LeaderboardContext.Provider>
  )
}
