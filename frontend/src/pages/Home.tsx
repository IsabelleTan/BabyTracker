import { useState, useRef, useMemo } from 'react'
import { Milk, Moon, Sun, Droplets, type LucideIcon } from 'lucide-react'
import NightToggle from '@/components/NightToggle'
import EventSheet from '@/components/home/EventSheet'
import SummarySection from '@/components/home/SummarySection'
import TimelineSection from '@/components/home/TimelineSection'
import { useSync } from '@/hooks/useSync'
import { useTick, useTimeSince } from '@/hooks/useTimeSince'
import { deleteEvent, type EventType, type BabyEvent } from '@/lib/events'
import { generateId } from '@/lib/uuid'

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
    } catch (err: any) {
      const status = err?.response?.status
      if (status === 403) showToast("Can't delete — not your family's event")
      else if (status === 404) showToast('Event already deleted')
      else showToast('Delete failed — are you online?')
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
        <TopBar pendingCount={pendingCount} lastSynced={lastSynced} isRefreshing={isRefreshing} />

        {/* Action cards — break out of container padding for max width */}
        <div className="-mx-4 px-2 grid grid-cols-3 gap-2">
          <ActionCard
            icon={Milk}
            label="Feed"
            onClick={() => setSheetType('feed')}
            stats={[
              lastFeedDate
                ? { label: 'Last feed', lines: [ago(lastFeedDate), fmt(lastFeedDate)] }
                : null,
              nextFeed
                ? { label: 'Est. next feed', lines: [until(nextFeed), `~${fmt(nextFeed)}`] }
                : null,
            ]}
          />
          <ActionCard
            icon={isSleeping ? Sun : Moon}
            label={isSleeping ? 'Wake' : 'Sleep'}
            onClick={() => setSheetType(isSleeping ? 'sleep_end' : 'sleep_start')}
            stats={[
              sleepStatus
                ? {
                    label: isSleeping ? 'Asleep since' : 'Awake since',
                    lines: [duration(sleepStatus.since), fmt(sleepStatus.since)],
                  }
                : null,
            ]}
          />
          <ActionCard
            icon={Droplets}
            label="Diaper"
            onClick={() => setSheetType('diaper')}
            stats={[
              lastDiaperDate
                ? { label: 'Last diaper', lines: [ago(lastDiaperDate), fmt(lastDiaperDate)] }
                : null,
            ]}
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

interface Stat {
  label: string
  lines: string[]
}

function ActionCard({
  icon: Icon,
  label,
  onClick,
  stats,
}: {
  icon: LucideIcon
  label: string
  onClick: () => void
  stats: (Stat | null)[]
}) {
  const visibleStats = stats.filter(Boolean) as Stat[]
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center rounded-xl border border-primary/20 bg-card active:brightness-95 transition-all px-2 py-3 text-center w-full"
    >
      <div className="flex-1 w-full flex flex-col gap-2 pb-2">
        {visibleStats.map((s, i) => (
          <div key={i} className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground/60">
              {s.label}
            </span>
            {s.lines.map((line, j) => (
              <span
                key={j}
                className={j === 0
                  ? 'text-base leading-tight font-semibold'
                  : 'text-xs text-muted-foreground leading-tight'
                }
              >
                {line}
              </span>
            ))}
          </div>
        ))}
      </div>
      <div className={`w-full pt-2 flex flex-col items-center gap-1.5 ${visibleStats.length > 0 ? 'border-t border-primary/15' : ''}`}>
        <Icon className="w-8 h-8 text-primary" />
        <span className="text-sm font-medium">{label}</span>
      </div>
    </button>
  )
}


function TopBar({
  pendingCount,
  lastSynced,
  isRefreshing,
}: {
  pendingCount: number
  lastSynced: Date | null
  isRefreshing: boolean
}) {
  const ago = useTimeSince(lastSynced)

  let syncText: { text: string; className: string } | null = null
  if (isRefreshing) syncText = { text: 'Syncing…', className: 'text-muted-foreground' }
  else if (pendingCount > 0) syncText = { text: `${pendingCount} pending — will sync when online`, className: 'text-amber-500' }
  else if (lastSynced) syncText = { text: `Synced ${ago}`, className: 'text-muted-foreground' }

  return (
    <div className="flex items-center justify-between -mb-2">
      <span className={`text-xs ${syncText?.className ?? ''}`}>{syncText?.text ?? ''}</span>
      <NightToggle />
    </div>
  )
}
