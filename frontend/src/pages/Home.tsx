import { useState, useRef, useMemo } from 'react'
import EventSheet from '@/components/home/EventSheet'
import SummarySection from '@/components/home/SummarySection'
import TimelineSection from '@/components/home/TimelineSection'
import { useSync } from '@/hooks/useSync'
import { useTick } from '@/hooks/useTimeSince'
import { deleteEvent, type EventType, type BabyEvent } from '@/lib/events'
import { generateId } from '@/lib/uuid'
import { useTimeSince } from '@/hooks/useTimeSince'

const PULL_THRESHOLD = 72

// ── time helpers (24hr, no AM/PM) ────────────────────────────────────────────

function fmt(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function ago(date: Date): string {
  const mins = Math.floor((Date.now() - date.getTime()) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const h = Math.floor(mins / 60), m = mins % 60
  return m === 0 ? `${h}h ago` : `${h}h ${m}m ago`
}

function until(date: Date): string {
  const mins = Math.floor((date.getTime() - Date.now()) / 60_000)
  if (mins <= 0) return 'now'
  if (mins < 60) return `in ${mins}m`
  const h = Math.floor(mins / 60), m = mins % 60
  return m === 0 ? `in ${h}h` : `in ${h}h ${m}m`
}

function duration(from: Date, to: Date = new Date()): string {
  const totalMins = Math.floor((to.getTime() - from.getTime()) / 60_000)
  const h = Math.floor(totalMins / 60), m = totalMins % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function nextFeedEstimate(lastFeeds: BabyEvent[]): Date | null {
  if (lastFeeds.length < 2) return null
  const intervals: number[] = []
  for (let i = 1; i < lastFeeds.length; i++) {
    intervals.push(
      new Date(lastFeeds[i].timestamp).getTime() -
        new Date(lastFeeds[i - 1].timestamp).getTime(),
    )
  }
  const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length
  return new Date(new Date(lastFeeds[lastFeeds.length - 1].timestamp).getTime() + avg)
}

// ── component ────────────────────────────────────────────────────────────────

export default function Home() {
  const { events, lastFeeds, pendingCount, lastSynced, isRefreshing, sync, log, removeEvent } =
    useSync()
  const [sheetType, setSheetType] = useState<EventType | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  useTick() // re-render every minute so "X ago" / "in X" stays fresh

  // Pull-to-refresh
  const touchStartY = useRef<number | null>(null)
  const [pullDistance, setPullDistance] = useState(0)
  const [pullRefreshing, setPullRefreshing] = useState(false)
  const pulling = pullDistance > 0

  function onTouchStart(e: React.TouchEvent) {
    if (sheetType !== null) return
    if (window.scrollY === 0) touchStartY.current = e.touches[0].clientY
  }
  function onTouchMove(e: React.TouchEvent) {
    if (touchStartY.current === null || isRefreshing) return
    const delta = e.touches[0].clientY - touchStartY.current
    if (delta > 0) setPullDistance(Math.min(delta, PULL_THRESHOLD + 24))
  }
  async function onTouchEnd() {
    touchStartY.current = null
    if (pullDistance >= PULL_THRESHOLD) {
      setPullDistance(0)
      setPullRefreshing(true)
      await sync()
      setPullRefreshing(false)
    } else {
      setPullDistance(0)
    }
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  async function handleSheetSave(timestamp: string, metadata: Record<string, unknown> | null) {
    if (!sheetType) return
    const id = generateId()
    setSheetType(null)
    try {
      await log({ id, type: sheetType, timestamp, metadata })
      showToast('Logged ✓')
    } catch {
      showToast('Failed to save — try again')
    }
  }

  async function handleDeleted(id: string) {
    try {
      await deleteEvent(id)
      removeEvent(id)
    } catch {
      showToast('Delete failed — are you online?')
    }
  }

  // Derived stats for action cards
  const lastFeedDate = useMemo(() => {
    const e = [...events].filter((e) => e.type === 'feed').at(-1)
    return e ? new Date(e.timestamp) : null
  }, [events])

  const nextFeed = useMemo(() => nextFeedEstimate(lastFeeds), [lastFeeds])

  const sleepStatus = useMemo(() => {
    const e = [...events].filter((e) => e.type === 'sleep_start' || e.type === 'sleep_end').at(-1)
    if (!e) return null
    return { sleeping: e.type === 'sleep_start', since: new Date(e.timestamp) }
  }, [events])

  const lastDiaperDate = useMemo(() => {
    const e = [...events].filter((e) => e.type === 'diaper').at(-1)
    return e ? new Date(e.timestamp) : null
  }, [events])

  const isSleeping = sleepStatus?.sleeping ?? false
  const loaded = lastSynced !== null || events.length > 0

  return (
    <div
      className="flex flex-col min-h-[calc(100svh-4rem)]"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Pull-to-refresh indicator */}
      <div
        className="flex items-center justify-center overflow-hidden transition-all duration-200"
        style={{ height: pulling ? Math.min(pullDistance, PULL_THRESHOLD) : pullRefreshing ? 32 : 0 }}
      >
        {pullRefreshing ? (
          <span className="text-xs text-muted-foreground animate-spin inline-block">↻</span>
        ) : (
          <span
            className="text-xs text-muted-foreground"
            style={{ transform: `rotate(${pullDistance >= PULL_THRESHOLD ? 180 : 0}deg)`, display: 'inline-block', transition: 'transform 100ms' }}
          >
            ↓
          </span>
        )}
      </div>

      <div className="flex flex-col gap-6 p-4">
        <SyncBar pendingCount={pendingCount} lastSynced={lastSynced} isRefreshing={isRefreshing} />

        {/* Action cards with inline stats */}
        <div className="grid grid-cols-3 gap-3">
          <ActionCard
            emoji="🍼"
            label="Feed"
            onClick={() => setSheetType('feed')}
            stats={
              lastFeedDate
                ? [
                    `${fmt(lastFeedDate)} · ${ago(lastFeedDate)}`,
                    nextFeed ? `~${fmt(nextFeed)} · ${until(nextFeed)}` : null,
                  ]
                : []
            }
          />
          <ActionCard
            emoji={isSleeping ? '☀️' : '🌙'}
            label={isSleeping ? 'Wake' : 'Sleep'}
            onClick={() => setSheetType(isSleeping ? 'sleep_end' : 'sleep_start')}
            stats={
              sleepStatus
                ? [
                    `${isSleeping ? 'Asleep' : 'Awake'} since ${fmt(sleepStatus.since)}`,
                    duration(sleepStatus.since),
                  ]
                : []
            }
          />
          <ActionCard
            emoji="💧"
            label="Diaper"
            onClick={() => setSheetType('diaper')}
            stats={
              lastDiaperDate
                ? [`${fmt(lastDiaperDate)} · ${ago(lastDiaperDate)}`]
                : []
            }
          />
        </div>

        {loaded && <SummarySection events={events} />}
        {loaded && <TimelineSection events={events} onDeleted={handleDeleted} />}
      </div>

      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-foreground text-background text-sm font-medium px-4 py-2 rounded-full shadow-lg z-50">
          {toast}
        </div>
      )}

      <EventSheet type={sheetType} onSave={handleSheetSave} onDismiss={() => setSheetType(null)} />
    </div>
  )
}

function ActionCard({
  emoji,
  label,
  onClick,
  stats,
}: {
  emoji: string
  label: string
  onClick: () => void
  stats: (string | null)[]
}) {
  const visibleStats = stats.filter(Boolean) as string[]
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-background active:bg-muted transition-colors px-2 py-3 text-center w-full"
    >
      <span className="text-3xl">{emoji}</span>
      <span className="text-sm font-medium">{label}</span>
      {visibleStats.length > 0 && (
        <div className="w-full border-t border-border mt-0.5 pt-1.5 flex flex-col gap-0.5">
          {visibleStats.map((s, i) => (
            <span key={i} className="text-[10px] leading-tight text-muted-foreground">
              {s}
            </span>
          ))}
        </div>
      )}
    </button>
  )
}

function SyncBar({
  pendingCount,
  lastSynced,
  isRefreshing,
}: {
  pendingCount: number
  lastSynced: Date | null
  isRefreshing: boolean
}) {
  const ago = useTimeSince(lastSynced)
  if (isRefreshing) return <p className="text-xs text-muted-foreground text-center -mb-2">Syncing…</p>
  if (pendingCount > 0) return <p className="text-xs text-amber-500 text-center -mb-2">{pendingCount} pending — will sync when online</p>
  if (lastSynced) return <p className="text-xs text-muted-foreground text-center -mb-2">Synced {ago}</p>
  return null
}
