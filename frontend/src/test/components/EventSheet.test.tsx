import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import EventSheet from '@/components/home/EventSheet'

// Vaul Drawer relies on browser-only APIs; replace with a simple passthrough
// so we can test EventSheet's form logic in jsdom.
vi.mock('@/components/ui/drawer', () => ({
  Drawer: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="drawer">{children}</div> : null,
  DrawerContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DrawerHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DrawerTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DrawerFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

describe('EventSheet — feed', () => {
  const onSave = vi.fn()
  const onDismiss = vi.fn()

  beforeEach(() => vi.clearAllMocks())

  it('renders breast feed fields by default', () => {
    render(<EventSheet type="feed" onSave={onSave} onDismiss={onDismiss} />)
    expect(screen.getByText('Feed')).toBeInTheDocument()
    expect(screen.getByLabelText('Left (min)')).toBeInTheDocument()
    expect(screen.getByLabelText('Right (min)')).toBeInTheDocument()
  })

  it('save with empty breast fields sends null durations', () => {
    render(<EventSheet type="feed" onSave={onSave} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledOnce()
    const [, metadata] = onSave.mock.calls[0]
    expect(metadata).toMatchObject({
      feed_type: 'breast',
      left_duration_min: null,
      right_duration_min: null,
    })
  })

  it('save with breast durations filled sends numeric values', () => {
    render(<EventSheet type="feed" onSave={onSave} onDismiss={onDismiss} />)
    fireEvent.change(screen.getByLabelText('Left (min)'), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText('Right (min)'), { target: { value: '8' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    const [, metadata] = onSave.mock.calls[0]
    expect(metadata).toMatchObject({ feed_type: 'breast', left_duration_min: 10, right_duration_min: 8 })
  })

  it('switching to pumped shows ml field and hides breast fields', () => {
    render(<EventSheet type="feed" onSave={onSave} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole('button', { name: /pumped/i }))
    expect(screen.queryByLabelText('Left (min)')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Amount (ml)')).toBeInTheDocument()
  })

  it('switching to formula shows ml field and hides breast fields', () => {
    render(<EventSheet type="feed" onSave={onSave} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole('button', { name: /formula/i }))
    expect(screen.queryByLabelText('Left (min)')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Amount (ml)')).toBeInTheDocument()
  })

  it('save as pumped sends bottle_type pumped and amount_ml in metadata', () => {
    render(<EventSheet type="feed" onSave={onSave} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole('button', { name: /pumped/i }))
    fireEvent.change(screen.getByLabelText('Amount (ml)'), { target: { value: '120' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    const [, metadata] = onSave.mock.calls[0]
    expect(metadata).toMatchObject({ feed_type: 'bottle', bottle_type: 'pumped', amount_ml: 120 })
  })

  it('save as formula sends bottle_type formula and amount_ml in metadata', () => {
    render(<EventSheet type="feed" onSave={onSave} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole('button', { name: /formula/i }))
    fireEvent.change(screen.getByLabelText('Amount (ml)'), { target: { value: '90' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    const [, metadata] = onSave.mock.calls[0]
    expect(metadata).toMatchObject({ feed_type: 'bottle', bottle_type: 'formula', amount_ml: 90 })
  })

  it('save as pumped with empty ml sends null', () => {
    render(<EventSheet type="feed" onSave={onSave} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole('button', { name: /pumped/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    const [, metadata] = onSave.mock.calls[0]
    expect(metadata).toMatchObject({ feed_type: 'bottle', bottle_type: 'pumped', amount_ml: null })
  })
})

describe('EventSheet — output', () => {
  const onSave = vi.fn()
  const onDismiss = vi.fn()

  beforeEach(() => vi.clearAllMocks())

  it('renders output type and location selectors', () => {
    render(<EventSheet type="output" onSave={onSave} onDismiss={onDismiss} />)
    expect(screen.getByText('Output')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /pee/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /poo/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /both/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /diaper/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /potty/i })).toBeInTheDocument()
  })

  it('save sends default diaper_type wet and location diaper', () => {
    render(<EventSheet type="output" onSave={onSave} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    const [, metadata] = onSave.mock.calls[0]
    expect(metadata).toEqual({ diaper_type: 'wet', location: 'diaper' })
  })

  it('selecting poo changes the saved diaper_type', () => {
    render(<EventSheet type="output" onSave={onSave} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole('button', { name: /poo/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    const [, metadata] = onSave.mock.calls[0]
    expect(metadata).toEqual({ diaper_type: 'dirty', location: 'diaper' })
  })

  it('selecting potty changes the saved location', () => {
    render(<EventSheet type="output" onSave={onSave} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole('button', { name: /potty/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    const [, metadata] = onSave.mock.calls[0]
    expect(metadata).toEqual({ diaper_type: 'wet', location: 'potty' })
  })
})

describe('EventSheet — sleep', () => {
  const onSave = vi.fn()
  const onDismiss = vi.fn()

  beforeEach(() => vi.clearAllMocks())

  it('sleep_start shows only timestamp, save sends null metadata', () => {
    render(<EventSheet type="sleep_start" onSave={onSave} onDismiss={onDismiss} />)
    expect(screen.getByText('Sleep started')).toBeInTheDocument()
    expect(screen.queryByLabelText('Left (min)')).not.toBeInTheDocument()
    expect(screen.queryByText('Type')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    const [, metadata] = onSave.mock.calls[0]
    expect(metadata).toBeNull()
  })

  it('sleep_end shows only timestamp, save sends null metadata', () => {
    render(<EventSheet type="sleep_end" onSave={onSave} onDismiss={onDismiss} />)
    expect(screen.getByText('Woke up')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    const [, metadata] = onSave.mock.calls[0]
    expect(metadata).toBeNull()
  })
})

describe('EventSheet — edit mode', () => {
  const onSave = vi.fn()
  const onDismiss = vi.fn()
  const onDelete = vi.fn()

  beforeEach(() => vi.clearAllMocks())

  it('shows Delete and Save buttons when onDelete is provided', () => {
    const event: import('@/lib/events').BabyEvent = {
      id: 'e1', type: 'feed', timestamp: new Date().toISOString(),
      logged_by: 'u1', display_name: 'P1',
      metadata: { feed_type: 'breast', left_duration_min: 5, right_duration_min: 3 },
    }
    render(<EventSheet type="feed" initialEvent={event} onSave={onSave} onDelete={onDelete} onDismiss={onDismiss} />)
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('calls onDelete when Delete button is clicked', () => {
    const event: import('@/lib/events').BabyEvent = {
      id: 'e1', type: 'output', timestamp: new Date().toISOString(),
      logged_by: 'u1', display_name: 'P1',
      metadata: { diaper_type: 'wet', location: 'diaper' },
    }
    render(<EventSheet type="output" initialEvent={event} onSave={onSave} onDelete={onDelete} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onDelete).toHaveBeenCalledOnce()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('pre-fills breast durations from initialEvent', () => {
    const event: import('@/lib/events').BabyEvent = {
      id: 'e1', type: 'feed', timestamp: new Date().toISOString(),
      logged_by: 'u1', display_name: 'P1',
      metadata: { feed_type: 'breast', left_duration_min: 12, right_duration_min: 7 },
    }
    render(<EventSheet type="feed" initialEvent={event} onSave={onSave} onDelete={onDelete} onDismiss={onDismiss} />)
    expect((screen.getByLabelText('Left (min)') as HTMLInputElement).value).toBe('12')
    expect((screen.getByLabelText('Right (min)') as HTMLInputElement).value).toBe('7')
  })

  it('pre-fills bottle amount from initialEvent', () => {
    const event: import('@/lib/events').BabyEvent = {
      id: 'e2', type: 'feed', timestamp: new Date().toISOString(),
      logged_by: 'u1', display_name: 'P1',
      metadata: { feed_type: 'bottle', bottle_type: 'formula', amount_ml: 120 },
    }
    render(<EventSheet type="feed" initialEvent={event} onSave={onSave} onDelete={onDelete} onDismiss={onDismiss} />)
    expect((screen.getByLabelText('Amount (ml)') as HTMLInputElement).value).toBe('120')
  })

  it('does not show Delete button without onDelete prop', () => {
    render(<EventSheet type="feed" onSave={onSave} onDismiss={onDismiss} />)
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  })
})

describe('EventSheet — dismiss and closed state', () => {
  it('accepts an onDismiss prop', () => {
    // Dismissal is via tap-outside on the Drawer — not testable in JSDOM.
    // This smoke-test just ensures the component mounts without errors when onDismiss is provided.
    const onDismiss = vi.fn()
    expect(() => render(<EventSheet type="feed" onSave={vi.fn()} onDismiss={onDismiss} />)).not.toThrow()
  })

  it('renders nothing when type is null', () => {
    render(<EventSheet type={null} onSave={vi.fn()} onDismiss={vi.fn()} />)
    expect(screen.queryByTestId('drawer')).not.toBeInTheDocument()
  })
})
