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
  getDailyStats: vi.fn().mockResolvedValue([
    {
      date: '2024-01-15',
      feed_count: 8,
      avg_feed_interval_min: 180,
      total_sleep_min: 480,
      sleep_session_count: 3,
      avg_sleep_session_min: 160,
      avg_wake_min: 60,
      output_count: 5,
      wet_count: 3,
      dirty_count: 2,
      potty_wet_count: 0,
      potty_dirty_count: 0,
    },
  ]),
  getEarliestEventDate: vi.fn().mockResolvedValue(new Date('2024-01-01T00:00:00Z')),
}))

describe('Stats page', () => {
  beforeEach(() => vi.clearAllMocks())

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

  it('7d button is active by default', async () => {
    render(<Stats />)
    // The active button has different styling — check it has the primary class
    const btn7d = screen.getByRole('button', { name: '7 days' })
    expect(btn7d.className).toContain('bg-primary')
    const btn30d = screen.getByRole('button', { name: '30 days' })
    expect(btn30d.className).not.toContain('bg-primary')
  })

  it('clicking 30 days makes that button active', async () => {
    render(<Stats />)
    fireEvent.click(screen.getByRole('button', { name: '30 days' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '30 days' }).className).toContain('bg-primary'),
    )
    expect(screen.getByRole('button', { name: '7 days' }).className).not.toContain('bg-primary')
  })

  it('clicking All time calls getEarliestEventDate', async () => {
    const { getEarliestEventDate } = await import('@/lib/stats')
    render(<Stats />)
    fireEvent.click(screen.getByRole('button', { name: 'All time' }))
    await waitFor(() => expect(vi.mocked(getEarliestEventDate)).toHaveBeenCalledOnce())
  })
})
