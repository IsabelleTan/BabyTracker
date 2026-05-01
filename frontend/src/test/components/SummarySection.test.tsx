import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import SummarySection from '@/components/home/SummarySection'
import { type BabyEvent } from '@/lib/events'
import { type SummaryStats } from '@/lib/stats'

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
vi.mock('@/lib/stats', () => ({
  getSummaryStats: vi.fn(),
}))

const ZERO_STATS: SummaryStats = {
  breast_min: { current: 0, average: 0 },
  pumped_ml:  { current: 0, average: 0 },
  formula_ml: { current: 0, average: 0 },
  wet:        { current: 0, average: 0 },
  dirty:      { current: 0, average: 0 },
  sleep_min:  { current: 0, average: 0 },
}

function makeStats(overrides: Partial<SummaryStats> = {}): SummaryStats {
  return { ...ZERO_STATS, ...overrides }
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

async function mockStats(stats: SummaryStats) {
  const { getSummaryStats } = await import('@/lib/stats')
  vi.mocked(getSummaryStats).mockResolvedValue(stats)
}

describe('SummarySection', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders nothing until stats load', async () => {
    const { getSummaryStats } = await import('@/lib/stats')
    vi.mocked(getSummaryStats).mockReturnValue(new Promise(() => {})) // never resolves
    const { container } = render(<SummarySection events={[]} lastSynced={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('shows pumped ml from backend stats', async () => {
    await mockStats(makeStats({ pumped_ml: { current: 160, average: 0 } }))
    render(<SummarySection events={[]} lastSynced={new Date()} />)
    await waitFor(() => expect(screen.getByText('160 ml')).toBeInTheDocument())
  })

  it('shows dashes for zero values', async () => {
    await mockStats(ZERO_STATS)
    render(<SummarySection events={[]} lastSynced={new Date()} />)
    await waitFor(() => expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1))
  })

  it('shows wet and dirty counts', async () => {
    await mockStats(makeStats({ wet: { current: 3, average: 0 }, dirty: { current: 2, average: 0 } }))
    render(<SummarySection events={[]} lastSynced={new Date()} />)
    await waitFor(() => {
      expect(screen.getByText('3')).toBeInTheDocument()
      expect(screen.getByText('2')).toBeInTheDocument()
    })
  })

  it('shows sleep duration from backend stats', async () => {
    await mockStats(makeStats({ sleep_min: { current: 120, average: 0 } }))
    render(<SummarySection events={[]} lastSynced={new Date()} />)
    await waitFor(() =>
      expect(screen.getAllByText(/^\d+h( \d+m)?$|^\d+m$/).length).toBeGreaterThanOrEqual(1),
    )
  })

  it('re-fetches when lastSynced changes', async () => {
    const { getSummaryStats } = await import('@/lib/stats')
    vi.mocked(getSummaryStats).mockResolvedValue(ZERO_STATS)
    const { rerender } = render(<SummarySection events={[]} lastSynced={new Date(1)} />)
    await waitFor(() => expect(getSummaryStats).toHaveBeenCalledTimes(1))
    rerender(<SummarySection events={[]} lastSynced={new Date(2)} />)
    await waitFor(() => expect(getSummaryStats).toHaveBeenCalledTimes(2))
  })
})

describe('SummarySection — leaderboard notifications', () => {
  beforeEach(() => vi.clearAllMocks())

  it('displays notification messages from the leaderboard context', async () => {
    const { useLeaderboardData } = await import('@/contexts/LeaderboardContext')
    vi.mocked(useLeaderboardData).mockReturnValue({
      data: null, notifications: ['New record! 🎉'], loading: false, error: false,
    })
    const { getSummaryStats } = await import('@/lib/stats')
    vi.mocked(getSummaryStats).mockResolvedValue(ZERO_STATS)

    render(<SummarySection events={[]} lastSynced={new Date()} />)
    await waitFor(() =>
      expect(screen.getByText('New record! 🎉')).toBeInTheDocument(),
    )
  })

  it('shows no notification section when context returns empty notifications', async () => {
    const { useLeaderboardData } = await import('@/contexts/LeaderboardContext')
    vi.mocked(useLeaderboardData).mockReturnValue({
      data: null, notifications: [], loading: false, error: false,
    })
    const { getSummaryStats } = await import('@/lib/stats')
    vi.mocked(getSummaryStats).mockResolvedValue(ZERO_STATS)

    render(<SummarySection events={[]} lastSynced={new Date()} />)
    await waitFor(() =>
      expect(screen.queryByText('New today')).not.toBeInTheDocument(),
    )
  })

  it('shows partner message when two users have logged events', async () => {
    const { getSummaryStats } = await import('@/lib/stats')
    vi.mocked(getSummaryStats).mockResolvedValue(ZERO_STATS)
    const { getPartnerMessage, partnerMessageAllowed } = await import('@/lib/funMessages')
    vi.mocked(partnerMessageAllowed).mockReturnValue(true)
    vi.mocked(getPartnerMessage).mockReturnValue({ message: 'Great teamwork!' })

    const events: BabyEvent[] = [
      makeEvent({ timestamp: new Date().toISOString(), logged_by: 'u1' }),
      makeEvent({ timestamp: new Date().toISOString(), logged_by: 'u2' }),
    ]
    render(<SummarySection events={events} lastSynced={new Date()} />)
    await waitFor(() =>
      expect(screen.getByText('Great teamwork!')).toBeInTheDocument(),
    )
  })
})
