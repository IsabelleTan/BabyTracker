import { useMemo, useEffect, useRef, useState } from 'react'
import { Milk, Moon, Droplet, CirclePile, CircleDot, Cylinder, Sparkles, Users, type LucideIcon } from 'lucide-react'
import { formatDuration } from '@/hooks/useTimeSince'
import { getEventsSince, type BabyEvent } from '@/lib/events'
import { getUser } from '@/lib/auth'
import { useLeaderboardData } from '@/contexts/LeaderboardContext'
import { isNightHours } from '@/lib/time'
import { computeStats } from '@/lib/summaryStats'
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

