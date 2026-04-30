import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildNotifications, getLeaderboards, type LeaderboardData, type ParentStat } from '@/lib/leaderboards'

vi.mock('@/lib/api', () => ({ api: { get: vi.fn() } }))
import { api } from '@/lib/api'

const PARENT_A: ParentStat = { display_name: 'Alice', night_shifts: 10, total_logs: 20, poop_changes: 5, potty_assists: 8, accident_cleanups: 4 }
const PARENT_B: ParentStat = { display_name: 'Bob', night_shifts: 3, total_logs: 8, poop_changes: 2, potty_assists: 3, accident_cleanups: 1 }

const TODAY = new Date().toLocaleDateString('en-CA')
const OLD_DATE = '2024-01-15'

function makeData(overrides: Partial<LeaderboardData> = {}): LeaderboardData {
  return {
    longest_sleep: { value: null, date: null },
    best_night: { value: null, date: null },
    worst_night: { value: null, date: null },
    most_feeds: { value: null, date: null },
    most_poop: { value: null, date: null },
    longest_potty_streak: { value: null, date: null },
    total_accidents: 0,
    awards_claimed_today: [],
    parents: [PARENT_A, PARENT_B],
    ...overrides,
  }
}

describe('buildNotifications', () => {
  it('returns empty array when no records are new and no awards claimed', () => {
    expect(buildNotifications(makeData())).toEqual([])
  })

  it('includes a message for a new longest sleep record', () => {
    const msgs = buildNotifications(makeData({
      longest_sleep: { value: 180, date: TODAY },
    }))
    expect(msgs).toHaveLength(1)
    expect(msgs[0]).toContain('3h')
  })

  it('does not notify for a longest sleep record set on a previous day', () => {
    const msgs = buildNotifications(makeData({
      longest_sleep: { value: 180, date: OLD_DATE },
    }))
    expect(msgs).toHaveLength(0)
  })

  it('includes a message for a new best night record', () => {
    const msgs = buildNotifications(makeData({
      best_night: { value: 360, date: TODAY },
    }))
    expect(msgs).toHaveLength(1)
    expect(msgs[0]).toContain('6h')
  })

  it('includes a message for a new most feeds record', () => {
    const msgs = buildNotifications(makeData({
      most_feeds: { value: 12, date: TODAY },
    }))
    expect(msgs).toHaveLength(1)
    expect(msgs[0]).toContain('12')
  })

  it('includes a message for a new most poop record', () => {
    const msgs = buildNotifications(makeData({
      most_poop: { value: 7, date: TODAY },
    }))
    expect(msgs).toHaveLength(1)
    expect(msgs[0]).toContain('7')
  })

  it('includes winner and loser names when night shift award is claimed', () => {
    const msgs = buildNotifications(makeData({ awards_claimed_today: ['night_shift'] }))
    expect(msgs).toHaveLength(1)
    expect(msgs[0]).toContain('Alice')
    expect(msgs[0]).toContain('Bob')
    expect(msgs[0]).toContain('10')
    expect(msgs[0]).toContain('3')
  })

  it('includes winner and loser names when chief log award is claimed', () => {
    const msgs = buildNotifications(makeData({ awards_claimed_today: ['chief_log'] }))
    expect(msgs).toHaveLength(1)
    expect(msgs[0]).toContain('Alice')
    expect(msgs[0]).toContain('Bob')
    expect(msgs[0]).toContain('20')
    expect(msgs[0]).toContain('8')
  })

  it('includes winner and loser names when poop award is claimed', () => {
    const msgs = buildNotifications(makeData({ awards_claimed_today: ['poop'] }))
    expect(msgs).toHaveLength(1)
    expect(msgs[0]).toContain('Alice')
    expect(msgs[0]).toContain('Bob')
    expect(msgs[0]).toContain('5')
    expect(msgs[0]).toContain('2')
  })

  it('accumulates multiple messages when several records and awards trigger at once', () => {
    const msgs = buildNotifications(makeData({
      longest_sleep: { value: 120, date: TODAY },
      most_feeds: { value: 9, date: TODAY },
      awards_claimed_today: ['night_shift'],
    }))
    expect(msgs).toHaveLength(3)
  })

  it('produces a stable (deterministic) message for a given date', () => {
    const data = makeData({
      longest_sleep: { value: 180, date: TODAY },
    })
    const first = buildNotifications(data)[0]
    const second = buildNotifications(data)[0]
    expect(first).toBe(second)
  })

  it('includes winner and loser names when potty award is claimed', () => {
    const msgs = buildNotifications(makeData({ awards_claimed_today: ['potty'] }))
    expect(msgs).toHaveLength(1)
    expect(msgs[0]).toContain('Alice')
    expect(msgs[0]).toContain('Bob')
    expect(msgs[0]).toContain('8')
    expect(msgs[0]).toContain('3')
  })

  it('includes winner and loser names when accident award is claimed', () => {
    const msgs = buildNotifications(makeData({ awards_claimed_today: ['accident'] }))
    expect(msgs).toHaveLength(1)
    expect(msgs[0]).toContain('Alice')
    expect(msgs[0]).toContain('Bob')
    expect(msgs[0]).toContain('4')
    expect(msgs[0]).toContain('1')
  })

  it('does not include award message when parents list has fewer than 2 entries', () => {
    const msgs = buildNotifications(makeData({
      awards_claimed_today: ['night_shift'],
      parents: [PARENT_A],
    }))
    expect(msgs).toHaveLength(0)
  })
})

describe('getLeaderboards', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns null when the server responds with 204', async () => {
    vi.mocked(api.get).mockResolvedValue({ status: 204, data: undefined })
    const result = await getLeaderboards()
    expect(result).toBeNull()
  })

  it('returns parsed data when the server responds with 200', async () => {
    const payload: LeaderboardData = {
      longest_sleep: { value: 180, date: OLD_DATE },
      best_night: { value: null, date: null },
      worst_night: { value: null, date: null },
      most_feeds: { value: null, date: null },
      most_poop: { value: null, date: null },
      longest_potty_streak: { value: null, date: null },
      total_accidents: 0,
      awards_claimed_today: [],
      parents: [],
    }
    vi.mocked(api.get).mockResolvedValue({ status: 200, data: payload })
    const result = await getLeaderboards()
    expect(result).toEqual(payload)
  })
})
