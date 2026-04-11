import { describe, it, expect } from 'vitest'
import { computeDailyStory, getDailyMessage, shouldShowDailyStory } from '@/lib/dailyStory'
import type { BabyEvent } from '@/lib/events'

function feed(id: string, isoTime: string): BabyEvent {
  return { id, type: 'feed', timestamp: isoTime, logged_by: 'u1', display_name: 'P1', metadata: null }
}

function sleep(id: string, isoTime: string, end: boolean = false): BabyEvent {
  return { id, type: end ? 'sleep_end' : 'sleep_start', timestamp: isoTime, logged_by: 'u1', display_name: 'P1', metadata: null }
}

function diaper(id: string, isoTime: string): BabyEvent {
  return { id, type: 'diaper', timestamp: isoTime, logged_by: 'u1', display_name: 'P1', metadata: null }
}

describe('computeDailyStory', () => {
  it('counts feeds and diapers correctly', () => {
    const events = [
      feed('f1', '2024-01-15T08:00:00Z'),
      feed('f2', '2024-01-15T10:00:00Z'),
      diaper('d1', '2024-01-15T09:00:00Z'),
    ]
    const s = computeDailyStory(events)
    expect(s.feedCount).toBe(2)
    expect(s.diaperCount).toBe(1)
  })

  it('sums completed sleep blocks', () => {
    const events = [
      sleep('s1', '2024-01-15T00:00:00Z'),
      sleep('s2', '2024-01-15T02:00:00Z', true), // 2h
      sleep('s3', '2024-01-15T10:00:00Z'),
      sleep('s4', '2024-01-15T13:00:00Z', true), // 3h
    ]
    const s = computeDailyStory(events)
    expect(s.totalSleepMs).toBe(5 * 60 * 60 * 1000)
  })

  it('ignores open sleep block at end of day', () => {
    const events = [
      sleep('s1', '2024-01-15T20:00:00Z'), // still sleeping — no end
    ]
    const s = computeDailyStory(events)
    expect(s.totalSleepMs).toBe(0)
  })

  it('detects cluster when present', () => {
    const events = [
      feed('f1', '2024-01-15T20:00:00Z'),
      feed('f2', '2024-01-15T20:30:00Z'),
      feed('f3', '2024-01-15T21:00:00Z'),
    ]
    expect(computeDailyStory(events).hasCluster).toBe(true)
  })
})

describe('getDailyMessage', () => {
  it('returns cluster message when cluster present', () => {
    const msg = getDailyMessage({ feedCount: 8, totalSleepMs: 12 * 3_600_000, diaperCount: 4, hasCluster: true })
    expect(msg).toContain('evening')
  })

  it('returns growth spurt message for high feed count', () => {
    const msg = getDailyMessage({ feedCount: 13, totalSleepMs: 0, diaperCount: 4, hasCluster: false })
    expect(msg).toContain('growth spurt')
  })

  it('returns good sleep message for ≥15h sleep', () => {
    const msg = getDailyMessage({ feedCount: 8, totalSleepMs: 15 * 3_600_000, diaperCount: 4, hasCluster: false })
    expect(msg).toContain('sleep')
  })

  it('returns tough sleep message for <10h sleep', () => {
    const msg = getDailyMessage({ feedCount: 6, totalSleepMs: 8 * 3_600_000, diaperCount: 3, hasCluster: false })
    expect(msg).toContain('Tough sleep')
  })

  it('returns solid day message for normal stats', () => {
    const msg = getDailyMessage({ feedCount: 9, totalSleepMs: 14 * 3_600_000, diaperCount: 6, hasCluster: false })
    expect(msg).toContain('solid day')
  })
})

describe('shouldShowDailyStory', () => {
  it('returns false before 18:00', () => {
    const events = [feed('f1', '2024-01-15T08:00:00Z')]
    const now = new Date('2024-01-15T17:59:00')
    expect(shouldShowDailyStory(events, now)).toBe(false)
  })

  it('returns true at 18:00 with events', () => {
    const events = [feed('f1', '2024-01-15T08:00:00Z')]
    const now = new Date('2024-01-15T18:00:00')
    expect(shouldShowDailyStory(events, now)).toBe(true)
  })

  it('returns false at 18:00 with no events', () => {
    const now = new Date('2024-01-15T20:00:00')
    expect(shouldShowDailyStory([], now)).toBe(false)
  })
})
