import { describe, it, expect } from 'vitest'
import {
  getBabyVoiceContext,
  bothPartnersLogged,
  type BabyVoiceContext,
} from '@/lib/funMessages'
import type { BabyEvent } from '@/lib/events'

// ── helpers ───────────────────────────────────────────────────────────────────

function makeEvent(
  type: BabyEvent['type'],
  isoTime: string,
  loggedBy = 'user-1',
): BabyEvent {
  return {
    id: Math.random().toString(),
    type,
    timestamp: isoTime,
    logged_by: loggedBy,
    display_name: 'Test',
    metadata: null,
  }
}

/** Build a timestamp string for today at the given hour:minute */
function today(h: number, m = 0): string {
  const d = new Date()
  d.setHours(h, m, 0, 0)
  return d.toISOString()
}

// ── getBabyVoiceContext ───────────────────────────────────────────────────────

describe('getBabyVoiceContext', () => {
  it('returns "normal" for a typical day with a handful of events', () => {
    const events = [
      makeEvent('feed', today(8)),
      makeEvent('feed', today(11)),
      makeEvent('feed', today(14)),
      makeEvent('diaper', today(9)),
      makeEvent('diaper', today(13)),
    ]
    expect(getBabyVoiceContext(events)).toBe('normal')
  })

  it('returns "many_feeds" when feed count is ≥ 9', () => {
    const events = Array.from({ length: 9 }, (_, i) =>
      makeEvent('feed', today(6 + i)),
    )
    expect(getBabyVoiceContext(events)).toBe('many_feeds')
  })

  it('returns "quiet" when there are ≤ 3 events', () => {
    const events = [makeEvent('feed', today(9)), makeEvent('diaper', today(10))]
    expect(getBabyVoiceContext(events)).toBe('quiet')
  })

  it('returns "long_nap" when a completed sleep block is ≥ 3 hours', () => {
    const events = [
      makeEvent('sleep_start', today(10, 0)),
      makeEvent('sleep_end',   today(13, 30)),
      makeEvent('feed', today(8)),
      makeEvent('feed', today(14)),
    ]
    expect(getBabyVoiceContext(events)).toBe('long_nap')
  })

  it('does not return "long_nap" for a sleep block under 3 hours', () => {
    const events = [
      makeEvent('sleep_start', today(10, 0)),
      makeEvent('sleep_end',   today(12, 59)),
      makeEvent('feed', today(8)),
      makeEvent('feed', today(13)),
    ]
    expect(getBabyVoiceContext(events)).not.toBe('long_nap')
  })

  it('returns "cluster" for ≥ 2 short-gap evening feeds', () => {
    // Three evening feeds each ~30 min apart → 2 short gaps
    const events = [
      makeEvent('feed', today(19, 0)),
      makeEvent('feed', today(19, 30)),
      makeEvent('feed', today(20, 0)),
      makeEvent('feed', today(9)),
    ]
    expect(getBabyVoiceContext(events)).toBe('cluster')
  })

  it('does not return "cluster" when evening gaps are ≥ 45 min', () => {
    const events = [
      makeEvent('feed', today(19, 0)),
      makeEvent('feed', today(19, 50)),
      makeEvent('feed', today(20, 40)),
    ]
    const ctx = getBabyVoiceContext(events)
    expect(ctx).not.toBe('cluster')
  })

  it('returns "chaotic" when there are ≥ 20 events with no other trigger', () => {
    const events = Array.from({ length: 20 }, (_, i) =>
      makeEvent('diaper', today(6 + Math.floor(i / 2), (i % 2) * 30)),
    )
    expect(getBabyVoiceContext(events)).toBe('chaotic')
  })

  it('cluster takes priority over many_feeds', () => {
    // 9 feeds including 3 clustered evening feeds
    const events = [
      ...Array.from({ length: 6 }, (_, i) => makeEvent('feed', today(7 + i))),
      makeEvent('feed', today(19, 0)),
      makeEvent('feed', today(19, 30)),
      makeEvent('feed', today(20, 0)),
    ]
    expect(getBabyVoiceContext(events)).toBe('cluster')
  })
})

// ── bothPartnersLogged ────────────────────────────────────────────────────────

describe('bothPartnersLogged', () => {
  it('returns false when only one user has logged', () => {
    const events = [
      makeEvent('feed', today(8), 'user-1'),
      makeEvent('diaper', today(9), 'user-1'),
    ]
    expect(bothPartnersLogged(events)).toBe(false)
  })

  it('returns true when two distinct users have logged', () => {
    const events = [
      makeEvent('feed', today(8), 'user-1'),
      makeEvent('feed', today(10), 'user-2'),
    ]
    expect(bothPartnersLogged(events)).toBe(true)
  })

  it('returns false for an empty event list', () => {
    expect(bothPartnersLogged([])).toBe(false)
  })
})
