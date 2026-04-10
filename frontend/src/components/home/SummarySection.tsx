import { useMemo } from 'react'
import { Milk, Moon, Droplets, type LucideIcon } from 'lucide-react'
import { formatDuration } from '@/hooks/useTimeSince'
import type { BabyEvent } from '@/lib/events'

interface Props {
  events: BabyEvent[]
}

export default function SummarySection({ events }: Props) {
  const stats = useMemo(() => computeStats(events), [events])

  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Today
      </h2>
      <div className="grid grid-cols-3 gap-2 text-center">
        <StatCell icon={Milk} value={String(stats.feedCount)} label="feeds" />
        <StatCell icon={Moon} value={stats.totalSleep} label="sleep" />
        <StatCell icon={Droplets} value={String(stats.diaperCount)} label="diapers" />
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
