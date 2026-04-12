import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import SummarySection from '@/components/home/SummarySection'
import type { BabyEvent } from '@/lib/events'

vi.mock('@/lib/leaderboards', () => ({
  getLeaderboards: vi.fn().mockResolvedValue({ has_enough_data: false, parents: [] }),
  buildNotifications: vi.fn().mockReturnValue([]),
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

// Build timestamps relative to NOW so the today-filter works regardless of
// the host machine's local timezone.
function todayAt(hour: number, minuteOffset = 0): string {
  const d = new Date()
  d.setHours(hour, minuteOffset, 0, 0)
  return d.toISOString()
}
function daysAgoAt(days: number, hour: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(hour, 0, 0, 0)
  return d.toISOString()
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
    // 2-hour sleep block today
    const start = todayAt(1)
    const end   = todayAt(3)
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
      makeEvent({ type: 'sleep_start', timestamp: todayAt(2) }),
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

  it('displays notification messages returned by buildNotifications', async () => {
    const { buildNotifications } = await import('@/lib/leaderboards')
    vi.mocked(buildNotifications).mockReturnValue(['New record! 🎉'])

    render(<SummarySection events={[]} />)
    await waitFor(() =>
      expect(screen.getByText('New record! 🎉')).toBeInTheDocument(),
    )
  })

  it('shows no notification section when buildNotifications returns empty', async () => {
    const { buildNotifications } = await import('@/lib/leaderboards')
    vi.mocked(buildNotifications).mockReturnValue([])

    render(<SummarySection events={[]} />)
    await waitFor(() =>
      expect(screen.queryByText('New today')).not.toBeInTheDocument(),
    )
  })
})
