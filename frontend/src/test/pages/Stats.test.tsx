import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type React from 'react'
import Stats from '@/pages/Stats'

// Recharts' ResponsiveContainer relies on ResizeObserver / layout APIs absent in jsdom
vi.mock('recharts', () => {
  return {
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    LineChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Line: () => null,
    XAxis: () => null,
    YAxis: () => null,
    Tooltip: () => null,
    ReferenceLine: () => null,
  }
})

vi.mock('@/components/NightToggle', () => ({
  default: () => null,
}))

vi.mock('@/lib/stats', () => ({
  getDailyStats: vi.fn(),
  getEarliestEventDate: vi.fn(),
}))

const defaultStat = {
  date: '2024-01-15',
  feed_count: 8,
  median_feed_interval_min: 180,
  feed_intervals_min: [120, 180, 240],
  total_sleep_min: 480,
  sleep_session_count: 3,
  median_sleep_session_min: 160,
  sleep_session_durations_min: [90, 160, 200],
  sleep_sessions_hours: [[22, 6]] as [number, number][],
  median_wake_min: 60,
  wake_durations_min: [30, 60, 90],
  output_count: 5,
  wet_count: 3,
  dirty_count: 2,
  potty_wet_count: 0,
  potty_dirty_count: 0,
  accident_wet_count: 0,
  accident_dirty_count: 0,
  breast_min: 30,
  pumped_ml: 0,
  formula_ml: 0,
}

describe('Stats page', () => {
  beforeEach(async () => {
    vi.resetAllMocks()
    const { getDailyStats, getEarliestEventDate } = await import('@/lib/stats')
    vi.mocked(getDailyStats).mockResolvedValue([defaultStat])
    // Far in the past so it never affects fixed-range clamping by default
    vi.mocked(getEarliestEventDate).mockResolvedValue(new Date('2024-01-01T00:00:00Z'))
  })

  it('renders range selector with 3 buttons', async () => {
    render(<Stats />)
    expect(screen.getByRole('button', { name: '7 days' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '30 days' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'All time' })).toBeInTheDocument()
  })

  it('shows loading state initially', () => {
    render(<Stats />)
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('renders chart sections after data loads', async () => {
    render(<Stats />)
    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument())
    expect(screen.getByText('Sleep')).toBeInTheDocument()
    expect(screen.getByText('Feeding')).toBeInTheDocument()
    expect(screen.getByText('Output')).toBeInTheDocument()
  })

  it('shows error message when fetch fails', async () => {
    const { getDailyStats } = await import('@/lib/stats')
    vi.mocked(getDailyStats).mockRejectedValueOnce(new Error('network'))
    render(<Stats />)
    await waitFor(() => expect(screen.getByText('Failed to load stats')).toBeInTheDocument())
  })

  it('shows empty state when no data in range', async () => {
    const { getDailyStats } = await import('@/lib/stats')
    vi.mocked(getDailyStats).mockResolvedValueOnce([])
    render(<Stats />)
    await waitFor(() =>
      expect(screen.getByText('No data for this period')).toBeInTheDocument(),
    )
  })

  it('All time button is active by default', () => {
    render(<Stats />)
    expect(screen.getByRole('button', { name: 'All time' }).className).toContain('bg-primary')
    expect(screen.getByRole('button', { name: '7 days' }).className).not.toContain('bg-primary')
    expect(screen.getByRole('button', { name: '30 days' }).className).not.toContain('bg-primary')
  })

  it('clicking 30 days makes that button active', async () => {
    render(<Stats />)
    fireEvent.click(screen.getByRole('button', { name: '30 days' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '30 days' }).className).toContain('bg-primary'),
    )
    expect(screen.getByRole('button', { name: '7 days' }).className).not.toContain('bg-primary')
  })

  it('calls getEarliestEventDate for all range types', async () => {
    const { getEarliestEventDate } = await import('@/lib/stats')
    render(<Stats />)
    // Initial load (default 'all')
    await waitFor(() => expect(vi.mocked(getEarliestEventDate)).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('button', { name: '7 days' }))
    await waitFor(() => expect(vi.mocked(getEarliestEventDate)).toHaveBeenCalledTimes(2))

    fireEvent.click(screen.getByRole('button', { name: '30 days' }))
    await waitFor(() => expect(vi.mocked(getEarliestEventDate)).toHaveBeenCalledTimes(3))
  })

  it('clamps from date to earliest event when within 7d window', async () => {
    const { getDailyStats, getEarliestEventDate } = await import('@/lib/stats')
    const threeDaysAgo = new Date()
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
    threeDaysAgo.setHours(14, 0, 0, 0) // mid-day — clamping should normalise to midnight
    vi.mocked(getEarliestEventDate).mockResolvedValue(threeDaysAgo)

    render(<Stats />)
    await waitFor(() => expect(vi.mocked(getDailyStats)).toHaveBeenCalledTimes(1))

    vi.mocked(getDailyStats).mockClear()
    fireEvent.click(screen.getByRole('button', { name: '7 days' }))

    await waitFor(() => expect(vi.mocked(getDailyStats)).toHaveBeenCalledTimes(1))
    const [fromArg] = vi.mocked(getDailyStats).mock.calls[0]
    const expectedFrom = new Date(threeDaysAgo)
    expectedFrom.setHours(0, 0, 0, 0)
    expect(fromArg.toDateString()).toBe(expectedFrom.toDateString())
    expect(fromArg.getHours()).toBe(0)
  })

  it('clamps from date to earliest event when within 30d window', async () => {
    const { getDailyStats, getEarliestEventDate } = await import('@/lib/stats')
    const tenDaysAgo = new Date()
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10)
    tenDaysAgo.setHours(9, 0, 0, 0)
    vi.mocked(getEarliestEventDate).mockResolvedValue(tenDaysAgo)

    render(<Stats />)
    await waitFor(() => expect(vi.mocked(getDailyStats)).toHaveBeenCalledTimes(1))

    vi.mocked(getDailyStats).mockClear()
    fireEvent.click(screen.getByRole('button', { name: '30 days' }))

    await waitFor(() => expect(vi.mocked(getDailyStats)).toHaveBeenCalledTimes(1))
    const [fromArg] = vi.mocked(getDailyStats).mock.calls[0]
    const expectedFrom = new Date(tenDaysAgo)
    expectedFrom.setHours(0, 0, 0, 0)
    expect(fromArg.toDateString()).toBe(expectedFrom.toDateString())
    expect(fromArg.getHours()).toBe(0)
  })

  it('does not clamp from date when earliest event predates 7d window', async () => {
    const { getDailyStats, getEarliestEventDate } = await import('@/lib/stats')
    const twentyDaysAgo = new Date()
    twentyDaysAgo.setDate(twentyDaysAgo.getDate() - 20)
    vi.mocked(getEarliestEventDate).mockResolvedValue(twentyDaysAgo)

    render(<Stats />)
    await waitFor(() => expect(vi.mocked(getDailyStats)).toHaveBeenCalledTimes(1))

    vi.mocked(getDailyStats).mockClear()
    fireEvent.click(screen.getByRole('button', { name: '7 days' }))

    await waitFor(() => expect(vi.mocked(getDailyStats)).toHaveBeenCalledTimes(1))
    const [fromArg] = vi.mocked(getDailyStats).mock.calls[0]
    const sixDaysAgo = new Date()
    sixDaysAgo.setDate(sixDaysAgo.getDate() - 6)
    sixDaysAgo.setHours(0, 0, 0, 0)
    expect(fromArg.toDateString()).toBe(sixDaysAgo.toDateString())
  })

  it('does not clamp when no events exist (null earliest)', async () => {
    const { getDailyStats, getEarliestEventDate } = await import('@/lib/stats')
    vi.mocked(getEarliestEventDate).mockResolvedValue(null)

    render(<Stats />)
    await waitFor(() => expect(vi.mocked(getDailyStats)).toHaveBeenCalledTimes(1))

    vi.mocked(getDailyStats).mockClear()
    fireEvent.click(screen.getByRole('button', { name: '7 days' }))

    await waitFor(() => expect(vi.mocked(getDailyStats)).toHaveBeenCalledTimes(1))
    const [fromArg] = vi.mocked(getDailyStats).mock.calls[0]
    const sixDaysAgo = new Date()
    sixDaysAgo.setDate(sixDaysAgo.getDate() - 6)
    sixDaysAgo.setHours(0, 0, 0, 0)
    expect(fromArg.toDateString()).toBe(sixDaysAgo.toDateString())
  })
})
