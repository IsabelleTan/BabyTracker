import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildNotifications, getLeaderboards, type LeaderboardData, type ParentStat } from '@/lib/leaderboards'

vi.mock('@/lib/api', () => ({ api: { get: vi.fn() } }))
import { api } from '@/lib/api'

const PARENT_A: ParentStat = { display_name: 'Alice', night_shifts: 10, total_logs: 20, poop_changes: 5, potty_assists: 8 }
const PARENT_B: ParentStat = { display_name: 'Bob', night_shifts: 3, total_logs: 8, poop_changes: 2, potty_assists: 3 }

function makeData(overrides: Partial<LeaderboardData> = {}): LeaderboardData {
  return {
    longest_sleep_min: null,
    longest_sleep_date: null,
    longest_sleep_new: false,
    best_night_min: null,
    best_night_date: null,
    best_night_new: false,
    worst_night_min: null,
    worst_night_date: null,
    most_feeds_count: null,
    most_feeds_date: null,
    most_feeds_new: false,
    most_poop_count: null,
    most_poop_date: null,
    most_poop_new: false,
    night_shift_claimed_today: false,
    chief_log_claimed_today: false,
    poop_award_claimed_today: false,
    potty_award_claimed_today: false,
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
      longest_sleep_new: true,
      longest_sleep_min: 180,
      longest_sleep_date: '2024-01-15',
    }))
    expect(msgs).toHaveLength(1)
    expect(msgs[0]).toContain('3h')
  })

  it('includes a message for a new best night record', () => {
    const msgs = buildNotifications(makeData({
      best_night_new: true,
      best_night_min: 360,
      best_night_date: '2024-01-15',
    }))
    expect(msgs).toHaveLength(1)
    expect(msgs[0]).toContain('6h')
  })

  it('includes a message for a new most feeds record', () => {
    const msgs = buildNotifications(makeData({
      most_feeds_new: true,
      most_feeds_count: 12,
      most_feeds_date: '2024-01-15',
    }))
    expect(msgs).toHaveLength(1)
    expect(msgs[0]).toContain('12')
  })

  it('includes a message for a new most poop record', () => {
    const msgs = buildNotifications(makeData({
      most_poop_new: true,
      most_poop_count: 7,
      most_poop_date: '2024-01-15',
    }))
    expect(msgs).toHaveLength(1)
    expect(msgs[0]).toContain('7')
  })

  it('includes winner and loser names when night shift award is claimed', () => {
    const msgs = buildNotifications(makeData({ night_shift_claimed_today: true }))
    expect(msgs).toHaveLength(1)
    expect(msgs[0]).toContain('Alice')
    expect(msgs[0]).toContain('Bob')
    expect(msgs[0]).toContain('10')
    expect(msgs[0]).toContain('3')
  })

  it('includes winner and loser names when chief log award is claimed', () => {
    const msgs = buildNotifications(makeData({ chief_log_claimed_today: true }))
    expect(msgs).toHaveLength(1)
    expect(msgs[0]).toContain('Alice')
    expect(msgs[0]).toContain('Bob')
    expect(msgs[0]).toContain('20')
    expect(msgs[0]).toContain('8')
  })

  it('includes winner and loser names when poop award is claimed', () => {
    const msgs = buildNotifications(makeData({ poop_award_claimed_today: true }))
    expect(msgs).toHaveLength(1)
    expect(msgs[0]).toContain('Alice')
    expect(msgs[0]).toContain('Bob')
    expect(msgs[0]).toContain('5')
    expect(msgs[0]).toContain('2')
  })

  it('accumulates multiple messages when several records and awards trigger at once', () => {
    const msgs = buildNotifications(makeData({
      longest_sleep_new: true,
      longest_sleep_min: 120,
      longest_sleep_date: '2024-01-15',
      most_feeds_new: true,
      most_feeds_count: 9,
      most_feeds_date: '2024-01-15',
      night_shift_claimed_today: true,
    }))
    expect(msgs).toHaveLength(3)
  })

  it('produces a stable (deterministic) message for a given date', () => {
    const data = makeData({
      longest_sleep_new: true,
      longest_sleep_min: 180,
      longest_sleep_date: '2024-01-15',
    })
    const first = buildNotifications(data)[0]
    const second = buildNotifications(data)[0]
    expect(first).toBe(second)
  })

  it('includes winner and loser names when potty award is claimed', () => {
    const msgs = buildNotifications(makeData({ potty_award_claimed_today: true }))
    expect(msgs).toHaveLength(1)
    expect(msgs[0]).toContain('Alice')
    expect(msgs[0]).toContain('Bob')
    expect(msgs[0]).toContain('8')
    expect(msgs[0]).toContain('3')
  })

  it('does not include award message when parents list has fewer than 2 entries', () => {
    const msgs = buildNotifications(makeData({
      night_shift_claimed_today: true,
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
      longest_sleep_min: 180, longest_sleep_date: '2024-01-15', longest_sleep_new: false,
      best_night_min: null, best_night_date: null, best_night_new: false,
      worst_night_min: null, worst_night_date: null,
      most_feeds_count: null, most_feeds_date: null, most_feeds_new: false,
      most_poop_count: null, most_poop_date: null, most_poop_new: false,
      night_shift_claimed_today: false, chief_log_claimed_today: false,
      poop_award_claimed_today: false, potty_award_claimed_today: false,
      parents: [],
    }
    vi.mocked(api.get).mockResolvedValue({ status: 200, data: payload })
    const result = await getLeaderboards()
    expect(result).toEqual(payload)
  })
})
