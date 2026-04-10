import { useMemo } from 'react'
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
        <StatCell emoji="🍼" value={String(stats.feedCount)} label="feeds" />
        <StatCell emoji="😴" value={stats.totalSleep} label="sleep" />
        <StatCell emoji="💧" value={String(stats.diaperCount)} label="diapers" />
      </div>
      {(stats.avgFeedInterval !== null || stats.longestSleep !== null) && (
        <>
          <div className="h-px bg-border" />
          <div className="flex justify-around text-center text-xs text-muted-foreground">
            {stats.avgFeedInterval !== null && (
              <div>
                <div className="font-semibold text-foreground text-sm">
                  {stats.avgFeedInterval}
                </div>
                <div>avg feed interval</div>
              </div>
            )}
            {stats.longestSleep !== null && (
              <div>
                <div className="font-semibold text-foreground text-sm">
                  {stats.longestSleep}
                </div>
                <div>longest sleep</div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function StatCell({ emoji, value, label }: { emoji: string; value: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-xl">{emoji}</span>
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
  let longestSleepMs = 0
  const sleepEvents = events.filter(
    (e) => e.type === 'sleep_start' || e.type === 'sleep_end',
  )
  let openStart: Date | null = null
  for (const e of sleepEvents) {
    if (e.type === 'sleep_start') {
      openStart = new Date(e.timestamp)
    } else if (e.type === 'sleep_end' && openStart) {
      const duration = new Date(e.timestamp).getTime() - openStart.getTime()
      totalSleepMs += duration
      if (duration > longestSleepMs) longestSleepMs = duration
      openStart = null
    }
  }

  // Avg feed interval (today only, need at least 2 feeds)
  let avgFeedInterval: string | null = null
  if (feeds.length >= 2) {
    const intervals: number[] = []
    for (let i = 1; i < feeds.length; i++) {
      intervals.push(
        new Date(feeds[i].timestamp).getTime() - new Date(feeds[i - 1].timestamp).getTime(),
      )
    }
    avgFeedInterval = formatDuration(intervals.reduce((a, b) => a + b, 0) / intervals.length)
  }

  return {
    feedCount: feeds.length,
    diaperCount: diapers.length,
    totalSleep: totalSleepMs > 0 ? formatDuration(totalSleepMs) : '—',
    longestSleep: longestSleepMs > 0 ? formatDuration(longestSleepMs) : null,
    avgFeedInterval,
  }
}
