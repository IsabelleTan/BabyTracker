import type { BabyEvent } from './events'

/**
 * Predicts the next feed time using an EMA over historical intervals.
 *
 * Algorithm (feature-ideas.md §1):
 *  1. Exclude cluster intervals (< 45 min) — they are refuelling events,
 *     not representative of the underlying hunger cycle.
 *  2. Prefer intervals from feeds that started in the same ±3-hour window
 *     of day as the most recent feed (circadian bucketing).
 *  3. Fall back to all non-cluster intervals if the same-window set is
 *     smaller than MIN_SAME_WINDOW_INTERVALS.
 *  4. Apply EMA with α = 0.3 (weights recent intervals more heavily).
 *  5. Return null if there are fewer than 2 usable intervals.
 *
 * Sources:
 *  Gardner (1985), J Forecasting 4(1):1–28 — EMA vs SMA for non-stationary series.
 *  Cubero et al. (2005), Neuroendocrinology Letters 26(6):657–661 — circadian
 *    rhythm effects on breast-milk composition and infant feeding timing.
 */

const CLUSTER_INTERVAL_MS = 45 * 60_000    // 45 min
const EMA_ALPHA            = 0.3
const TIME_WINDOW_HOURS    = 3
const MIN_SAME_WINDOW      = 5              // prefer same-window if we have this many

/** Apply EMA (α = 0.3) to a non-empty array of values, oldest-first. */
function ema(values: number[]): number {
  return values.reduce((acc, v, i) =>
    i === 0 ? v : EMA_ALPHA * v + (1 - EMA_ALPHA) * acc,
  0)
}

/**
 * True when `hour` falls within TIME_WINDOW_HOURS of `target`, with
 * wrap-around (e.g. target = 1, hour = 23 → diff = 2 → true).
 */
function inTimeWindow(hour: number, target: number): boolean {
  const diff = Math.abs(hour - target)
  return Math.min(diff, 24 - diff) <= TIME_WINDOW_HOURS
}

/**
 * Predict the next feed time from a list of feed events (any order).
 * Returns null when there is insufficient data.
 */
export function predictNextFeed(feeds: BabyEvent[]): Date | null {
  if (feeds.length < 2) return null

  // Sort oldest → newest
  const sorted = [...feeds].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  )

  // Build (intervalMs, startHour) pairs between consecutive feeds
  const intervals: { ms: number; startHour: number }[] = []
  for (let i = 1; i < sorted.length; i++) {
    const ms = new Date(sorted[i].timestamp).getTime() -
               new Date(sorted[i - 1].timestamp).getTime()
    const startHour = new Date(sorted[i - 1].timestamp).getHours()
    intervals.push({ ms, startHour })
  }

  // Step 1 — exclude cluster intervals
  const nonCluster = intervals.filter((iv) => iv.ms >= CLUSTER_INTERVAL_MS)
  if (nonCluster.length < 1) return null

  // Step 2 — prefer same time-of-day window
  const lastHour = new Date(sorted[sorted.length - 1].timestamp).getHours()
  const sameWindow = nonCluster.filter((iv) => inTimeWindow(iv.startHour, lastHour))

  // Step 3 — choose which set to use
  const chosen = sameWindow.length >= MIN_SAME_WINDOW ? sameWindow : nonCluster
  if (chosen.length < 1) return null

  // Step 4 — EMA over chosen intervals (oldest-first order preserved)
  const predictedMs = ema(chosen.map((iv) => iv.ms))

  // Step 5 — project forward from last feed
  const lastFeedTime = new Date(sorted[sorted.length - 1].timestamp).getTime()
  return new Date(lastFeedTime + predictedMs)
}
