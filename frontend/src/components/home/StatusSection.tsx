import { useMemo } from 'react'
import { useTimeSince, formatDuration } from '@/hooks/useTimeSince'
import type { BabyEvent } from '@/lib/events'

interface Props {
  todayEvents: BabyEvent[]
  lastFeeds: BabyEvent[]  // last 3 feeds (cross-day), oldest first
}

export default function StatusSection({ todayEvents, lastFeeds }: Props) {
  const lastFeed = useMemo(() => {
    const feeds = todayEvents.filter((e) => e.type === 'feed')
    return feeds.length > 0 ? new Date(feeds[feeds.length - 1].timestamp) : null
  }, [todayEvents])

  const sleepStatus = useMemo(() => {
    const sleepEvents = todayEvents.filter(
      (e) => e.type === 'sleep_start' || e.type === 'sleep_end',
    )
    const last = sleepEvents.at(-1)
    if (!last) return null
    return { sleeping: last.type === 'sleep_start', since: new Date(last.timestamp) }
  }, [todayEvents])

  const nextFeedEst = useMemo(() => {
    if (lastFeeds.length < 2) return null
    // Compute intervals between consecutive feeds
    const intervals: number[] = []
    for (let i = 1; i < lastFeeds.length; i++) {
      const diff =
        new Date(lastFeeds[i].timestamp).getTime() -
        new Date(lastFeeds[i - 1].timestamp).getTime()
      intervals.push(diff)
    }
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length
    const lastFeedTime = new Date(lastFeeds[lastFeeds.length - 1].timestamp)
    return new Date(lastFeedTime.getTime() + avgInterval)
  }, [lastFeeds])

  const timeSinceLastFeed = useTimeSince(lastFeed)

  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3">
      <StatusRow
        label="Last feed"
        value={timeSinceLastFeed}
        sub={lastFeed ? formatTime(lastFeed) : undefined}
      />
      <div className="h-px bg-border" />
      <StatusRow
        label={sleepStatus?.sleeping ? 'Asleep since' : 'Awake since'}
        value={sleepStatus ? formatTime(sleepStatus.since) : '—'}
        sub={
          sleepStatus
            ? formatDuration(Date.now() - sleepStatus.since.getTime())
            : undefined
        }
      />
      <div className="h-px bg-border" />
      <StatusRow
        label="Next feed est."
        value={nextFeedEst ? formatTime(nextFeedEst) : '—'}
        sub={nextFeedEst ? `in ~${formatDuration(Math.max(0, nextFeedEst.getTime() - Date.now()))}` : 'need 2+ feeds'}
      />
    </div>
  )
}

function StatusRow({
  label,
  value,
  sub,
}: {
  label: string
  value: string
  sub?: string
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="text-right">
        <span className="text-sm font-semibold">{value}</span>
        {sub && <span className="text-xs text-muted-foreground ml-2">{sub}</span>}
      </div>
    </div>
  )
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
