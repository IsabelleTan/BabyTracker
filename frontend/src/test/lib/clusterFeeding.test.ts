import { describe, it, expect } from 'vitest'
import { detectClusters } from '@/lib/clusterFeeding'
import type { BabyEvent } from '@/lib/events'

function feed(id: string, isoTime: string): BabyEvent {
  return { id, type: 'feed', timestamp: isoTime, logged_by: 'u1', display_name: 'P1', metadata: null }
}

describe('detectClusters', () => {
  it('returns empty when fewer than 3 feeds', () => {
    const events = [
      feed('1', '2024-01-15T21:00:00Z'),
      feed('2', '2024-01-15T21:30:00Z'),
    ]
    expect(detectClusters(events)).toHaveLength(0)
  })

  it('detects a 3-feed evening cluster', () => {
    const events = [
      feed('1', '2024-01-15T20:00:00Z'),
      feed('2', '2024-01-15T20:30:00Z'),
      feed('3', '2024-01-15T21:00:00Z'),
    ]
    const clusters = detectClusters(events)
    expect(clusters).toHaveLength(1)
    expect(clusters[0].eventIds.size).toBe(3)
  })

  it('does not detect a cluster outside the evening window (09:00)', () => {
    const events = [
      feed('1', '2024-01-15T09:00:00Z'),
      feed('2', '2024-01-15T09:30:00Z'),
      feed('3', '2024-01-15T10:00:00Z'),
    ]
    expect(detectClusters(events)).toHaveLength(0)
  })

  it('does not detect a cluster when intervals exceed 45 min', () => {
    const events = [
      feed('1', '2024-01-15T20:00:00Z'),
      feed('2', '2024-01-15T21:00:00Z'), // 60 min gap — too wide
      feed('3', '2024-01-15T21:30:00Z'),
    ]
    expect(detectClusters(events)).toHaveLength(0)
  })

  it('does not detect a cluster when window exceeds 2.5 hours', () => {
    // 3 feeds but spread over 3 hours
    const events = [
      feed('1', '2024-01-15T20:00:00Z'),
      feed('2', '2024-01-15T21:20:00Z'),
      feed('3', '2024-01-15T23:10:00Z'),
    ]
    expect(detectClusters(events)).toHaveLength(0)
  })

  it('includes non-feed events without affecting detection', () => {
    const events = [
      { id: 'd1', type: 'diaper' as const, timestamp: '2024-01-15T20:15:00Z', logged_by: 'u1', display_name: 'P1', metadata: null },
      feed('1', '2024-01-15T20:00:00Z'),
      feed('2', '2024-01-15T20:30:00Z'),
      feed('3', '2024-01-15T21:00:00Z'),
    ]
    const clusters = detectClusters(events)
    expect(clusters).toHaveLength(1)
    expect(clusters[0].eventIds.has('d1')).toBe(false)
  })
})
