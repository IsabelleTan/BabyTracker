import { useState, useRef } from 'react'
import EventSheet from '@/components/home/EventSheet'
import StatusSection from '@/components/home/StatusSection'
import SummarySection from '@/components/home/SummarySection'
import TimelineSection from '@/components/home/TimelineSection'
import { useSync } from '@/hooks/useSync'
import { deleteEvent, type EventType } from '@/lib/events'
import { generateId } from '@/lib/uuid'
import { useTimeSince } from '@/hooks/useTimeSince'

const PULL_THRESHOLD = 72

export default function Home() {
  const { events, lastFeeds, pendingCount, lastSynced, isRefreshing, sync, log, removeEvent } =
    useSync()
  const [sheetType, setSheetType] = useState<EventType | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  // Pull-to-refresh
  const touchStartY = useRef<number | null>(null)
  const [pullDistance, setPullDistance] = useState(0)
  const [pullRefreshing, setPullRefreshing] = useState(false)
  const pulling = pullDistance > 0

  function onTouchStart(e: React.TouchEvent) {
    if (sheetType !== null) return  // drawer open — don't interfere
    if (window.scrollY === 0) {
      touchStartY.current = e.touches[0].clientY
    }
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

  const isSleeping =
    [...events]
      .filter((e) => e.type === 'sleep_start' || e.type === 'sleep_end')
      .at(-1)?.type === 'sleep_start'

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
            className="text-xs text-muted-foreground transition-transform duration-100"
            style={{
              transform: `rotate(${pullDistance >= PULL_THRESHOLD ? 180 : 0}deg)`,
            }}
          >
            ↓
          </span>
        )}
      </div>

      <div className="flex flex-col gap-6 p-4">
        {/* Sync status bar */}
        <SyncBar pendingCount={pendingCount} lastSynced={lastSynced} isRefreshing={isRefreshing} />

        {loaded && <StatusSection todayEvents={events} lastFeeds={lastFeeds} />}

        {/* Quick actions */}
        <div className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">
            Log event
          </h2>
          <div className="grid grid-cols-3 gap-3">
            <ActionButton emoji="🍼" label="Feed" onClick={() => setSheetType('feed')} />
            <ActionButton
              emoji={isSleeping ? '☀️' : '🌙'}
              label={isSleeping ? 'Wake' : 'Sleep'}
              onClick={() => setSheetType(isSleeping ? 'sleep_end' : 'sleep_start')}
            />
            <ActionButton emoji="💧" label="Diaper" onClick={() => setSheetType('diaper')} />
          </div>
        </div>

        {loaded && <SummarySection events={events} />}
        {loaded && <TimelineSection events={events} onDeleted={handleDeleted} />}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-foreground text-background text-sm font-medium px-4 py-2 rounded-full shadow-lg z-50">
          {toast}
        </div>
      )}

      <EventSheet type={sheetType} onSave={handleSheetSave} onDismiss={() => setSheetType(null)} />
    </div>
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

  if (isRefreshing) {
    return <p className="text-xs text-muted-foreground text-center -mb-2">Syncing…</p>
  }
  if (pendingCount > 0) {
    return (
      <p className="text-xs text-amber-500 text-center -mb-2">
        {pendingCount} pending — will sync when online
      </p>
    )
  }
  if (lastSynced) {
    return <p className="text-xs text-muted-foreground text-center -mb-2">Synced {ago}</p>
  }
  return null
}

function ActionButton({
  emoji,
  label,
  onClick,
}: {
  emoji: string
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-2 h-24 rounded-xl border border-border bg-background active:bg-muted transition-colors text-sm font-medium"
    >
      <span className="text-3xl">{emoji}</span>
      <span>{label}</span>
    </button>
  )
}
