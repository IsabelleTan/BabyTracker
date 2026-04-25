import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import SummarySection, { computeStats } from '@/components/home/SummarySection'
import { type BabyEvent } from '@/lib/events'

vi.mock('@/contexts/LeaderboardContext', () => ({
  useLeaderboardData: vi.fn().mockReturnValue({ data: null, notifications: [], loading: false, error: false }),
}))
vi.mock('@/lib/time', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/time')>()),
  isNightHours: vi.fn().mockReturnValue(false),
}))
vi.mock('@/lib/funMessages', () => ({
  getPartnerMessage: vi.fn().mockReturnValue(null),
  partnerMessageAllowed: vi.fn().mockReturnValue(false),
  recordPartnerMessageShown: vi.fn(),
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
      // Today: 2 pumped feeds (80ml each = 160ml total) + 2 wet diapers
      makeEvent({ type: 'feed',   timestamp: todayAt(7),  metadata: { feed_type: 'bottle', bottle_type: 'pumped', amount_ml: 80 } }),
      makeEvent({ type: 'feed',   timestamp: todayAt(9),  metadata: { feed_type: 'bottle', bottle_type: 'pumped', amount_ml: 80 } }),
      makeEvent({ type: 'output', timestamp: todayAt(8),  metadata: { diaper_type: 'wet' } }),
      makeEvent({ type: 'output', timestamp: todayAt(9),  metadata: { diaper_type: 'wet' } }),
      // Outside 24h window — must not count
      makeEvent({ type: 'feed',   timestamp: hoursAgo(25), metadata: { feed_type: 'bottle', bottle_type: 'pumped', amount_ml: 999 } }),
      makeEvent({ type: 'output', timestamp: hoursAgo(25), metadata: { diaper_type: 'wet' } }),
    ]
    render(<SummarySection events={events} />)
    // Pumped total = 160ml today only; wet count = 2
    await waitFor(() => expect(screen.getByText('160 ml')).toBeInTheDocument())
    expect(screen.getAllByText('2').length).toBeGreaterThanOrEqual(1)
    // Yesterday's 999ml must not appear
    expect(screen.queryByText('999 ml')).not.toBeInTheDocument()
  })

  it('shows zeros when all events are from previous days', async () => {
    const events: BabyEvent[] = [
      makeEvent({ type: 'feed',   timestamp: hoursAgo(49) }),
      makeEvent({ type: 'output', timestamp: hoursAgo(49) }),
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

// ─── computeStats unit tests ─────────────────────────────────────────────────
// All tests pass `now` explicitly so they don't depend on wall-clock time.
// NOW = June 20 2024 10:00am. The 24h window is June 19 10am → June 20 10am.
// Previous 7 windows each cover 24h ending N×24h before NOW.

const NOW = new Date(2024, 5, 20, 10, 0, 0)

function at(offsetMs: number): string {
  return new Date(NOW.getTime() + offsetMs).toISOString()
}
const H = 3_600_000 // 1 hour in ms

function evt(overrides: Partial<BabyEvent> & { timestamp: string }): BabyEvent {
  return {
    id: Math.random().toString(36).slice(2),
    type: 'feed',
    logged_by: 'u1',
    display_name: 'Parent 1',
    metadata: null,
    ...overrides,
  }
}

describe('computeStats — 24h rolling totals', () => {
  it('sums pumped ml within the window and ignores events outside', () => {
    const events = [
      evt({ type: 'feed', timestamp: at(-1 * H),  metadata: { feed_type: 'bottle', bottle_type: 'pumped', amount_ml: 100 } }),
      evt({ type: 'feed', timestamp: at(-23 * H), metadata: { feed_type: 'bottle', bottle_type: 'pumped', amount_ml: 50 } }),
      // exactly 25h ago — outside window
      evt({ type: 'feed', timestamp: at(-25 * H), metadata: { feed_type: 'bottle', bottle_type: 'pumped', amount_ml: 999 } }),
    ]
    const s = computeStats(events, NOW)
    expect(s.pumpedMlTotal).toBe(150)
  })

  it('sums formula ml separately from pumped ml', () => {
    const events = [
      evt({ type: 'feed', timestamp: at(-1 * H),  metadata: { feed_type: 'bottle', bottle_type: 'pumped',  amount_ml: 80 } }),
      evt({ type: 'feed', timestamp: at(-2 * H),  metadata: { feed_type: 'bottle', bottle_type: 'formula', amount_ml: 120 } }),
    ]
    const s = computeStats(events, NOW)
    expect(s.pumpedMlTotal).toBe(80)
    expect(s.formulaMlTotal).toBe(120)
  })

  it('legacy bottle entries without bottle_type count as pumped', () => {
    const events = [
      evt({ type: 'feed', timestamp: at(-1 * H), metadata: { feed_type: 'bottle', amount_ml: 70 } }),
    ]
    const s = computeStats(events, NOW)
    expect(s.pumpedMlTotal).toBe(70)
    expect(s.formulaMlTotal).toBe(0)
  })

  it('sums breast minutes (left + right) within the window', () => {
    const events = [
      evt({ type: 'feed', timestamp: at(-2 * H), metadata: { feed_type: 'breast', left_duration_min: 8, right_duration_min: 5 } }),
      evt({ type: 'feed', timestamp: at(-5 * H), metadata: { feed_type: 'breast', left_duration_min: 10, right_duration_min: null } }),
    ]
    const s = computeStats(events, NOW)
    expect(s.breastMinTotal).toBe(23)
  })

  it('counts wet and dirty diapers separately; "both" increments each', () => {
    const events = [
      evt({ type: 'output', timestamp: at(-1 * H), metadata: { diaper_type: 'wet' } }),
      evt({ type: 'output', timestamp: at(-2 * H), metadata: { diaper_type: 'dirty' } }),
      evt({ type: 'output', timestamp: at(-3 * H), metadata: { diaper_type: 'both' } }),
      // outside window
      evt({ type: 'output', timestamp: at(-25 * H), metadata: { diaper_type: 'wet' } }),
    ]
    const s = computeStats(events, NOW)
    expect(s.wetCount).toBe(2)   // wet + both
    expect(s.dirtyCount).toBe(2) // dirty + both
  })

  it('measures completed sleep block duration', () => {
    const events = [
      evt({ type: 'sleep_start', timestamp: at(-4 * H) }),
      evt({ type: 'sleep_end',   timestamp: at(-2 * H) }),
    ]
    const s = computeStats(events, NOW)
    expect(s.totalSleepMs).toBe(2 * H)
  })

  it('caps ongoing sleep at now', () => {
    const events = [
      evt({ type: 'sleep_start', timestamp: at(-3 * H) }),
    ]
    const s = computeStats(events, NOW)
    expect(s.totalSleepMs).toBe(3 * H)
  })
})

describe('computeStats — 7-day rolling averages', () => {
  it('averages pumped ml over 7 windows including the current 24h window', () => {
    // d=1 is now-24h→now; d=7 is now-168h→now-144h.
    // Place one 70ml pumped event in each window: at -1h, -25h, -49h, …, -145h.
    const events = Array.from({ length: 7 }, (_, i) =>
      evt({ type: 'feed', timestamp: at(-(1 + i * 24) * H), metadata: { feed_type: 'bottle', bottle_type: 'pumped', amount_ml: 70 } }),
    )
    const s = computeStats(events, NOW)
    expect(s.avgPumpedMl).toBe(70)
  })

  it('averages formula ml independently from pumped', () => {
    // One 60ml formula event in window d=1, one 120ml formula event in window d=2; rest empty.
    // Extend to 7 windows with a non-formula event at -145h.
    const events = [
      evt({ type: 'feed', timestamp: at(-1 * H),   metadata: { feed_type: 'bottle', bottle_type: 'formula', amount_ml: 60 } }),
      evt({ type: 'feed', timestamp: at(-25 * H),  metadata: { feed_type: 'bottle', bottle_type: 'formula', amount_ml: 120 } }),
      evt({ type: 'feed', timestamp: at(-145 * H), metadata: { feed_type: 'breast', left_duration_min: 5, right_duration_min: 5 } }),
    ]
    const s = computeStats(events, NOW)
    // d1:60 d2:120 d3–7:0 → avg = 180/7
    expect(s.avgFormulaMl).toBeCloseTo(180 / 7)
  })

  it('averages wet diaper count over 7 windows', () => {
    // d=2 (24-48h ago): 3 wet; d=3 (48-72h ago): 1 wet; rest empty.
    // Extend history to 7 windows with a non-diaper event at -145h.
    const events = [
      evt({ type: 'output', timestamp: at(-26 * H), metadata: { diaper_type: 'wet' } }),
      evt({ type: 'output', timestamp: at(-27 * H), metadata: { diaper_type: 'wet' } }),
      evt({ type: 'output', timestamp: at(-28 * H), metadata: { diaper_type: 'wet' } }),
      evt({ type: 'output', timestamp: at(-50 * H), metadata: { diaper_type: 'wet' } }),
      evt({ type: 'feed',   timestamp: at(-145 * H), metadata: { feed_type: 'bottle', amount_ml: 0 } }),
    ]
    const s = computeStats(events, NOW)
    // d1:0 d2:3 d3:1 d4:0 d5:0 d6:0 d7:0 → 4/7
    expect(s.avgWet).toBeCloseTo(4 / 7)
  })

  it('averages over fewer windows when history is shorter than 7 days', () => {
    // Only 2 days of history: one event 26h ago (window 1) and one 50h ago (window 2)
    const events = [
      evt({ type: 'feed', timestamp: at(-26 * H), metadata: { feed_type: 'bottle', bottle_type: 'pumped', amount_ml: 100 } }),
      evt({ type: 'feed', timestamp: at(-50 * H), metadata: { feed_type: 'bottle', bottle_type: 'pumped', amount_ml: 200 } }),
    ]
    const s = computeStats(events, NOW)
    // oldest event is 50h ago → ceil(50/24) = 3 windows used, window 3 has 200ml
    // window 1: 100, window 2: 0, window 3: 200 → avg = 300/3 = 100
    expect(s.avgPumpedMl).toBe(100)
  })

  it('returns zero averages when there are no historical events', () => {
    const s = computeStats([], NOW)
    expect(s.avgPumpedMl).toBe(0)
    expect(s.avgFormulaMl).toBe(0)
    expect(s.avgBreastMin).toBe(0)
    expect(s.avgWet).toBe(0)
    expect(s.avgDirty).toBe(0)
    expect(s.avgSleepMs).toBe(0)
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
