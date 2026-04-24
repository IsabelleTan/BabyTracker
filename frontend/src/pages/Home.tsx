import { useState, useRef, useMemo, useEffect } from 'react'
import { Milk, Moon, Sun, Droplets, Baby, Star, LogOut, type LucideIcon } from 'lucide-react'
import NightToggle from '@/components/NightToggle'
import EventSheet from '@/components/home/EventSheet'
import SummarySection from '@/components/home/SummarySection'
import TimelineSection from '@/components/home/TimelineSection'
import { useSync } from '@/hooks/useSync'
import { logout } from '@/lib/auth'
import { useTick, useTimeSince } from '@/hooks/useTimeSince'
import { deleteEvent, type EventType, type BabyEvent } from '@/lib/events'
import { generateId } from '@/lib/uuid'
import { formatTime as fmt, formatAgo as ago, formatUntil as until, formatDuration as duration } from '@/lib/time'
import {
  getBabyVoiceContext,
  getBabyVoiceMessage,
  getNightMessage,
  isNightHours,
  nightMessageShouldShow,
  markNightMessageShown,
  babyVoiceShouldShow,
  dismissBabyVoice,
  getNewMilestone,
  getMilestoneMessage,
  markMilestoneSeen,
  milestoneAllowedToday,
  recordMilestoneShownToday,
  trackDailyLogging,
  type MilestoneKey,
} from '@/lib/funMessages'

const PULL_THRESHOLD = 72

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
  const { events, lastFeeds, nightSessionEvents, pendingCount, lastSynced, isRefreshing, sync, log, removeEvent } =
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
    const e = [...events].filter((e) => e.type === 'output').at(-1)
    return e ? new Date(e.timestamp) : null
  }, [events])

  const isSleeping = sleepStatus?.sleeping ?? false
  const loaded = lastSynced !== null || events.length > 0

  // ── fun message cards ─────────────────────────────────────────────────────
  const [nightCardVisible, setNightCardVisible] = useState(false)
  const [babyVoiceVisible, setBabyVoiceVisible] = useState(false)
  const [milestone, setMilestone] = useState<MilestoneKey | null>(null)
  const isNight = isNightHours()

  // Night event count spans the full 22:00–06:00 session (includes pre-midnight events)
  const nightEventCount = nightSessionEvents.length

  // Night card: reactive to new night events
  useEffect(() => {
    if (!nightMessageShouldShow(nightEventCount)) return
    setNightCardVisible(true)
    markNightMessageShown()
  }, [nightEventCount])

  // Baby voice: fire once on first data load
  const babyVoiceInitDone = useRef(false)
  useEffect(() => {
    if (events.length === 0 || babyVoiceInitDone.current) return
    babyVoiceInitDone.current = true
    if (babyVoiceShouldShow()) setBabyVoiceVisible(true)
  }, [events])

  // Milestones: per-day gate prevents flooding on repeated syncs
  useEffect(() => {
    if (events.length === 0) return
    trackDailyLogging()
    if (milestoneAllowedToday()) {
      const key = getNewMilestone(events)
      if (key) {
        setMilestone(key)
        recordMilestoneShownToday()
      }
    }
  }, [events])

  const nightMsg = useMemo(() => getNightMessage(), [])
  const babyVoiceMsg = useMemo(() => {
    const ctx = getBabyVoiceContext(events)
    return getBabyVoiceMessage(ctx)
  }, [events])

  // During night hours: only night card shown; baby voice + milestone suppressed.
  // During day: max 1 dismissable card — baby voice first, milestone only after
  // baby voice has been dismissed for today.
  const showBabyVoice = loaded && !isNight && babyVoiceVisible
  const showMilestone = loaded && !isNight && !babyVoiceVisible && milestone !== null

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

        {/* Night encouragement — shown once per night session */}
        {nightCardVisible && (
          <MessageCard
            icon={Moon}
            message={nightMsg}
            onDismiss={() => setNightCardVisible(false)}
          />
        )}

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
            icon={Droplets}
            label="Output"
            onClick={() => setSheetType('output')}
            stats={[
              lastDiaperDate
                ? { label: 'Last output', lines: [ago(lastDiaperDate), fmt(lastDiaperDate)] }
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
        </div>

        {loaded && <SummarySection events={events} />}

        {/* Baby voice — once per day, suppressed at night */}
        {showBabyVoice && (
          <MessageCard
            icon={Baby}
            message={babyVoiceMsg}
            onDismiss={() => { dismissBabyVoice(); setBabyVoiceVisible(false) }}
          />
        )}

        {/* Milestone — once ever, only shown after baby voice is dismissed, suppressed at night */}
        {showMilestone && (
          <MessageCard
            icon={Star}
            message={getMilestoneMessage(milestone!)}
            onDismiss={() => { markMilestoneSeen(milestone!); setMilestone(null) }}
          />
        )}

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
      className="flex flex-col items-center rounded-xl bg-card shadow-sm active:brightness-95 active:shadow-none transition-all px-2 py-3 text-center w-full"
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


function MessageCard({
  icon: Icon,
  message,
  onDismiss,
}: {
  icon: LucideIcon
  message: string
  onDismiss: () => void
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
      <Icon className="w-4 h-4 text-primary shrink-0 mt-0.5" />
      <p className="flex-1 text-sm text-foreground">{message}</p>
      <button
        onClick={onDismiss}
        className="text-muted-foreground hover:text-foreground text-xs shrink-0 leading-none pt-0.5"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
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
      <span className={`text-xs ${syncText?.className ?? ''}`}>
        {syncText?.text ?? ''}
        {lastSynced && <span className="text-muted-foreground/40 ml-1">{__APP_VERSION__}</span>}
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => { logout(); window.location.reload() }}
          aria-label="Log out"
          className="text-muted-foreground hover:text-foreground"
        >
          <LogOut className="w-4 h-4" />
        </button>
        <NightToggle />
      </div>
    </div>
  )
}
