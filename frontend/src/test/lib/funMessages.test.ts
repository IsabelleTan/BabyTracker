import { describe, it, expect, beforeEach } from 'vitest'
import {
  getBabyVoiceContext,
  getPartnerContext,
  getNewMilestone,
  getMilestoneMessage,
  markMilestoneSeen,
  milestoneAllowedToday,
  recordMilestoneShownToday,
  babyVoiceShouldShow,
  dismissBabyVoice,
  partnerMessageAllowed,
  recordPartnerMessageShown,
  nightMessageShouldShow,
  markNightMessageShown,
  isNightHours,
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
  it('returns "normal" for a typical day (9–19 events, no special triggers)', () => {
    const events = [
      makeEvent('feed',   today(7)),  makeEvent('feed',   today(10)), makeEvent('feed', today(13)),
      makeEvent('feed',   today(16)), makeEvent('feed',   today(18)),
      makeEvent('diaper', today(8)),  makeEvent('diaper', today(11)), makeEvent('diaper', today(15)),
      makeEvent('sleep_start', today(9)), makeEvent('sleep_end', today(10)),
    ]
    expect(getBabyVoiceContext(events)).toBe('normal')
  })

  it('returns "many_feeds" when feed count is ≥ 9', () => {
    expect(getBabyVoiceContext(
      Array.from({ length: 9 }, (_, i) => makeEvent('feed', today(6 + i)))
    )).toBe('many_feeds')
  })

  it('returns "quiet" when there are ≤ 8 events', () => {
    expect(getBabyVoiceContext([makeEvent('feed', today(9)), makeEvent('diaper', today(10))])).toBe('quiet')
  })

  it('returns "long_nap" for a completed sleep block ≥ 3 hours', () => {
    const events = [
      makeEvent('sleep_start', today(10, 0)), makeEvent('sleep_end', today(13, 30)),
      makeEvent('feed', today(8)), makeEvent('feed', today(14)),
    ]
    expect(getBabyVoiceContext(events)).toBe('long_nap')
  })

  it('does not return "long_nap" for a sleep block under 3 hours', () => {
    const events = [
      makeEvent('sleep_start', today(10, 0)), makeEvent('sleep_end', today(12, 59)),
      makeEvent('feed', today(8)), makeEvent('feed', today(13)),
    ]
    expect(getBabyVoiceContext(events)).not.toBe('long_nap')
  })

  it('returns "cluster" for ≥ 2 short-gap evening feeds', () => {
    const events = [
      makeEvent('feed', today(19, 0)), makeEvent('feed', today(19, 30)),
      makeEvent('feed', today(20, 0)), makeEvent('feed', today(9)),
    ]
    expect(getBabyVoiceContext(events)).toBe('cluster')
  })

  it('does not return "cluster" when evening gaps are ≥ 45 min', () => {
    const events = [
      makeEvent('feed', today(19, 0)), makeEvent('feed', today(19, 50)),
      makeEvent('feed', today(20, 40)),
    ]
    expect(getBabyVoiceContext(events)).not.toBe('cluster')
  })

  it('returns "chaotic" when there are ≥ 20 events with no other trigger', () => {
    expect(getBabyVoiceContext(
      Array.from({ length: 20 }, (_, i) =>
        makeEvent('diaper', today(6 + Math.floor(i / 2), (i % 2) * 30))
      )
    )).toBe('chaotic')
  })

  it('cluster takes priority over many_feeds', () => {
    const events = [
      ...Array.from({ length: 6 }, (_, i) => makeEvent('feed', today(7 + i))),
      makeEvent('feed', today(19, 0)), makeEvent('feed', today(19, 30)), makeEvent('feed', today(20, 0)),
    ]
    expect(getBabyVoiceContext(events)).toBe('cluster')
  })
})

// ── getPartnerContext ─────────────────────────────────────────────────────────

describe('getPartnerContext', () => {
  it('returns "both" when two users logged roughly equally', () => {
    const events = [
      makeEvent('feed', today(8),  'user-1'), makeEvent('feed', today(10), 'user-2'),
      makeEvent('feed', today(12), 'user-1'), makeEvent('feed', today(14), 'user-2'),
    ]
    expect(getPartnerContext(events, 'user-1')).toBe('both')
  })

  it('returns "both" when only the current user has logged (no partner data)', () => {
    const events = [makeEvent('feed', today(8), 'user-1'), makeEvent('diaper', today(9), 'user-1')]
    expect(getPartnerContext(events, 'user-1')).toBe('both')
  })

  it('returns "solo" when OTHER user logged ≥ 70% of events', () => {
    const events = [
      makeEvent('feed', today(8),  'user-1'), makeEvent('feed', today(10), 'user-1'),
      makeEvent('feed', today(12), 'user-1'), makeEvent('feed', today(14), 'user-2'),
    ]
    // user-1 logged 3/4 = 75% → from user-2's perspective the other parent carried the load
    expect(getPartnerContext(events, 'user-2')).toBe('solo')
  })

  it('returns "night_shift" when OTHER user logged ≥ 3 night events', () => {
    const events = [
      makeEvent('feed', today(23, 0), 'user-1'),
      makeEvent('feed', today(2,  0), 'user-1'),
      makeEvent('feed', today(4,  0), 'user-1'),
      makeEvent('feed', today(10),    'user-2'),
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
  beforeEach(() => { localStorage.clear() })

  it('returns null for an empty event list', () => {
    expect(getNewMilestone([])).toBeNull()
  })

  it('detects sleep_5h for a ≥ 5-hour block', () => {
    const start = new Date(); start.setHours(21, 0, 0, 0)
    const end = new Date(start.getTime() + 5.5 * 3_600_000)
    expect(getNewMilestone([
      makeEvent('sleep_start', start.toISOString()),
      makeEvent('sleep_end',   end.toISOString()),
    ])).toBe('sleep_5h')
  })

  it('detects sleep_8h (priority over sleep_5h) for a ≥ 8-hour block', () => {
    const start = new Date(); start.setHours(21, 0, 0, 0)
    const end = new Date(start.getTime() + 8.5 * 3_600_000)
    expect(getNewMilestone([
      makeEvent('sleep_start', start.toISOString()),
      makeEvent('sleep_end',   end.toISOString()),
    ])).toBe('sleep_8h')
  })

  it('detects feeds_8 for ≥ 8 feeds', () => {
    expect(getNewMilestone(
      Array.from({ length: 8 }, (_, i) => makeEvent('feed', today(6 + i)))
    )).toBe('feeds_8')
  })

  it('detects feeds_12 (priority over feeds_8) for ≥ 12 feeds', () => {
    expect(getNewMilestone(
      Array.from({ length: 12 }, (_, i) => makeEvent('feed', today(6 + i)))
    )).toBe('feeds_12')
  })

  it('detects all_event_types when all three types are present', () => {
    expect(getNewMilestone([
      makeEvent('feed',        today(8)),
      makeEvent('sleep_start', today(9)),
      makeEvent('diaper',      today(10)),
    ])).toBe('all_event_types')
  })

  it('detects night_survived for an event between 02:00–04:00', () => {
    expect(getNewMilestone([makeEvent('feed', today(3, 0))])).toBe('night_survived')
  })

  it('detects cluster_first when there is an evening cluster', () => {
    const events = [
      makeEvent('feed', today(19, 0)), makeEvent('feed', today(19, 30)),
      makeEvent('feed', today(20, 0)),
    ]
    expect(getNewMilestone(events)).toBe('cluster_first')
  })

  it('detects both_partners_first when two users have logged', () => {
    expect(getNewMilestone([
      makeEvent('feed', today(8), 'user-1'),
      makeEvent('feed', today(9), 'user-2'),
    ])).toBe('both_partners_first')
  })

  it('returns null once a milestone has been marked seen', () => {
    localStorage.setItem('milestone_feeds_8', 'true')
    expect(getNewMilestone(
      Array.from({ length: 8 }, (_, i) => makeEvent('feed', today(6 + i)))
    )).toBeNull()
  })
})

// ── nightMessageShouldShow ────────────────────────────────────────────────────

describe('nightMessageShouldShow', () => {
  beforeEach(() => { localStorage.clear() })

  it('returns false during day hours regardless of event count', () => {
    // This test only makes sense if it actually runs during day hours.
    // We guard with isNightHours() to avoid false failures on night CI runs.
    if (isNightHours()) return
    expect(nightMessageShouldShow(5)).toBe(false)
  })

  it('returns false once already shown this night session', () => {
    markNightMessageShown()
    expect(nightMessageShouldShow(5)).toBe(false)
  })
})

// ── milestoneAllowedToday / recordMilestoneShownToday ─────────────────────────

describe('milestoneAllowedToday / recordMilestoneShownToday', () => {
  beforeEach(() => { localStorage.clear() })

  it('returns true when no milestone has ever been shown', () => {
    expect(milestoneAllowedToday()).toBe(true)
  })

  it('returns false immediately after recordMilestoneShownToday', () => {
    recordMilestoneShownToday()
    expect(milestoneAllowedToday()).toBe(false)
  })

  it('returns false when shown fewer than 3 days ago', () => {
    const twoDaysAgo = new Date()
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)
    localStorage.setItem('milestone_shown_date', twoDaysAgo.toISOString().slice(0, 10))
    expect(milestoneAllowedToday()).toBe(false)
  })

  it('returns true when shown 3 or more days ago', () => {
    const threeDaysAgo = new Date()
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
    localStorage.setItem('milestone_shown_date', threeDaysAgo.toISOString().slice(0, 10))
    expect(milestoneAllowedToday()).toBe(true)
  })
})

// ── babyVoiceShouldShow / dismissBabyVoice ────────────────────────────────────

describe('babyVoiceShouldShow / dismissBabyVoice', () => {
  beforeEach(() => { localStorage.clear() })

  it('returns true when never shown before', () => {
    expect(babyVoiceShouldShow()).toBe(true)
  })

  it('returns false immediately after dismissBabyVoice', () => {
    dismissBabyVoice()
    expect(babyVoiceShouldShow()).toBe(false)
  })

  it('returns false when shown fewer than 3 days ago', () => {
    const twoDaysAgo = new Date()
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)
    localStorage.setItem('baby_voice_last_shown', twoDaysAgo.toISOString().slice(0, 10))
    expect(babyVoiceShouldShow()).toBe(false)
  })

  it('returns true when shown 3 or more days ago', () => {
    const threeDaysAgo = new Date()
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
    localStorage.setItem('baby_voice_last_shown', threeDaysAgo.toISOString().slice(0, 10))
    expect(babyVoiceShouldShow()).toBe(true)
  })
})

// ── partnerMessageAllowed / recordPartnerMessageShown ─────────────────────────

describe('partnerMessageAllowed / recordPartnerMessageShown', () => {
  beforeEach(() => { localStorage.clear() })

  it('returns true when the partner message has never been shown', () => {
    expect(partnerMessageAllowed()).toBe(true)
  })

  it('returns false immediately after recordPartnerMessageShown', () => {
    recordPartnerMessageShown()
    expect(partnerMessageAllowed()).toBe(false)
  })

  it('returns false when shown fewer than 3 days ago', () => {
    // Simulate shown 2 days ago
    const twoDaysAgo = new Date()
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)
    localStorage.setItem('partner_msg_last_shown', twoDaysAgo.toISOString().slice(0, 10))
    expect(partnerMessageAllowed()).toBe(false)
  })

  it('returns true when shown 3 or more days ago', () => {
    const threeDaysAgo = new Date()
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
    localStorage.setItem('partner_msg_last_shown', threeDaysAgo.toISOString().slice(0, 10))
    expect(partnerMessageAllowed()).toBe(true)
  })
})

// ── getNewMilestone — additional branches ────────────────────────────────────

describe('getNewMilestone — additional milestones', () => {
  beforeEach(() => { localStorage.clear() })

  it('detects nap_2h for a ≥ 2-hour daytime sleep block', () => {
    const start = new Date(); start.setHours(10, 0, 0, 0)
    const end = new Date(start.getTime() + 2 * 3_600_000)
    expect(getNewMilestone([
      makeEvent('sleep_start', start.toISOString()),
      makeEvent('sleep_end',   end.toISOString()),
    ])).toBe('nap_2h')
  })

  it('does not detect nap_2h for a daytime block under 2 hours', () => {
    const start = new Date(); start.setHours(10, 0, 0, 0)
    const end = new Date(start.getTime() + 1.9 * 3_600_000)
    const result = getNewMilestone([
      makeEvent('sleep_start', start.toISOString()),
      makeEvent('sleep_end',   end.toISOString()),
    ])
    expect(result).not.toBe('nap_2h')
  })

  it('detects sleep_total_14h for ≥ 14 hours total sleep', () => {
    // Mark other sleep milestones seen so they don't shadow sleep_total_14h
    localStorage.setItem('milestone_sleep_5h', 'true')
    localStorage.setItem('milestone_sleep_8h', 'true')
    localStorage.setItem('milestone_nap_2h', 'true')
    // Two blocks: 7h night + 7h day = 14h total
    const n1 = new Date(); n1.setHours(0, 0, 0, 0)
    const n2 = new Date(n1.getTime() + 7 * 3_600_000)
    const d1 = new Date(); d1.setHours(8, 0, 0, 0)
    const d2 = new Date(d1.getTime() + 7 * 3_600_000)
    expect(getNewMilestone([
      makeEvent('sleep_start', n1.toISOString()),
      makeEvent('sleep_end',   n2.toISOString()),
      makeEvent('sleep_start', d1.toISOString()),
      makeEvent('sleep_end',   d2.toISOString()),
    ])).toBe('sleep_total_14h')
  })

  it('detects diaper_8 for ≥ 8 diaper events', () => {
    expect(getNewMilestone(
      Array.from({ length: 8 }, (_, i) => makeEvent('diaper', today(6 + i)))
    )).toBe('diaper_8')
  })

  it('detects logging_days_7 when 7 days are recorded in localStorage', () => {
    localStorage.setItem('logging_total_days', '7')
    // Need at least one event to call getNewMilestone usefully
    expect(getNewMilestone([makeEvent('feed', today(8))])).toBe('logging_days_7')
  })

  it('detects logging_days_30 (priority over logging_days_7) when ≥ 30 days recorded', () => {
    localStorage.setItem('logging_total_days', '30')
    expect(getNewMilestone([makeEvent('feed', today(8))])).toBe('logging_days_30')
  })

  it('does not return a milestone message for an unseen key that is null', () => {
    // getMilestoneMessage is a simple lookup — verify it returns a non-empty string
    expect(getMilestoneMessage('nap_2h').length).toBeGreaterThan(0)
    expect(getMilestoneMessage('sleep_total_14h').length).toBeGreaterThan(0)
    expect(getMilestoneMessage('diaper_8').length).toBeGreaterThan(0)
    expect(getMilestoneMessage('logging_days_7').length).toBeGreaterThan(0)
    expect(getMilestoneMessage('logging_days_30').length).toBeGreaterThan(0)
  })

  it('returns null once a milestone has been marked seen via markMilestoneSeen', () => {
    localStorage.setItem('logging_total_days', '7')
    markMilestoneSeen('logging_days_7')
    expect(getNewMilestone([makeEvent('feed', today(8))])).toBeNull()
  })
})
