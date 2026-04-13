import type { DailyStat } from './stats'

/** Minimum daily rows needed before we signal a trend. */
const MIN_DAYS = 14
/** How many minutes longer the recent week's longest stretch must be. */
const TREND_THRESHOLD_MIN = 20

export type SleepTrendResult =
  | { trending: true; message: string }
  | { trending: false }

/**
 * Returns a positive sleep trend signal when the longest sleep stretch
 * averaged over the most recent 7 days exceeds the prior 7-day average
 * by at least 20 minutes.
 *
 * Requires ≥14 days of data. Only days with at least one completed sleep
 * session contribute to the rolling window.
 *
 * Source: Henderson et al. (2010), Pediatrics 126(3):e590–e597 —
 * the longest uninterrupted stretch is the clinically meaningful
 * consolidation metric, not total sleep.
 */
export function detectSleepTrend(stats: DailyStat[]): SleepTrendResult {
  // Only consider days that have sleep data
  const withSleep = stats.filter((d) => d.longest_sleep_session_min !== null)
  if (withSleep.length < MIN_DAYS) return { trending: false }

  // Take the most recent MIN_DAYS days with sleep data
  const recent = withSleep.slice(-MIN_DAYS)
  const prior = recent.slice(0, 7)
  const current = recent.slice(7)

  const avg = (rows: DailyStat[]) =>
    rows.reduce((sum, d) => sum + (d.longest_sleep_session_min ?? 0), 0) / rows.length

  const priorAvg = avg(prior)
  const currentAvg = avg(current)

  if (currentAvg > priorAvg + TREND_THRESHOLD_MIN) {
    return { trending: true, message: "Longest sleep stretch is gradually growing." }
  }
  return { trending: false }
}
