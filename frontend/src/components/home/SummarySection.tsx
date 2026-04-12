import { useMemo, useEffect, useRef, useState } from 'react'
import { Milk, Moon, Droplets, Sparkles, Users, type LucideIcon } from 'lucide-react'
import { formatDuration } from '@/hooks/useTimeSince'
import type { BabyEvent } from '@/lib/events'
import { getUser } from '@/lib/auth'
import { getLeaderboards, buildNotifications } from '@/lib/leaderboards'
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
  const stats = useMemo(() => computeStats(events), [events])
  const [notifications, setNotifications] = useState<string[]>([])

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

  useEffect(() => {
    getLeaderboards()
      .then((data) => setNotifications(buildNotifications(data)))
      .catch(() => {/* silent — notifications are non-critical */})
  }, [])

  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">
        Today
      </h2>
      <div className="rounded-xl border border-primary/35 bg-surface p-4 flex flex-col gap-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <StatCell icon={Milk} value={String(stats.feedCount)} label="feeds" />
          <StatCell icon={Moon} value={stats.totalSleep} label="sleep" />
          <StatCell icon={Droplets} value={String(stats.diaperCount)} label="diapers" />
        </div>
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

function StatCell({ icon: Icon, value, label }: { icon: LucideIcon; value: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <Icon className="w-5 h-5 text-primary" />
      <span className="text-lg font-bold">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  )
}

function computeStats(events: BabyEvent[]) {
  const feeds = events.filter((e) => e.type === 'feed')
  const diapers = events.filter((e) => e.type === 'diaper')

  // Total sleep: sum completed sleep blocks
  let totalSleepMs = 0
  const sleepEvents = events.filter(
    (e) => e.type === 'sleep_start' || e.type === 'sleep_end',
  )
  let openStart: Date | null = null
  for (const e of sleepEvents) {
    if (e.type === 'sleep_start') {
      openStart = new Date(e.timestamp)
    } else if (e.type === 'sleep_end' && openStart) {
      totalSleepMs += new Date(e.timestamp).getTime() - openStart.getTime()
      openStart = null
    }
  }
  // Include the ongoing (not yet ended) session so the panel doesn't show '—'
  // while the baby is still asleep.
  if (openStart !== null) {
    totalSleepMs += Date.now() - openStart.getTime()
  }

  return {
    feedCount: feeds.length,
    diaperCount: diapers.length,
    totalSleep: totalSleepMs > 0 ? formatDuration(totalSleepMs) : '—',
  }
}
