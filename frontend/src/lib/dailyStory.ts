import type { BabyEvent } from './events'
import { detectClusters } from './clusterFeeding'

export interface DailyStorySummary {
  feedCount: number
  /** Total completed sleep in milliseconds. */
  totalSleepMs: number
  diaperCount: number
  hasCluster: boolean
}

/** Compute the summary stats used to drive the daily story message. */
export function computeDailyStory(events: BabyEvent[]): DailyStorySummary {
  const feedCount = events.filter((e) => e.type === 'feed').length
  const diaperCount = events.filter((e) => e.type === 'diaper').length

  let totalSleepMs = 0
  let openStart: Date | null = null
  for (const e of events) {
    if (e.type === 'sleep_start') {
      openStart = new Date(e.timestamp)
    } else if (e.type === 'sleep_end' && openStart) {
      totalSleepMs += new Date(e.timestamp).getTime() - openStart.getTime()
      openStart = null
    }
  }

  const hasCluster = detectClusters(events).length > 0

  return { feedCount, totalSleepMs, diaperCount, hasCluster }
}

/**
 * Returns a one-sentence tone message based on the day's stats.
 * Never mentions numbers — those appear in the summary line above.
 */
export function getDailyMessage(s: DailyStorySummary): string {
  const sleepHours = s.totalSleepMs / 3_600_000

  if (s.hasCluster) return "Busy evening but you got through it."
  if (s.feedCount >= 12) return "Busy feeding day — could be a growth spurt. Totally normal."
  if (sleepHours >= 15) return "Good sleep today. Rest up, you've earned it."
  if (sleepHours > 0 && sleepHours < 10) return "Tough sleep day. These happen — it won't always be like this."
  if (s.feedCount >= 8 && sleepHours >= 12) return "A solid day. Steady rhythm, good balance."
  return "Quiet, consistent day. That's a win."
}

/**
 * Whether the daily story card should be visible.
 * Shows after 18:00 local time when at least one event has been logged.
 */
export function shouldShowDailyStory(events: BabyEvent[], now = new Date()): boolean {
  return now.getHours() >= 18 && events.length > 0
}
