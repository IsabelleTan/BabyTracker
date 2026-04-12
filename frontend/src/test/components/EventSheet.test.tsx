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

  it('switching to bottle shows ml field and hides breast fields', () => {
    render(<EventSheet type="feed" onSave={onSave} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole('button', { name: /bottle/i }))
    expect(screen.queryByLabelText('Left (min)')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Amount (ml)')).toBeInTheDocument()
  })

  it('save as bottle sends amount_ml in metadata', () => {
    render(<EventSheet type="feed" onSave={onSave} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole('button', { name: /bottle/i }))
    fireEvent.change(screen.getByLabelText('Amount (ml)'), { target: { value: '120' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    const [, metadata] = onSave.mock.calls[0]
    expect(metadata).toMatchObject({ feed_type: 'bottle', amount_ml: 120 })
  })

  it('save as bottle with empty ml sends null', () => {
    render(<EventSheet type="feed" onSave={onSave} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole('button', { name: /bottle/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    const [, metadata] = onSave.mock.calls[0]
    expect(metadata).toMatchObject({ feed_type: 'bottle', amount_ml: null })
  })
})

describe('EventSheet — diaper', () => {
  const onSave = vi.fn()
  const onDismiss = vi.fn()

  beforeEach(() => vi.clearAllMocks())

  it('renders diaper type selector', () => {
    render(<EventSheet type="diaper" onSave={onSave} onDismiss={onDismiss} />)
    expect(screen.getByText('Diaper')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /wet/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /dirty/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /both/i })).toBeInTheDocument()
  })

  it('save sends default diaper_type wet', () => {
    render(<EventSheet type="diaper" onSave={onSave} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    const [, metadata] = onSave.mock.calls[0]
    expect(metadata).toEqual({ diaper_type: 'wet' })
  })

  it('selecting dirty changes the saved diaper_type', () => {
    render(<EventSheet type="diaper" onSave={onSave} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole('button', { name: /dirty/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    const [, metadata] = onSave.mock.calls[0]
    expect(metadata).toEqual({ diaper_type: 'dirty' })
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
