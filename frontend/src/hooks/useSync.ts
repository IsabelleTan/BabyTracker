import { useState, useEffect, useRef, useCallback } from 'react'
import { addPending, removePending, getAllPending } from '@/lib/db'
import {
  logEvent as apiLogEvent,
  getTodayEvents,
  getLastFeeds,
  getNightSessionEvents,
  type BabyEvent,
  type LogEventPayload,
  type EventType,
} from '@/lib/events'
import { getUser } from '@/lib/auth'

const REFRESH_INTERVAL = 30_000

export function useSync() {
  const [events, setEvents] = useState<BabyEvent[]>([])
  const [lastFeeds, setLastFeeds] = useState<BabyEvent[]>([])
  const [nightSessionEvents, setNightSessionEvents] = useState<BabyEvent[]>([])
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
        } catch {
          // Offline or server error — leave in queue, stop flushing
          break
        }
      }

      // Re-fetch authoritative state from server
      const [today, feeds, nightSession] = await Promise.all([
        getTodayEvents(),
        getLastFeeds(3),
        getNightSessionEvents(),
      ])
      setEvents(today)
      setLastFeeds(feeds)
      setNightSessionEvents(nightSession)
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
    try {
      event = await apiLogEvent(payload)
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

    // Optimistic update
    setEvents((prev) =>
      [...prev, event].sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    )
    if (event.type === 'feed') {
      setLastFeeds((prev) => [...prev, event].slice(-3))
    }
  }

  function removeEvent(id: string) {
    setEvents((prev) => prev.filter((e) => e.id !== id))
    setLastFeeds((prev) => prev.filter((e) => e.id !== id))
  }

  return { events, lastFeeds, nightSessionEvents, pendingCount, lastSynced, isRefreshing, sync, log, removeEvent }
}
