import { describe, it, expect } from 'vitest'
import { nextFeedEstimate } from '@/pages/Home'
import type { BabyEvent } from '@/lib/events'

function feed(isoTime: string): BabyEvent {
  return {
    id: Math.random().toString(36).slice(2),
    type: 'feed',
    timestamp: isoTime,
    logged_by: 'u1',
    display_name: 'Parent 1',
    metadata: null,
  }
}

describe('nextFeedEstimate', () => {
  it('returns null with fewer than 2 feeds', () => {
    expect(nextFeedEstimate([])).toBeNull()
    expect(nextFeedEstimate([feed('2024-01-15T08:00:00Z')])).toBeNull()
  })

  it('estimates next feed from a single interval', () => {
    // Two feeds 3 hours apart → next expected 3 hours after the last
    const feeds = [
      feed('2024-01-15T08:00:00Z'),
      feed('2024-01-15T11:00:00Z'),
    ]
    const result = nextFeedEstimate(feeds)!
    expect(result.toISOString()).toBe('2024-01-15T14:00:00.000Z')
  })

  it('averages multiple intervals', () => {
    // Intervals: 2h, 4h → avg 3h → next = last + 3h
    const feeds = [
      feed('2024-01-15T06:00:00Z'),
      feed('2024-01-15T08:00:00Z'),
      feed('2024-01-15T12:00:00Z'),
    ]
    const result = nextFeedEstimate(feeds)!
    expect(result.toISOString()).toBe('2024-01-15T15:00:00.000Z')
  })

  it('uses all feeds to compute the average', () => {
    // 4 feeds: intervals of 1h, 1h, 4h → avg 2h → next = last + 2h
    const feeds = [
      feed('2024-01-15T06:00:00Z'),
      feed('2024-01-15T07:00:00Z'),
      feed('2024-01-15T08:00:00Z'),
      feed('2024-01-15T12:00:00Z'),
    ]
    const result = nextFeedEstimate(feeds)!
    expect(result.toISOString()).toBe('2024-01-15T14:00:00.000Z')
  })
})
