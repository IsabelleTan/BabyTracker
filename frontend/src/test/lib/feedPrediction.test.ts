import { describe, it, expect } from 'vitest'
import { predictNextFeed } from '@/lib/feedPrediction'
import type { BabyEvent } from '@/lib/events'

function feed(id: string, isoTime: string): BabyEvent {
  return { id, type: 'feed', timestamp: isoTime, logged_by: 'u1', display_name: 'P1', metadata: null }
}

/** Build a feed at a fixed date, given hour + minute. */
function f(id: string, hour: number, minute = 0): BabyEvent {
  const d = new Date(2024, 0, 15, hour, minute)
  return feed(id, d.toISOString())
}

/** Build a feed N minutes after a base ISO string. */
function after(base: string, offsetMin: number): BabyEvent {
  const t = new Date(new Date(base).getTime() + offsetMin * 60_000)
  return feed(`f-${offsetMin}`, t.toISOString())
}

describe('predictNextFeed', () => {
  it('returns null with fewer than 2 feeds', () => {
    expect(predictNextFeed([])).toBeNull()
    expect(predictNextFeed([f('a', 10)])).toBeNull()
  })

  it('returns null when all intervals are cluster intervals (< 45 min)', () => {
    const feeds = [f('a', 19, 0), f('b', 19, 30), f('c', 20, 0)]
    expect(predictNextFeed(feeds)).toBeNull()
  })

  it('excludes cluster intervals from EMA', () => {
    // Two normal ~120-min intervals, then a cluster 20-min interval
    // The prediction should be close to 120 min, not pulled down by the cluster
    const base = '2024-01-15T10:00:00.000Z'
    const feeds = [
      after(base, 0),    // 10:00
      after(base, 120),  // 12:00  → 120-min interval
      after(base, 240),  // 14:00  → 120-min interval
      after(base, 260),  // 14:20  → 20-min cluster (excluded)
    ]
    const result = predictNextFeed(feeds)
    expect(result).not.toBeNull()
    const lastFeed = new Date(base).getTime() + 260 * 60_000
    const predictedIntervalMin = (result!.getTime() - lastFeed) / 60_000
    // Should be close to 120 min (EMA of [120, 120]), not 93 min (EMA including 20)
    expect(predictedIntervalMin).toBeGreaterThan(100)
    expect(predictedIntervalMin).toBeLessThan(140)
  })

  it('computes EMA correctly for simple case', () => {
    // Two feeds 120 min apart — EMA of single interval = 120 min
    const base = '2024-01-15T10:00:00.000Z'
    const feeds = [after(base, 0), after(base, 120)]
    const result = predictNextFeed(feeds)
    expect(result).not.toBeNull()
    const lastFeed = new Date(base).getTime() + 120 * 60_000
    const predictedIntervalMin = (result!.getTime() - lastFeed) / 60_000
    expect(predictedIntervalMin).toBeCloseTo(120, 0)
  })

  it('EMA weights later intervals more than earlier ones', () => {
    // Intervals: 180, 180, 180, 60 — recent short interval should pull prediction down
    const base = '2024-01-15T00:00:00.000Z'
    const feeds = [
      after(base, 0),
      after(base, 180),   // +180
      after(base, 360),   // +180
      after(base, 540),   // +180
      after(base, 600),   // +60  ← recent short interval (still ≥45 min so not excluded)
    ]
    const result = predictNextFeed(feeds)
    expect(result).not.toBeNull()
    const lastFeed = new Date(base).getTime() + 600 * 60_000
    const predictedIntervalMin = (result!.getTime() - lastFeed) / 60_000
    // Pure average would be (180+180+180+60)/4 = 150; EMA with α=0.3 weights recent more
    // so prediction should be below 150
    expect(predictedIntervalMin).toBeLessThan(150)
    expect(predictedIntervalMin).toBeGreaterThan(60)
  })

  it('falls back to all non-cluster intervals when same-window set is too small', () => {
    // Only 2 same-window feeds (< MIN_SAME_WINDOW=5) — should still return a result
    // using the broader non-cluster set
    const base = '2024-01-15T10:00:00.000Z'
    const feeds = [after(base, 0), after(base, 90), after(base, 180)]
    const result = predictNextFeed(feeds)
    expect(result).not.toBeNull()
  })

  it('projects from the most recent feed timestamp', () => {
    const base = '2024-01-15T10:00:00.000Z'
    const feeds = [after(base, 0), after(base, 120)]
    const result = predictNextFeed(feeds)
    const lastFeedTime = new Date(base).getTime() + 120 * 60_000
    // Result must be after the last feed
    expect(result!.getTime()).toBeGreaterThan(lastFeedTime)
  })
})
