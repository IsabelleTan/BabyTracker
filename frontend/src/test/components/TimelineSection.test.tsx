import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TimelineSection from '@/components/home/TimelineSection'
import type { BabyEvent } from '@/lib/events'

function makeEvent(overrides: Partial<BabyEvent> & { type: BabyEvent['type'] }): BabyEvent {
  return {
    id: Math.random().toString(36).slice(2),
    logged_by: 'user-1',
    display_name: 'Parent 1',
    timestamp: new Date().toISOString(),
    metadata: null,
    ...overrides,
  }
}

const FEED = makeEvent({ id: 'feed-1', type: 'feed', metadata: { breast_left_min: 10, breast_right_min: 8 } })
const OUTPUT = makeEvent({ id: 'out-1', type: 'output', metadata: { diaper_type: 'wet', location: 'diaper' } })
const SLEEP_START = makeEvent({ id: 'ss-1', type: 'sleep_start' })
const SLEEP_END = makeEvent({ id: 'se-1', type: 'sleep_end' })

describe('TimelineSection — empty state', () => {
  it('shows empty message when no events', () => {
    render(<TimelineSection events={[]} onEditEvent={vi.fn()} />)
    expect(screen.getByText(/no events/i)).toBeInTheDocument()
  })
})

describe('TimelineSection — section title', () => {
  it('shows "Timeline" heading', () => {
    render(<TimelineSection events={[FEED]} onEditEvent={vi.fn()} />)
    expect(screen.getByText('Timeline')).toBeInTheDocument()
  })
})

describe('TimelineSection — marker rendering', () => {
  it('renders feed and output events as tappable markers', () => {
    render(<TimelineSection events={[FEED, OUTPUT]} onEditEvent={vi.fn()} />)
    expect(screen.getByText(/Breast/)).toBeInTheDocument()
    expect(screen.getByText('Pee')).toBeInTheDocument()
  })

  it('does not render sleep events as markers', () => {
    render(<TimelineSection events={[SLEEP_START, SLEEP_END]} onEditEvent={vi.fn()} />)
    expect(screen.queryByText('Feed')).not.toBeInTheDocument()
    expect(screen.queryByText('Output')).not.toBeInTheDocument()
  })

  it('calls onEditEvent with the correct event when a marker is tapped', () => {
    const onEditEvent = vi.fn()
    render(<TimelineSection events={[FEED]} onEditEvent={onEditEvent} />)
    fireEvent.click(screen.getByRole('button', { name: /edit feed event/i }))
    expect(onEditEvent).toHaveBeenCalledWith(FEED)
  })

  it('calls onEditEvent with the correct event for output markers', () => {
    const onEditEvent = vi.fn()
    render(<TimelineSection events={[OUTPUT]} onEditEvent={onEditEvent} />)
    fireEvent.click(screen.getByRole('button', { name: /edit output event/i }))
    expect(onEditEvent).toHaveBeenCalledWith(OUTPUT)
  })
})

describe('TimelineSection — event detail text', () => {
  it('shows breast feed detail', () => {
    render(<TimelineSection events={[FEED]} onEditEvent={vi.fn()} />)
    expect(screen.getByText(/Breast/)).toBeInTheDocument()
  })

  it('shows output detail', () => {
    render(<TimelineSection events={[OUTPUT]} onEditEvent={vi.fn()} />)
    expect(screen.getByText('Pee')).toBeInTheDocument()
  })

  it('shows formula feed detail', () => {
    const formulaFeed = makeEvent({ type: 'feed', metadata: { formula_ml: 90 } })
    render(<TimelineSection events={[formulaFeed]} onEditEvent={vi.fn()} />)
    expect(screen.getByText(/Formula/)).toBeInTheDocument()
    expect(screen.getByText(/90ml/)).toBeInTheDocument()
  })

  it('shows combined breast+pumped detail with separator', () => {
    const combined = makeEvent({ type: 'feed', metadata: { breast_left_min: 5, pumped_ml: 60 } })
    render(<TimelineSection events={[combined]} onEditEvent={vi.fn()} />)
    expect(screen.getByText(/Breast/)).toBeInTheDocument()
    expect(screen.getByText(/Pumped/)).toBeInTheDocument()
  })
})

describe('TimelineSection — sleep conflict warnings', () => {
  it('shows "Missing wake-up?" warning for two consecutive sleep_starts', () => {
    const t1 = new Date(Date.now() - 4 * 3_600_000).toISOString()
    const t2 = new Date(Date.now() - 2 * 3_600_000).toISOString()
    const ss1 = makeEvent({ id: 'ss1', type: 'sleep_start', timestamp: t1 })
    const ss2 = makeEvent({ id: 'ss2', type: 'sleep_start', timestamp: t2 })
    render(<TimelineSection events={[ss1, ss2]} onEditEvent={vi.fn()} />)
    expect(screen.getByText('Missing wake-up?')).toBeInTheDocument()
  })

  it('shows "Missing sleep start?" warning for two consecutive sleep_ends', () => {
    const t1 = new Date(Date.now() - 4 * 3_600_000).toISOString()
    const t2 = new Date(Date.now() - 2 * 3_600_000).toISOString()
    const se1 = makeEvent({ id: 'se1', type: 'sleep_end', timestamp: t1 })
    const se2 = makeEvent({ id: 'se2', type: 'sleep_end', timestamp: t2 })
    render(<TimelineSection events={[se1, se2]} onEditEvent={vi.fn()} />)
    expect(screen.getByText('Missing sleep start?')).toBeInTheDocument()
  })

  it('shows no warning for a normal orphanBottom (first event is sleep_end)', () => {
    const se = makeEvent({ type: 'sleep_end', timestamp: new Date(Date.now() - 2 * 3_600_000).toISOString() })
    render(<TimelineSection events={[se]} onEditEvent={vi.fn()} />)
    expect(screen.queryByText(/Missing/)).not.toBeInTheDocument()
  })

  it('shows no warning for a normal orphanTop (currently sleeping)', () => {
    const ss = makeEvent({ type: 'sleep_start', timestamp: new Date(Date.now() - 2 * 3_600_000).toISOString() })
    render(<TimelineSection events={[ss]} onEditEvent={vi.fn()} />)
    expect(screen.queryByText(/Missing/)).not.toBeInTheDocument()
  })

  it('shows no warning for a correctly paired sleep_start + sleep_end', () => {
    const t1 = new Date(Date.now() - 4 * 3_600_000).toISOString()
    const t2 = new Date(Date.now() - 2 * 3_600_000).toISOString()
    const ss = makeEvent({ type: 'sleep_start', timestamp: t1 })
    const se = makeEvent({ type: 'sleep_end',   timestamp: t2 })
    render(<TimelineSection events={[ss, se]} onEditEvent={vi.fn()} />)
    expect(screen.queryByText(/Missing/)).not.toBeInTheDocument()
  })
})

describe('TimelineSection — feed intervals', () => {
  it('shows elapsed interval between consecutive feeds', () => {
    const t1 = new Date(Date.now() - 4 * 3_600_000).toISOString() // 4 h ago
    const t2 = new Date(Date.now() - 1 * 3_600_000).toISOString() // 1 h ago
    const feed1 = makeEvent({ id: 'f1', type: 'feed', timestamp: t1, metadata: { breast_left_min: null } })
    const feed2 = makeEvent({ id: 'f2', type: 'feed', timestamp: t2, metadata: { breast_left_min: null } })
    render(<TimelineSection events={[feed1, feed2]} onEditEvent={vi.fn()} />)
    // Interval should be approximately 3h; displayed as "+3h"
    expect(screen.getByText('+3h')).toBeInTheDocument()
  })

  it('does not show an interval for the oldest feed', () => {
    const t1 = new Date(Date.now() - 4 * 3_600_000).toISOString()
    const t2 = new Date(Date.now() - 1 * 3_600_000).toISOString()
    const feed1 = makeEvent({ id: 'f1', type: 'feed', timestamp: t1, metadata: { breast_left_min: null } })
    const feed2 = makeEvent({ id: 'f2', type: 'feed', timestamp: t2, metadata: { breast_left_min: null } })
    render(<TimelineSection events={[feed1, feed2]} onEditEvent={vi.fn()} />)
    // Only one "+3h" — the oldest feed shows no interval
    expect(screen.getAllByText(/^\+/).length).toBe(1)
  })

  it('does not show interval for output events', () => {
    const out1 = makeEvent({ type: 'output', metadata: { diaper_type: 'wet', location: 'diaper' } })
    const out2 = makeEvent({ type: 'output', metadata: { diaper_type: 'dirty', location: 'diaper' } })
    render(<TimelineSection events={[out1, out2]} onEditEvent={vi.fn()} />)
    expect(screen.queryByText(/^\+/)).not.toBeInTheDocument()
  })
})
