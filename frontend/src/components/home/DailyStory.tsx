import { useState, useMemo } from 'react'
import { BookOpen } from 'lucide-react'
import type { BabyEvent } from '@/lib/events'
import { computeDailyStory, getDailyMessage, shouldShowDailyStory } from '@/lib/dailyStory'
import { formatDurationMs } from '@/lib/time'

interface Props {
  events: BabyEvent[]
}

export default function DailyStory({ events }: Props) {
  const [dismissed, setDismissed] = useState(false)

  const visible = useMemo(() => shouldShowDailyStory(events), [events])
  const summary = useMemo(() => computeDailyStory(events), [events])
  const message = useMemo(() => getDailyMessage(summary), [summary])

  if (!visible || dismissed) return null

  const sleepLabel =
    summary.totalSleepMs > 0 ? formatDurationMs(summary.totalSleepMs) : '—'

  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">
        Daily story
      </h2>
      <div className="rounded-xl border border-primary/35 bg-surface px-4 py-3 flex gap-3">
        <BookOpen className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground">
            {summary.feedCount} feeds&nbsp;·&nbsp;{sleepLabel} sleep&nbsp;·&nbsp;{summary.diaperCount} diapers
          </p>
          <p className="text-sm text-foreground mt-0.5">{message}</p>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-muted-foreground hover:text-foreground text-xs shrink-0 leading-none pt-0.5"
          aria-label="Dismiss daily story"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
