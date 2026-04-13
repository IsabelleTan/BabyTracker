import { describe, it, expect } from 'vitest'
import { detectSleepTrend } from '@/lib/sleepTrend'
import type { DailyStat } from '@/lib/stats'

function makeStat(date: string, longest_sleep_session_min: number | null): DailyStat {
  return {
    date,
    feed_count: 0,
    avg_feed_interval_min: null,
    total_sleep_min: 0,
    sleep_session_count: 0,
    avg_sleep_session_min: null,
    longest_sleep_session_min,
    avg_wake_min: null,
    diaper_count: 0,
  }
}

function makeStats(values: (number | null)[]): DailyStat[] {
  return values.map((v, i) => makeStat(`2024-01-${String(i + 1).padStart(2, '0')}`, v))
}

describe('detectSleepTrend', () => {
  it('returns trending: false when fewer than 14 days with sleep data', () => {
    const stats = makeStats(Array(13).fill(120))
    expect(detectSleepTrend(stats)).toEqual({ trending: false })
  })

  it('returns trending: false when null days reduce qualifying days below 14', () => {
    // 13 days with data, 2 nulls — only 13 qualify
    const values = [...Array(13).fill(120), null, null]
    const stats = makeStats(values)
    expect(detectSleepTrend(stats)).toEqual({ trending: false })
  })

  it('returns trending: false when recent week is not 20+ min above prior week', () => {
    // prior 7 days avg = 120, current 7 days avg = 139 (only 19 min above)
    const stats = makeStats([...Array(7).fill(120), ...Array(7).fill(139)])
    expect(detectSleepTrend(stats)).toEqual({ trending: false })
  })

  it('returns trending: true with message when recent week exceeds prior by >20 min', () => {
    // prior avg = 120, current avg = 141 → delta = 21
    const stats = makeStats([...Array(7).fill(120), ...Array(7).fill(141)])
    const result = detectSleepTrend(stats)
    expect(result.trending).toBe(true)
    if (result.trending) {
      expect(result.message).toBeTruthy()
    }
  })

  it('uses only the most recent 14 days with sleep data', () => {
    // 21 days: first 7 are high (200), next 7 are low prior (120), last 7 are just barely trending (141)
    const stats = makeStats([...Array(7).fill(200), ...Array(7).fill(120), ...Array(7).fill(141)])
    // Should only look at last 14: prior=120, current=141 → 21 min delta → trending
    const result = detectSleepTrend(stats)
    expect(result.trending).toBe(true)
  })

  it('skips null days when building the rolling window', () => {
    // 14 non-null days (7×120, 7×141) embedded among nulls
    const values: (number | null)[] = [
      null, 120, null, 120, 120, 120, 120, 120, 120, null,
      141, 141, 141, 141, 141, 141, 141, null,
    ]
    const stats = makeStats(values)
    const result = detectSleepTrend(stats)
    expect(result.trending).toBe(true)
  })
})
