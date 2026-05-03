import { useState, useEffect, useRef, useCallback } from 'react'
import { addPending, removePending, getAllPending } from '@/lib/db'
import {
  logEvent as apiLogEvent,
  getLast24HoursEvents,
  getNightSessionEvents,
  isInNightSession,
  type BabyEvent,
  type LogEventPayload,
  type EventType,
} from '@/lib/events'
import { getUser } from '@/lib/auth'
import { api, type HttpError } from '@/lib/api'

export interface StreakStats {
  current_potty_streak: number | null
  total_potty_events: number
  days_logged_total: number
}

async function fetchStreaks(): Promise<StreakStats> {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const r = await api.get<StreakStats>('/stats/streaks', { params: { tz } })
  return r.data
}

const REFRESH_INTERVAL = 30_000

export function useSync() {
  const [events, setEvents] = useState<BabyEvent[]>([])
  const [nightSessionEvents, setNightSessionEvents] = useState<BabyEvent[]>([])
  const [streakStats, setStreakStats] = useState<StreakStats | null>(null)
  const [pendingCount, setPendingCount] = useState(0)
  const [lastSynced, setLastSynced] = useState<Date | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const busyRef = useRef(false)

  const sync = useCallback(async () => {
    if (busyRef.current) return
    busyRef.current = true
    setIsRefreshing(true)
    try {
      // Flush pending queue in order
      const pending = await getAllPending()
      for (const p of pending) {
        try {
          await apiLogEvent(p as LogEventPayload)
          await removePending(p.id)
        } catch (err) {
          // Network error (no response) — stop flushing; server errors (4xx/5xx) can be skipped
          if (!(err as HttpError).status) break
        }
      }

      // Re-fetch authoritative state from server
      const [today, nightSession, streaks] = await Promise.all([
        getLast24HoursEvents(),
        getNightSessionEvents(),
        fetchStreaks(),
      ])
      setEvents(today)
      setNightSessionEvents(nightSession)
      setStreakStats(streaks)
      setLastSynced(new Date())
    } catch {
      // Network unavailable — silently ignore
    } finally {
      const remaining = await getAllPending()
      setPendingCount(remaining.length)
      busyRef.current = false
      setIsRefreshing(false)
    }
  }, [])

  // Initial load + auto-refresh + reconnect trigger
  useEffect(() => {
    sync()

    const interval = setInterval(sync, REFRESH_INTERVAL)

    function onVisibility() {
      if (!document.hidden) sync()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('online', sync)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('online', sync)
    }
  }, [sync])

  async function log(payload: LogEventPayload): Promise<void> {
    let event: BabyEvent
    let synced = false
    try {
      event = await apiLogEvent(payload)
      synced = true
    } catch {
      // Offline — queue for later and build a local stand-in for optimistic UI
      const entry = {
        id: payload.id,
        type: payload.type,
        timestamp: payload.timestamp,
        metadata: payload.metadata ?? null,
      }
      addPending(entry)
        .then(() => setPendingCount((c) => c + 1))
        .catch(() => {})

      const user = getUser()
      event = {
        id: payload.id,
        type: payload.type as EventType,
        timestamp: payload.timestamp,
        logged_by: user?.user_id ?? '',
        display_name: user?.display_name ?? 'You',
        metadata: payload.metadata ?? null,
      }
    }

    // Optimistic update for immediate timeline/action-card feedback
    setEvents((prev) =>
      [...prev, event].sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    )
    if (isInNightSession(event.timestamp)) {
      setNightSessionEvents((prev) =>
        [...prev, event].sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
      )
    }

    // If online, immediately fetch authoritative state so summary stats update
    if (synced) sync()
  }

  function removeEvent(id: string) {
    setEvents((prev) => prev.filter((e) => e.id !== id))
    setNightSessionEvents((prev) => prev.filter((e) => e.id !== id))
  }

  return { events, nightSessionEvents, streakStats, pendingCount, lastSynced, isRefreshing, sync, log, removeEvent }
}
