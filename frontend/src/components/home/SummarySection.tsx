import { useMemo, useEffect, useRef, useState } from 'react'
import { Milk, Moon, Droplet, CirclePile, CircleDot, Cylinder, Sparkles, Users, type LucideIcon } from 'lucide-react'
import { formatDuration } from '@/hooks/useTimeSince'
import { getEventsSince, type BabyEvent } from '@/lib/events'
import { getUser } from '@/lib/auth'
import { useLeaderboardData } from '@/contexts/LeaderboardContext'
import { isNightHours } from '@/lib/time'
import {
  getPartnerMessage,
  partnerMessageAllowed,
  recordPartnerMessageShown,
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot init; partnerMsg is not a dep so no cascade
    if (msg) setPartnerMsg(msg)
  }, [events])
  // Record the impression separately so it only fires when the message actually appears
  useEffect(() => {
    if (partnerMsg) recordPartnerMessageShown()
  }, [partnerMsg])

  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">
        Past 24h
      </h2>
      <div className="rounded-xl border border-primary/35 bg-surface p-4 flex flex-col gap-3">
        <div className="flex flex-col gap-3">
          {/* Feed section */}
          <div className="flex flex-col gap-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Feed</span>
            <StatBar
              icon={CircleDot}
              label="Breast"
              value={stats.breastMinTotal}
              valueStr={stats.breastMinTotal > 0 ? `${Math.round(stats.breastMinTotal)} min` : '—'}
              avg={stats.avgBreastMin}
              avgStr={stats.avgBreastMin > 0 ? `${Math.round(stats.avgBreastMin)}m` : ''}
              max={stats.maxBreastMin}
            />
            <StatBar
              icon={Milk}
              label="Pumped"
              value={stats.pumpedMlTotal}
              valueStr={stats.pumpedMlTotal > 0 ? `${Math.round(stats.pumpedMlTotal)} ml` : '—'}
              avg={stats.avgPumpedMl}
              avgStr={stats.avgPumpedMl > 0 ? `${Math.round(stats.avgPumpedMl)}ml` : ''}
              max={stats.maxBottleMl}
            />
            <StatBar
              icon={Cylinder}
              label="Formula"
              value={stats.formulaMlTotal}
              valueStr={stats.formulaMlTotal > 0 ? `${Math.round(stats.formulaMlTotal)} ml` : '—'}
              avg={stats.avgFormulaMl}
              avgStr={stats.avgFormulaMl > 0 ? `${Math.round(stats.avgFormulaMl)}ml` : ''}
              max={stats.maxBottleMl}
            />
          </div>

          {/* Output section */}
          <div className="flex flex-col gap-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Output</span>
            <StatBar
              icon={Droplet}
              label="Pee"
              value={stats.wetCount}
              valueStr={String(stats.wetCount)}
              avg={stats.avgWet}
              avgStr={stats.avgWet > 0 ? `${Math.round(stats.avgWet)}` : ''}
              max={stats.maxDiapers}
            />
            <StatBar
              icon={CirclePile}
              label="Poo"
              value={stats.dirtyCount}
              valueStr={String(stats.dirtyCount)}
              avg={stats.avgDirty}
              avgStr={stats.avgDirty > 0 ? `${Math.round(stats.avgDirty)}` : ''}
              max={stats.maxDiapers}
            />
          </div>

          {/* Sleep section */}
          <div className="flex flex-col gap-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Sleep</span>
            <StatBar
              icon={Moon}
              label="Sleep"
              value={stats.totalSleepMs}
              valueStr={stats.totalSleep}
              avg={stats.avgSleepMs}
              avgStr={stats.avgSleepMs > 0 ? formatDuration(stats.avgSleepMs) : ''}
              max={stats.maxSleepMs}
            />
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground/60">│ 7-day rolling avg</p>
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
  avgStr,
  max,
}: {
  icon: LucideIcon
  label: string
  value: number
  valueStr: string
  avg: number
  avgStr: string
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
          >
            {avgStr && (
              <span
                className="absolute bottom-full mb-0.5 left-1/2 -translate-x-1/2 text-[10px] leading-none text-primary/70 whitespace-nowrap"
              >
                {avgStr}
              </span>
            )}
          </div>
        )}
      </div>
      <span className="text-sm font-semibold w-16 text-right shrink-0">{valueStr}</span>
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

function diaperType(e: BabyEvent): string | undefined {
  return (e.metadata as { diaper_type?: string } | null)?.diaper_type
}

export function computeStats(events: BabyEvent[], now = new Date()) {
  const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000) // rolling 24-hour window

  const todayEvents = events.filter((e) => new Date(e.timestamp) >= windowStart)

  // Diaper breakdown (wet/dirty both count towards each)
  const todayDiapers = todayEvents.filter((e) => e.type === 'output')
  const wetCount = todayDiapers.filter((e) => {
    const t = diaperType(e)
    return t === 'wet' || t === 'both'
  }).length
  const dirtyCount = todayDiapers.filter((e) => {
    const t = diaperType(e)
    return t === 'dirty' || t === 'both'
  }).length

  // Feed breakdown: total breast minutes, pumped ml and formula ml
  let breastMinTotal = 0
  let pumpedMlTotal = 0
  let formulaMlTotal = 0
  for (const e of todayEvents.filter((e) => e.type === 'feed')) {
    const m = e.metadata as Record<string, unknown> | null
    if (m?.feed_type === 'breast') {
      breastMinTotal += ((m.left_duration_min as number) ?? 0) + ((m.right_duration_min as number) ?? 0)
    } else if (m?.feed_type === 'bottle') {
      const ml = (m.amount_ml as number) ?? 0
      if (m.bottle_type === 'formula') formulaMlTotal += ml
      else pumpedMlTotal += ml  // 'pumped' or legacy entries without bottle_type
    }
  }

  const totalSleepMs = computeSleepMs(todayEvents, now)

  // How many 24h windows to average over — capped at 7, but fewer if history is short
  const oldestMs = events.length > 0
    ? events.reduce((min, e) => Math.min(min, new Date(e.timestamp).getTime()), Infinity)
    : now.getTime()
  const nAvgDays = Math.min(Math.ceil((now.getTime() - oldestMs) / (24 * 60 * 60 * 1000)), 7)

  // Rolling averages: each "day" is a 24h window ending N×24h before now
  const dailyWets: number[] = []
  const dailyDirtys: number[] = []
  const dailyBreastMins: number[] = []
  const dailyPumpedMls: number[] = []
  const dailyFormulaMls: number[] = []
  const dailySleepMs: number[] = []

  for (let d = 1; d <= nAvgDays; d++) {
    const dayEnd = new Date(now.getTime() - (d - 1) * 24 * 60 * 60 * 1000)
    const dayStart = new Date(now.getTime() - d * 24 * 60 * 60 * 1000)
    const dayEvents = events.filter((e) => {
      const t = new Date(e.timestamp)
      return t >= dayStart && t < dayEnd
    })

    const dayDiapers = dayEvents.filter((e) => e.type === 'output')
    dailyWets.push(dayDiapers.filter((e) => { const t = diaperType(e); return t === 'wet' || t === 'both' }).length)
    dailyDirtys.push(dayDiapers.filter((e) => { const t = diaperType(e); return t === 'dirty' || t === 'both' }).length)

    let dBreastMin = 0
    let dPumpedMl = 0
    let dFormulaMl = 0
    for (const e of dayEvents.filter((e) => e.type === 'feed')) {
      const m = e.metadata as Record<string, unknown> | null
      if (m?.feed_type === 'breast') {
        dBreastMin += ((m.left_duration_min as number) ?? 0) + ((m.right_duration_min as number) ?? 0)
      } else if (m?.feed_type === 'bottle') {
        const ml = (m.amount_ml as number) ?? 0
        if (m.bottle_type === 'formula') dFormulaMl += ml
        else dPumpedMl += ml
      }
    }
    dailyBreastMins.push(dBreastMin)
    dailyPumpedMls.push(dPumpedMl)
    dailyFormulaMls.push(dFormulaMl)

    dailySleepMs.push(computeSleepMs(dayEvents, dayEnd))
  }

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0

  const avgWet = avg(dailyWets)
  const avgDirty = avg(dailyDirtys)
  const avgBreastMin = avg(dailyBreastMins)
  const avgPumpedMl = avg(dailyPumpedMls)
  const avgFormulaMl = avg(dailyFormulaMls)
  const avgSleepMs = avg(dailySleepMs)

  // Diapers share a max (same unit: count) so bars are comparable
  const maxDiapers = Math.max(wetCount, dirtyCount, ...dailyWets, ...dailyDirtys, 1)
  // Feeds use separate maxes (different units: min vs ml); pumped + formula share a max so bars are comparable
  const maxBreastMin = Math.max(breastMinTotal, ...dailyBreastMins, 1)
  const maxBottleMl = Math.max(pumpedMlTotal, formulaMlTotal, ...dailyPumpedMls, ...dailyFormulaMls, 1)
  const maxSleepMs = Math.max(totalSleepMs, ...dailySleepMs, 1)

  return {
    wetCount,
    dirtyCount,
    breastMinTotal,
    pumpedMlTotal,
    formulaMlTotal,
    totalSleepMs,
    totalSleep: totalSleepMs > 0 ? formatDuration(totalSleepMs) : '—',
    avgWet,
    avgDirty,
    avgBreastMin,
    avgPumpedMl,
    avgFormulaMl,
    avgSleepMs,
    maxDiapers,
    maxBreastMin,
    maxBottleMl,
    maxSleepMs,
  }
}
