import { useEffect, useRef, useState } from 'react'
import { Milk, Moon, Droplet, CirclePile, CircleDot, Cylinder, Sparkles, Users, type LucideIcon } from 'lucide-react'
import { type BabyEvent } from '@/lib/events'
import { getUser } from '@/lib/auth'
import { useLeaderboardData } from '@/contexts/LeaderboardContext'
import { isNightHours, formatDuration } from '@/lib/time'
import { getSummaryStats, type SummaryStats } from '@/lib/stats'
import {
  getPartnerMessage,
  partnerMessageAllowed,
  recordPartnerMessageShown,
  type PartnerMessageResult,
} from '@/lib/funMessages'

interface Props {
  events: BabyEvent[]
  lastSynced: Date | null
}

export default function SummarySection({ events, lastSynced }: Props) {
  const [stats, setStats] = useState<SummaryStats | null>(null)

  useEffect(() => {
    getSummaryStats().then(setStats).catch(() => {})
  }, [lastSynced])

  const { notifications } = useLeaderboardData()

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

  useEffect(() => {
    if (partnerMsg) recordPartnerMessageShown()
  }, [partnerMsg])

  if (!stats) return null

  const sleepMins = Math.round(stats.sleep_min.current)
  const sleepAvg = Math.round(stats.sleep_min.average)
  const sleepMax = Math.max(sleepMins, sleepAvg, 1)

  const breast = { current: Math.round(stats.breast_min.current), average: Math.round(stats.breast_min.average), scale: Math.max(stats.breast_min.current, stats.breast_min.average, 1) }
  const pumped = { current: Math.round(stats.pumped_ml.current), average: Math.round(stats.pumped_ml.average), scale: Math.max(stats.pumped_ml.current, stats.pumped_ml.average, stats.formula_ml.current, stats.formula_ml.average, 1) }
  const formula = { current: Math.round(stats.formula_ml.current), average: Math.round(stats.formula_ml.average), scale: pumped.scale }
  const wet = { current: Math.round(stats.wet.current), average: Math.round(stats.wet.average), scale: Math.max(stats.wet.current, stats.wet.average, stats.dirty.current, stats.dirty.average, 1) }
  const dirty = { current: Math.round(stats.dirty.current), average: Math.round(stats.dirty.average), scale: wet.scale }
  const sleep = { current: sleepMins, average: sleepAvg, scale: sleepMax }

  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">
        Today
      </h2>
      <div className="rounded-xl border border-primary/35 bg-surface p-4 flex flex-col gap-3">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Feed</span>
            <StatBar icon={CircleDot} label="Breast"  stat={breast}  format={(v) => v > 0 ? `${v} min` : '—'} />
            <StatBar icon={Milk}      label="Pumped"  stat={pumped}  format={(v) => v > 0 ? `${v} ml`  : '—'} />
            <StatBar icon={Cylinder}  label="Formula" stat={formula} format={(v) => v > 0 ? `${v} ml`  : '—'} />
          </div>

          <div className="flex flex-col gap-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Output</span>
            <StatBar icon={Droplet}    label="Pee" stat={wet}   format={String} />
            <StatBar icon={CirclePile} label="Poo" stat={dirty} format={String} />
          </div>

          <div className="flex flex-col gap-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Sleep</span>
            <StatBar icon={Moon} label="Sleep" stat={sleep} format={(v) => v > 0 ? formatDuration(v) : '—'} />
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

interface StatValue {
  current: number
  average: number
  scale: number
}

function StatBar({
  icon: Icon,
  label,
  stat,
  format,
}: {
  icon: LucideIcon
  label: string
  stat: StatValue
  format: (v: number) => string
}) {
  const pct = stat.scale > 0 ? Math.min((stat.current / stat.scale) * 100, 100) : 0
  const avgPct = stat.scale > 0 ? Math.min((stat.average / stat.scale) * 100, 100) : 0

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
        {stat.average > 0 && (
          <div
            className="absolute top-1/2 -translate-y-1/2 w-[2px] h-5 bg-primary/70 rounded-full"
            style={{ left: `${avgPct}%` }}
          >
            <span
              className="absolute bottom-full mb-0.5 left-1/2 -translate-x-1/2 text-[10px] leading-none text-primary/70 whitespace-nowrap"
            >
              {format(stat.average)}
            </span>
          </div>
        )}
      </div>
      <span className="text-sm font-semibold w-16 text-right shrink-0">{format(stat.current)}</span>
    </div>
  )
}
