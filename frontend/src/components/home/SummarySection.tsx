import { useMemo, useEffect, useRef, useState } from 'react'
import { Milk, Moon, Droplets, Sparkles, Users, type LucideIcon } from 'lucide-react'
import { formatDuration } from '@/hooks/useTimeSince'
import { getEventsSince, currentDayStart, type BabyEvent } from '@/lib/events'
import { getUser } from '@/lib/auth'
import { useLeaderboardData } from '@/contexts/LeaderboardContext'
import {
  getPartnerMessage,
  partnerMessageAllowed,
  recordPartnerMessageShown,
  isNightHours,
  type PartnerMessageResult,
} from '@/lib/funMessages'

interface Props {
  events: BabyEvent[]
}

export default function SummarySection({ events }: Props) {
  // Fetch 8 days of history for 7-day averages; merge with live events for optimistic updates
  const [historyEvents, setHistoryEvents] = useState<BabyEvent[]>([])
  useEffect(() => {
    getEventsSince(8).then(setHistoryEvents).catch(() => {})
  }, [])
  const allEvents = useMemo(() => {
    const map = new Map(historyEvents.map((e) => [e.id, e]))
    events.forEach((e) => map.set(e.id, e))
    return Array.from(map.values())
  }, [historyEvents, events])

  const stats = useMemo(() => computeStats(allEvents), [allEvents])
  const { notifications } = useLeaderboardData()

  // Partner message: compute once on first data load; suppress at night and within 3-day gate
  const [partnerMsg, setPartnerMsg] = useState<PartnerMessageResult | null>(null)
  const partnerMsgInitDone = useRef(false)
  useEffect(() => {
    if (events.length === 0 || partnerMsgInitDone.current) return
    partnerMsgInitDone.current = true
    if (isNightHours()) return
    const users = new Set(events.map((e) => e.logged_by))
    if (users.size < 2) return
    if (!partnerMessageAllowed()) return
    const userId = getUser()?.user_id ?? ''
    const msg = getPartnerMessage(events, userId)
    if (msg) {
      setPartnerMsg(msg)
      recordPartnerMessageShown()
    }
  }, [events])

  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">
        Today
      </h2>
      <div className="rounded-xl border border-primary/35 bg-surface p-4 flex flex-col gap-3">
        <div className="flex flex-col gap-2.5">
          <StatBar
            icon={Milk}
            label="Feeds"
            value={stats.feedCount}
            valueStr={String(stats.feedCount)}
            avg={stats.avgFeeds}

            max={stats.maxFeeds}
          />
          <StatBar
            icon={Droplets}
            label="Diapers"
            value={stats.diaperCount}
            valueStr={String(stats.diaperCount)}
            avg={stats.avgDiapers}

            max={stats.maxDiapers}
          />
          <StatBar
            icon={Moon}
            label="Sleep"
            value={stats.totalSleepMs}
            valueStr={stats.totalSleep}
            avg={stats.avgSleepMs}

            max={stats.maxSleepMs}
          />
        </div>
        <p className="text-[10px] text-muted-foreground/60">│ 7-day avg</p>
        {partnerMsg && (
          <div className="border-t border-primary/15 pt-3 flex items-center gap-2">
            <Users className="w-3.5 h-3.5 text-primary shrink-0" />
            <p className="text-xs text-foreground">{partnerMsg.message}</p>
          </div>
        )}
        {notifications.length > 0 && (
          <div className="border-t border-primary/15 pt-3 flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 text-primary">
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span className="text-xs font-semibold">New today</span>
            </div>
            {notifications.map((n) => (
              <p key={n} className="text-xs text-foreground pl-5">{n}</p>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StatBar({
  icon: Icon,
  label,
  value,
  valueStr,
  avg,
  max,
}: {
  icon: LucideIcon
  label: string
  value: number
  valueStr: string
  avg: number
  max: number
}) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  const avgPct = max > 0 ? Math.min((avg / max) * 100, 100) : 0

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2 w-20 shrink-0">
        <Icon className="w-4.5 h-4.5 text-primary" />
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <div className="flex-1 relative h-2.5 bg-border rounded-full overflow-visible">
        <div
          className="h-full bg-primary/50 rounded-full"
          style={{ width: `${pct}%` }}
        />
        {avg > 0 && (
          <div
            className="absolute top-1/2 -translate-y-1/2 w-[2px] h-5 bg-primary/70 rounded-full"
            style={{ left: `${avgPct}%` }}
          />
        )}
      </div>
      <span className="text-sm font-semibold w-14 text-right shrink-0">{valueStr}</span>
    </div>
  )
}

function computeSleepMs(events: BabyEvent[], capAt: Date): number {
  const sleepEvents = events.filter(
    (e) => e.type === 'sleep_start' || e.type === 'sleep_end',
  )
  let total = 0
  let openStart: Date | null = null
  for (const e of sleepEvents) {
    if (e.type === 'sleep_start') {
      openStart = new Date(e.timestamp)
    } else if (e.type === 'sleep_end' && openStart) {
      total += new Date(e.timestamp).getTime() - openStart.getTime()
      openStart = null
    }
  }
  if (openStart !== null) {
    total += capAt.getTime() - openStart.getTime()
  }
  return total
}

function computeStats(events: BabyEvent[]) {
  const now = new Date()
  const todayStart = currentDayStart(now)

  const todayEvents = events.filter((e) => new Date(e.timestamp) >= todayStart)
  const feedCount = todayEvents.filter((e) => e.type === 'feed').length
  const diaperCount = todayEvents.filter((e) => e.type === 'diaper').length
  const totalSleepMs = computeSleepMs(todayEvents, now)

  // 7-day daily totals (days 1–7 before today)
  const dailyFeeds: number[] = []
  const dailyDiapers: number[] = []
  const dailySleepMs: number[] = []

  for (let d = 1; d <= 7; d++) {
    const dayStart = new Date(todayStart)
    dayStart.setDate(dayStart.getDate() - d)
    const dayEnd = new Date(todayStart)
    dayEnd.setDate(dayEnd.getDate() - d + 1)
    const dayEvents = events.filter((e) => {
      const t = new Date(e.timestamp)
      return t >= dayStart && t < dayEnd
    })
    dailyFeeds.push(dayEvents.filter((e) => e.type === 'feed').length)
    dailyDiapers.push(dayEvents.filter((e) => e.type === 'diaper').length)
    dailySleepMs.push(computeSleepMs(dayEvents, dayEnd))
  }

  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length

  const avgFeeds = avg(dailyFeeds)
  const avgDiapers = avg(dailyDiapers)
  const avgSleepMs = avg(dailySleepMs)

  // Scale: max across today + past 7 days so the bar never overflows
  const maxFeeds = Math.max(feedCount, ...dailyFeeds, 1)
  const maxDiapers = Math.max(diaperCount, ...dailyDiapers, 1)
  const maxSleepMs = Math.max(totalSleepMs, ...dailySleepMs, 1)

  return {
    feedCount,
    diaperCount,
    totalSleepMs,
    totalSleep: totalSleepMs > 0 ? formatDuration(totalSleepMs) : '—',
    avgFeeds,
    avgDiapers,
    avgSleepMs,
    maxFeeds,
    maxDiapers,
    maxSleepMs,
  }
}
