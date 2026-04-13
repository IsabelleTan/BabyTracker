import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import SummarySection from '@/components/home/SummarySection'
import { currentDayStart, type BabyEvent } from '@/lib/events'

vi.mock('@/contexts/LeaderboardContext', () => ({
  useLeaderboardData: vi.fn().mockReturnValue({ data: null, notifications: [], loading: false, error: false }),
}))
vi.mock('@/lib/funMessages', () => ({
  getPartnerMessage: vi.fn().mockReturnValue(null),
  partnerMessageAllowed: vi.fn().mockReturnValue(false),
  recordPartnerMessageShown: vi.fn(),
  isNightHours: vi.fn().mockReturnValue(false),
}))
vi.mock('@/lib/auth', () => ({
  getUser: vi.fn().mockReturnValue({ user_id: 'u1', display_name: 'Parent 1' }),
}))

// todayAt: real local time at the given hour — hours ≥ 5 are always within the
// current parenting day (5am boundary), so keep callers at h ≥ 5 to stay safe.
function todayAt(hour: number, minuteOffset = 0): string {
  const d = new Date()
  d.setHours(hour, minuteOffset, 0, 0)
  return d.toISOString()
}
// daysAgoAt: offset from currentDayStart() so the result is always N parenting-days
// before today's boundary, regardless of what time CI runs.
function daysAgoAt(days: number, hour: number): string {
  const base = currentDayStart()
  base.setDate(base.getDate() - days)
  return new Date(base.getTime() + (hour - 5) * 3_600_000).toISOString()
}

function makeEvent(overrides: Partial<BabyEvent> & { timestamp: string }): BabyEvent {
  return {
    id: Math.random().toString(36).slice(2),
    type: 'feed',
    logged_by: 'u1',
    display_name: 'Parent 1',
    metadata: null,
    ...overrides,
  }
}

describe('SummarySection — today stats', () => {
  beforeEach(() => vi.clearAllMocks())

  it('counts feeds and diapers from today only', async () => {
    const events: BabyEvent[] = [
      makeEvent({ type: 'feed',   timestamp: todayAt(8) }),
      makeEvent({ type: 'feed',   timestamp: todayAt(11) }),
      makeEvent({ type: 'diaper', timestamp: todayAt(9) }),
      // yesterday — should not count
      makeEvent({ type: 'feed',   timestamp: daysAgoAt(1, 8) }),
      makeEvent({ type: 'diaper', timestamp: daysAgoAt(1, 9) }),
    ]
    render(<SummarySection events={events} />)
    // Wait for the leaderboards effect to resolve
    await waitFor(() => expect(screen.getByText('2')).toBeInTheDocument())
    // feed count = 2 (today only), diaper count = 1
    const numbers = screen.getAllByText(/^\d+$/).map((el) => el.textContent)
    expect(numbers).toContain('2')
    expect(numbers).toContain('1')
  })

  it('shows zeros when all events are from previous days', async () => {
    const events: BabyEvent[] = [
      makeEvent({ type: 'feed',   timestamp: daysAgoAt(2, 8) }),
      makeEvent({ type: 'diaper', timestamp: daysAgoAt(2, 9) }),
    ]
    render(<SummarySection events={events} />)
    await waitFor(() => expect(screen.getAllByText('0')).toHaveLength(2))
  })

  it('shows zeros for empty event list', async () => {
    render(<SummarySection events={[]} />)
    await waitFor(() => expect(screen.getAllByText('0')).toHaveLength(2))
  })

  it('computes total sleep from completed blocks today', async () => {
    // 2-hour sleep block today (hours ≥ 5 to stay within the parenting-day window)
    const start = todayAt(6)
    const end   = todayAt(8)
    const events: BabyEvent[] = [
      makeEvent({ type: 'sleep_start', timestamp: start }),
      makeEvent({ type: 'sleep_end',   timestamp: end }),
    ]
    render(<SummarySection events={events} />)
    // Should show a non-dash sleep duration (e.g. "2h" or "120m")
    await waitFor(() => {
      const sleepEl = screen.getByText(/\d+h|\d+m/)
      expect(sleepEl).toBeInTheDocument()
    })
  })

  it('shows elapsed duration for an ongoing sleep session (no sleep_end yet)', async () => {
    const events: BabyEvent[] = [
      // Only a sleep_start, no matching sleep_end — ongoing session counts toward total
      makeEvent({ type: 'sleep_start', timestamp: todayAt(6) }),
    ]
    render(<SummarySection events={events} />)
    // Should show a non-dash sleep duration for the in-progress session
    await waitFor(() => {
      const sleepEl = screen.getByText(/\d+h|\d+m/)
      expect(sleepEl).toBeInTheDocument()
    })
  })
})

describe('SummarySection — leaderboard notifications', () => {
  beforeEach(() => vi.clearAllMocks())

  it('displays notification messages from the leaderboard context', async () => {
    const { useLeaderboardData } = await import('@/contexts/LeaderboardContext')
    vi.mocked(useLeaderboardData).mockReturnValue({
      data: null, notifications: ['New record! 🎉'], loading: false, error: false,
    })

    render(<SummarySection events={[]} />)
    await waitFor(() =>
      expect(screen.getByText('New record! 🎉')).toBeInTheDocument(),
    )
  })

  it('shows no notification section when context returns empty notifications', async () => {
    const { useLeaderboardData } = await import('@/contexts/LeaderboardContext')
    vi.mocked(useLeaderboardData).mockReturnValue({
      data: null, notifications: [], loading: false, error: false,
    })

    render(<SummarySection events={[]} />)
    await waitFor(() =>
      expect(screen.queryByText('New today')).not.toBeInTheDocument(),
    )
  })
})
