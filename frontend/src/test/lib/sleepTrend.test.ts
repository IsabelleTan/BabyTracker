import { describe, it, expect } from 'vitest'
import { detectSleepTrend } from '@/lib/sleepTrend'
import type { DailyStat } from '@/lib/stats'

function day(date: string, longest: number | null): DailyStat {
  return {
    date,
    feed_count: 0,
    avg_feed_interval_min: null,
    total_sleep_min: longest ?? 0,
    sleep_session_count: longest !== null ? 1 : 0,
    avg_sleep_session_min: longest,
    longest_sleep_session_min: longest,
    avg_wake_min: null,
    diaper_count: 0,
  }
}

function makeDays(longestValues: (number | null)[]): DailyStat[] {
  return longestValues.map((v, i) => {
    const d = new Date(2024, 0, i + 1)
    return day(d.toISOString().slice(0, 10), v)
  })
}

describe('detectSleepTrend', () => {
  it('returns not trending when fewer than 14 days with sleep data', () => {
    const stats = makeDays(Array(13).fill(120))
    expect(detectSleepTrend(stats).trending).toBe(false)
  })

  it('returns not trending when recent week is not meaningfully longer', () => {
    // prior 7 days avg = 120, recent 7 days avg = 130 (only 10 min gain)
    const stats = makeDays([...Array(7).fill(120), ...Array(7).fill(130)])
    expect(detectSleepTrend(stats).trending).toBe(false)
  })

  it('detects trend when recent 7-day avg exceeds prior by ≥20 min', () => {
    // prior avg = 120, recent avg = 150 (30 min gain)
    const stats = makeDays([...Array(7).fill(120), ...Array(7).fill(150)])
    const result = detectSleepTrend(stats)
    expect(result.trending).toBe(true)
    if (result.trending) expect(result.message).toBeTruthy()
  })

  it('ignores days with no sleep sessions', () => {
    // Days with null longest should not count toward the 14-day minimum
    const stats = makeDays([
      null, null, null,          // 3 no-data days
      ...Array(7).fill(120),     // prior 7
      ...Array(7).fill(150),     // recent 7 (30 min gain)
    ])
    expect(detectSleepTrend(stats).trending).toBe(true)
  })

  it('exactly at threshold (20 min) returns not trending', () => {
    const stats = makeDays([...Array(7).fill(120), ...Array(7).fill(140)])
    // avg gain is exactly 20 — need strictly greater
    expect(detectSleepTrend(stats).trending).toBe(false)
  })
})
