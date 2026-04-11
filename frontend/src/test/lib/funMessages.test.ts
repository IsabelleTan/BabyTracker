import { describe, it, expect, beforeEach } from 'vitest'
import {
  getBabyVoiceContext,
  getPartnerContext,
  getNewMilestone,
} from '@/lib/funMessages'
import type { BabyEvent } from '@/lib/events'

// ── helpers ───────────────────────────────────────────────────────────────────

function makeEvent(
  type: BabyEvent['type'],
  isoTime: string,
  loggedBy = 'user-1',
  metadata: BabyEvent['metadata'] = null,
): BabyEvent {
  return { id: Math.random().toString(), type, timestamp: isoTime, logged_by: loggedBy, display_name: 'Test', metadata }
}

function today(h: number, m = 0): string {
  const d = new Date()
  d.setHours(h, m, 0, 0)
  return d.toISOString()
}

// ── getBabyVoiceContext ───────────────────────────────────────────────────────

describe('getBabyVoiceContext', () => {
  it('returns "normal" for a typical handful of events', () => {
    const events = [
      makeEvent('feed', today(8)), makeEvent('feed', today(11)), makeEvent('feed', today(14)),
      makeEvent('diaper', today(9)), makeEvent('diaper', today(13)),
    ]
    expect(getBabyVoiceContext(events)).toBe('normal')
  })

  it('returns "many_feeds" when feed count is ≥ 9', () => {
    const events = Array.from({ length: 9 }, (_, i) => makeEvent('feed', today(6 + i)))
    expect(getBabyVoiceContext(events)).toBe('many_feeds')
  })

  it('returns "quiet" when there are ≤ 3 events', () => {
    expect(getBabyVoiceContext([makeEvent('feed', today(9)), makeEvent('diaper', today(10))])).toBe('quiet')
  })

  it('returns "long_nap" for a completed sleep block ≥ 3 hours', () => {
    const events = [
      makeEvent('sleep_start', today(10, 0)),
      makeEvent('sleep_end',   today(13, 30)),
      makeEvent('feed', today(8)), makeEvent('feed', today(14)),
    ]
    expect(getBabyVoiceContext(events)).toBe('long_nap')
  })

  it('does not return "long_nap" for a sleep block under 3 hours', () => {
    const events = [
      makeEvent('sleep_start', today(10, 0)),
      makeEvent('sleep_end',   today(12, 59)),
      makeEvent('feed', today(8)), makeEvent('feed', today(13)),
    ]
    expect(getBabyVoiceContext(events)).not.toBe('long_nap')
  })

  it('returns "cluster" for ≥ 2 short-gap evening feeds', () => {
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
    expect(getBabyVoiceContext(events)).not.toBe('cluster')
  })

  it('returns "chaotic" when there are ≥ 20 events with no other trigger', () => {
    const events = Array.from({ length: 20 }, (_, i) =>
      makeEvent('diaper', today(6 + Math.floor(i / 2), (i % 2) * 30)),
    )
    expect(getBabyVoiceContext(events)).toBe('chaotic')
  })

  it('cluster takes priority over many_feeds', () => {
    const events = [
      ...Array.from({ length: 6 }, (_, i) => makeEvent('feed', today(7 + i))),
      makeEvent('feed', today(19, 0)),
      makeEvent('feed', today(19, 30)),
      makeEvent('feed', today(20, 0)),
    ]
    expect(getBabyVoiceContext(events)).toBe('cluster')
  })
})

// ── getPartnerContext ─────────────────────────────────────────────────────────

describe('getPartnerContext', () => {
  it('returns "both" when two users have logged roughly equally', () => {
    const events = [
      makeEvent('feed', today(8),  'user-1'),
      makeEvent('feed', today(10), 'user-2'),
      makeEvent('feed', today(12), 'user-1'),
      makeEvent('feed', today(14), 'user-2'),
    ]
    expect(getPartnerContext(events, 'user-1')).toBe('both')
  })

  it('returns "solo" when only one user has logged', () => {
    const events = [makeEvent('feed', today(8), 'user-1'), makeEvent('diaper', today(9), 'user-1')]
    expect(getPartnerContext(events, 'user-1')).toBe('solo')
  })

  it('returns "solo" when current user logged ≥ 70% of events', () => {
    const events = [
      makeEvent('feed', today(8),  'user-1'),
      makeEvent('feed', today(10), 'user-1'),
      makeEvent('feed', today(12), 'user-1'),
      makeEvent('feed', today(14), 'user-2'),  // only 25% from user-2
    ]
    expect(getPartnerContext(events, 'user-1')).toBe('solo')
  })

  it('returns "night_shift" when a user logged ≥ 2 events at night', () => {
    const events = [
      makeEvent('feed', today(23, 0),  'user-1'),
      makeEvent('feed', today(2,  0),  'user-1'),
      makeEvent('feed', today(10),     'user-2'),
    ]
    expect(getPartnerContext(events, 'user-2')).toBe('night_shift')
  })

  it('returns "poop_duty" when a user logged ≥ 3 dirty/both diapers', () => {
    const events = [
      makeEvent('diaper', today(8),  'user-1', { diaper_type: 'dirty' }),
      makeEvent('diaper', today(10), 'user-1', { diaper_type: 'both'  }),
      makeEvent('diaper', today(12), 'user-1', { diaper_type: 'dirty' }),
      makeEvent('feed',   today(9),  'user-2'),
    ]
    expect(getPartnerContext(events, 'user-2')).toBe('poop_duty')
  })

  it('poop_duty takes priority over night_shift', () => {
    const events = [
      makeEvent('diaper', today(23, 0), 'user-1', { diaper_type: 'dirty' }),
      makeEvent('diaper', today(2,  0), 'user-1', { diaper_type: 'dirty' }),
      makeEvent('diaper', today(4,  0), 'user-1', { diaper_type: 'both'  }),
    ]
    expect(getPartnerContext(events, 'user-2')).toBe('poop_duty')
  })
})

// ── getNewMilestone ───────────────────────────────────────────────────────────

describe('getNewMilestone', () => {
  beforeEach(() => {
    // Clear milestone localStorage before each test
    localStorage.clear()
  })

  it('returns null for an empty event list', () => {
    expect(getNewMilestone([])).toBeNull()
  })

  it('detects sleep_5h for a ≥ 5-hour sleep block', () => {
    const events = [
      makeEvent('sleep_start', today(21, 0)),
      makeEvent('sleep_end',   today(2,  30)),  // 5.5 hours
    ]
    // Adjust: sleep_end must be after sleep_start in ISO sort
    const start = new Date(); start.setHours(21, 0, 0, 0)
    const end   = new Date(); end.setHours(2, 30, 0, 0)
    if (end < start) end.setDate(end.getDate() + 1)
    const evs = [
      { ...makeEvent('sleep_start', start.toISOString()), },
      { ...makeEvent('sleep_end',   end.toISOString()),   },
    ]
    expect(getNewMilestone(evs)).toBe('sleep_5h')
  })

  it('detects sleep_8h for a ≥ 8-hour sleep block (takes priority over sleep_5h)', () => {
    const start = new Date(); start.setHours(21, 0, 0, 0)
    const end   = new Date(start.getTime() + 8.5 * 60 * 60 * 1000)
    const evs = [
      makeEvent('sleep_start', start.toISOString()),
      makeEvent('sleep_end',   end.toISOString()),
    ]
    expect(getNewMilestone(evs)).toBe('sleep_8h')
  })

  it('detects feeds_8 when there are ≥ 8 feeds', () => {
    const events = Array.from({ length: 8 }, (_, i) => makeEvent('feed', today(6 + i)))
    expect(getNewMilestone(events)).toBe('feeds_8')
  })

  it('returns null once the milestone has been marked seen', () => {
    localStorage.setItem('milestone_feeds_8', 'true')
    const events = Array.from({ length: 8 }, (_, i) => makeEvent('feed', today(6 + i)))
    expect(getNewMilestone(events)).toBeNull()
  })
})
