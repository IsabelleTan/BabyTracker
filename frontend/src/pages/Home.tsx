import { useState, useRef, useMemo, useEffect } from 'react'
import { Milk, Moon, Sun, Droplets, Baby, Star, Flame } from 'lucide-react'
import EventSheet from '@/components/home/EventSheet'
import SummarySection from '@/components/home/SummarySection'
import TimelineSection from '@/components/home/TimelineSection'
import VitaminDWidget from '@/components/home/VitaminDWidget'
import { ActionCard, MessageCard, TopBar } from '@/components/home/HomeCards'
import { usePullToRefresh, PULL_THRESHOLD } from '@/hooks/usePullToRefresh'
import { useSync } from '@/hooks/useSync'
import { useTick } from '@/hooks/useTimeSince'
import { deleteEvent, type EventType, type BabyEvent, type EventMeta } from '@/lib/events'
import { generateId } from '@/lib/uuid'
import { formatTime as fmt, formatAgo as ago, formatDuration as duration, isNightHours } from '@/lib/time'
import {
  getBabyVoiceContext,
  getBabyVoiceMessage,
  getNightMessage,
  nightMessageShouldShow,
  markNightMessageShown,
  babyVoiceShouldShow,
  dismissBabyVoice,
  getNewMilestone,
  getMilestoneMessage,
  markMilestoneSeen,
  milestoneAllowedToday,
  recordMilestoneShownToday,
  type MilestoneKey,
} from '@/lib/funMessages'
import { getPottyStreak, updatePottyStreak, trackPottyCount, trackDailyLogging, resetPottyStreak } from '@/lib/streaks'

export default function Home() {
  const { events, nightSessionEvents, pendingCount, lastSynced, isRefreshing, sync, log, removeEvent } =
    useSync()
  const [sheetType, setSheetType] = useState<EventType | null>(null)
  const [editEvent, setEditEvent] = useState<BabyEvent | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  useTick() // re-render every minute so "X ago" / "in X" stays fresh

  const { onTouchStart, onTouchMove, onTouchEnd, pullDistance, pullRefreshing, pulling } =
    usePullToRefresh({ isRefreshing, sync, disabled: sheetType !== null })

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  async function handleSheetSave(timestamp: string, metadata: EventMeta) {
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
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 403) showToast("Can't delete — not your family's event")
      else if (status === 404) showToast('Event already deleted')
      else showToast('Delete failed — are you online?')
    }
  }

  async function handleEditSave(timestamp: string, metadata: EventMeta) {
    if (!editEvent) return
    const oldId = editEvent.id
    const oldType = editEvent.type
    setEditEvent(null)
    try {
      await deleteEvent(oldId)
      removeEvent(oldId)
      await log({ id: generateId(), type: oldType, timestamp, metadata })
      showToast('Updated ✓')
    } catch {
      showToast('Failed to save — try again')
    }
  }

  async function handleEditDelete() {
    if (!editEvent) return
    const id = editEvent.id
    setEditEvent(null)
    await handleDeleted(id)
  }

  const { lastFeedDate, sleepStatus, lastDiaperDate } = useMemo(() => {
    let lastFeed: BabyEvent | undefined
    let lastSleepEvent: BabyEvent | undefined
    let lastOutput: BabyEvent | undefined
    for (const e of events) {
      if (e.type === 'feed') lastFeed = e
      else if (e.type === 'sleep_start' || e.type === 'sleep_end') lastSleepEvent = e
      else if (e.type === 'output') lastOutput = e
    }
    return {
      lastFeedDate:   lastFeed       ? new Date(lastFeed.timestamp)       : null,
      sleepStatus:    lastSleepEvent
        ? { sleeping: lastSleepEvent.type === 'sleep_start', since: new Date(lastSleepEvent.timestamp) }
        : null,
      lastDiaperDate: lastOutput     ? new Date(lastOutput.timestamp)     : null,
    }
  }, [events])

  const isSleeping = sleepStatus?.sleeping ?? false
  const loaded = lastSynced !== null || events.length > 0

  // ── fun message cards ─────────────────────────────────────────────────────
  const [nightCardVisible, setNightCardVisible] = useState(false)
  const [babyVoiceVisible, setBabyVoiceVisible] = useState(false)
  const [milestone, setMilestone] = useState<MilestoneKey | null>(null)
  const [pottyStreak, setPottyStreak] = useState(() => getPottyStreak())
  const isNight = isNightHours()

  // Night event count spans the full 22:00–06:00 session (includes pre-midnight events)
  const nightEventCount = nightSessionEvents.length

  // Night card: reactive to new night events
  useEffect(() => {
    if (!nightMessageShouldShow(nightEventCount)) return
    setNightCardVisible(true) // eslint-disable-line react-hooks/set-state-in-effect
    markNightMessageShown()
  }, [nightEventCount])

  // On first non-empty load: show baby voice card if allowed.
  // On every sync: update potty streak, check for new milestones.
  // Per-day gates in each function prevent repeated triggers across syncs.
  const babyVoiceInitDone = useRef(false)
  const streakPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function onStreakPressStart() {
    streakPressTimer.current = setTimeout(() => {
      if (window.confirm('Reset potty streak?')) {
        resetPottyStreak()
        setPottyStreak(0)
      }
    }, 600)
  }

  function onStreakPressEnd() {
    if (streakPressTimer.current) {
      clearTimeout(streakPressTimer.current)
      streakPressTimer.current = null
    }
  }
  useEffect(() => {
    if (events.length === 0) return

    if (!babyVoiceInitDone.current) {
      babyVoiceInitDone.current = true
      if (babyVoiceShouldShow()) setBabyVoiceVisible(true) // eslint-disable-line react-hooks/set-state-in-effect
    }

    trackDailyLogging()
    trackPottyCount(events)
    setPottyStreak(updatePottyStreak(events))
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

        <VitaminDWidget events={events} onLog={log} />

        {loaded && <SummarySection events={events} lastSynced={lastSynced} />}

        {/* Potty streak — shown when ≥2 consecutive days with potty events */}
        {pottyStreak >= 2 && (
          <div
            className="flex items-center gap-1.5 px-1 select-none"
            onPointerDown={onStreakPressStart}
            onPointerUp={onStreakPressEnd}
            onPointerLeave={onStreakPressEnd}
            onPointerCancel={onStreakPressEnd}
          >
            <Flame className="w-3.5 h-3.5 text-primary/70" />
            <span className="text-xs font-medium text-primary/70">{pottyStreak}-day potty streak</span>
          </div>
        )}

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

        {loaded && <TimelineSection events={events} onEditEvent={setEditEvent} />}
      </div>

      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-foreground text-background text-sm font-medium px-4 py-2 rounded-full shadow-lg z-50">
          {toast}
        </div>
      )}

      <EventSheet
        type={editEvent?.type ?? sheetType}
        initialEvent={editEvent}
        onSave={editEvent ? handleEditSave : handleSheetSave}
        onDelete={editEvent ? handleEditDelete : undefined}
        onDismiss={() => { setSheetType(null); setEditEvent(null) }}
        onTypeChange={!editEvent ? setSheetType : undefined}
      />
    </div>
  )
}
