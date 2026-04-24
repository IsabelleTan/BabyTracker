import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import SummarySection from '@/components/home/SummarySection'
import { type BabyEvent } from '@/lib/events'

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

// Pin "now" to June 20 2024 10:00am. The rolling 24-hour window is
// June 19 10:00am → June 20 10:00am. shouldAdvanceTime lets real time
// flow so waitFor() doesn't stall.
const PINNED_NOW = new Date(2024, 5, 20, 10, 0, 0)
beforeEach(() => vi.useFakeTimers({ now: PINNED_NOW, shouldAdvanceTime: true }))
afterEach(() => vi.useRealTimers())

// todayAt: hours 0–9 on June 20 fall inside the 24h window (after June 19 10am).
function todayAt(hour: number, minuteOffset = 0): string {
  const d = new Date(PINNED_NOW)
  d.setHours(hour, minuteOffset, 0, 0)
  return d.toISOString()
}
// hoursAgoAt: places a timestamp N*24 + offset hours before PINNED_NOW.
// hoursAgo(25) = June 19 9am, which is before the 24h window start (June 19 10am)
// and therefore correctly excluded from the rolling 24h stats.
function hoursAgo(hours: number): string {
  return new Date(PINNED_NOW.getTime() - hours * 3_600_000).toISOString()
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
      // Today: 2 bottle feeds (80ml each = 160ml total) + 2 wet diapers
      makeEvent({ type: 'feed',   timestamp: todayAt(7),  metadata: { feed_type: 'bottle', amount_ml: 80 } }),
      makeEvent({ type: 'feed',   timestamp: todayAt(9),  metadata: { feed_type: 'bottle', amount_ml: 80 } }),
      makeEvent({ type: 'diaper', timestamp: todayAt(8),  metadata: { diaper_type: 'wet' } }),
      makeEvent({ type: 'diaper', timestamp: todayAt(9),  metadata: { diaper_type: 'wet' } }),
      // Outside 24h window — must not count
      makeEvent({ type: 'feed',   timestamp: hoursAgo(25), metadata: { feed_type: 'bottle', amount_ml: 999 } }),
      makeEvent({ type: 'diaper', timestamp: hoursAgo(25), metadata: { diaper_type: 'wet' } }),
    ]
    render(<SummarySection events={events} />)
    // Bottle total = 160ml today only; wet count = 2
    await waitFor(() => expect(screen.getByText('160 ml')).toBeInTheDocument())
    expect(screen.getAllByText('2').length).toBeGreaterThanOrEqual(1)
    // Yesterday's 999ml must not appear
    expect(screen.queryByText('999 ml')).not.toBeInTheDocument()
  })

  it('shows zeros when all events are from previous days', async () => {
    const events: BabyEvent[] = [
      makeEvent({ type: 'feed',   timestamp: hoursAgo(49) }),
      makeEvent({ type: 'diaper', timestamp: hoursAgo(49) }),
    ]
    render(<SummarySection events={events} />)
    await waitFor(() => expect(screen.getAllByText('0')).toHaveLength(2))
  })

  it('shows zeros for empty event list', async () => {
    render(<SummarySection events={[]} />)
    await waitFor(() => expect(screen.getAllByText('0')).toHaveLength(2))
  })

  it('computes total sleep from completed blocks today', async () => {
    // 2-hour sleep block today (within the rolling 24h window)
    const start = todayAt(6)
    const end   = todayAt(8)
    const events: BabyEvent[] = [
      makeEvent({ type: 'sleep_start', timestamp: start }),
      makeEvent({ type: 'sleep_end',   timestamp: end }),
    ]
    render(<SummarySection events={events} />)
    // Should show a non-dash sleep duration (e.g. "2h", "2h 30m", "45m")
    await waitFor(() => {
      expect(screen.getAllByText(/^\d+h( \d+m)?$|^\d+m$/).length).toBeGreaterThanOrEqual(1)
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
      expect(screen.getAllByText(/^\d+h( \d+m)?$|^\d+m$/).length).toBeGreaterThanOrEqual(1)
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
