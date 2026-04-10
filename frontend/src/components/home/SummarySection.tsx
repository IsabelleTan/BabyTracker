import { useMemo, useEffect, useState } from 'react'
import { Milk, Moon, Droplets, Sparkles, type LucideIcon } from 'lucide-react'
import { formatDuration } from '@/hooks/useTimeSince'
import type { BabyEvent } from '@/lib/events'
import { getLeaderboards } from '@/lib/leaderboards'

interface Props {
  events: BabyEvent[]
}

export default function SummarySection({ events }: Props) {
  const stats = useMemo(() => computeStats(events), [events])
  const [notifications, setNotifications] = useState<string[]>([])

  useEffect(() => {
    getLeaderboards().then((data) => {
      if (!data.has_enough_data) return
      const msgs: string[] = []
      if (data.longest_sleep_new) msgs.push('New longest sleep record!')
      if (data.best_night_new) msgs.push('New best night record!')
      if (data.most_feeds_new) msgs.push('New most feeds in a day record!')
      if (data.most_poop_new) msgs.push('New most poop diapers record!')
      if (data.night_shift_claimed_today) msgs.push('Night Shift Ninja title changed hands!')
      if (data.chief_log_claimed_today) msgs.push('Chief Log Officer title changed hands!')
      if (data.poop_award_claimed_today) msgs.push('Number One at Number Two title changed hands!')
      setNotifications(msgs)
    }).catch(() => {/* silent — notifications are non-critical */})
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

  return {
    feedCount: feeds.length,
    diaperCount: diapers.length,
    totalSleep: totalSleepMs > 0 ? formatDuration(totalSleepMs) : '—',
  }
}
