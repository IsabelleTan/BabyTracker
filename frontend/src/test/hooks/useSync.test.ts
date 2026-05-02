import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useSync } from '@/hooks/useSync'
import * as db from '@/lib/db'
import * as events from '@/lib/events'

vi.mock('@/lib/db', () => ({
  addPending: vi.fn().mockResolvedValue(undefined),
  removePending: vi.fn().mockResolvedValue(undefined),
  getAllPending: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/lib/events', () => ({
  logEvent: vi.fn(),
  getLast24HoursEvents: vi.fn().mockResolvedValue([]),
  getNightSessionEvents: vi.fn().mockResolvedValue([]),
  isInNightSession: vi.fn().mockReturnValue(false),
  deleteEvent: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  getUser: vi.fn().mockReturnValue({ user_id: 'u1', display_name: 'Parent 1' }),
}))

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn().mockResolvedValue({ data: { current_potty_streak: 0, total_potty_events: 0, days_logged_total: 0 } }),
  },
}))

const PAYLOAD = {
  id: 'evt-001',
  type: 'feed' as const,
  timestamp: new Date().toISOString(),
  metadata: null,
}

const MOCK_RESPONSE = {
  id: 'evt-001',
  type: 'feed',
  timestamp: new Date().toISOString(),
  logged_by: 'u1',
  display_name: 'Parent 1',
  metadata: null,
}

describe('useSync.sync — pending queue flush order', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(events.getLast24HoursEvents).mockResolvedValue([])
  })

  it('flushes the pending queue in FIFO order', async () => {
    const pending = [
      { id: 'p1', type: 'feed', timestamp: '2024-01-15T08:00:00Z', metadata: null },
      { id: 'p2', type: 'output', timestamp: '2024-01-15T09:00:00Z', metadata: null },
      { id: 'p3', type: 'sleep_start', timestamp: '2024-01-15T10:00:00Z', metadata: null },
    ]
    vi.mocked(db.getAllPending)
      .mockResolvedValueOnce(pending)  // during flush
      .mockResolvedValue([])           // after flush (finally block)
    vi.mocked(events.logEvent).mockResolvedValue(MOCK_RESPONSE as events.BabyEvent)

    const { result } = renderHook(() => useSync())
    await waitFor(() => expect(result.current.lastSynced).not.toBeNull())

    const flushedIds = vi.mocked(events.logEvent).mock.calls.map((c) => c[0].id)
    expect(flushedIds).toEqual(['p1', 'p2', 'p3'])
  })

  it('stops flushing when an item fails (offline)', async () => {
    const pending = [
      { id: 'q1', type: 'feed', timestamp: '2024-01-15T08:00:00Z', metadata: null },
      { id: 'q2', type: 'feed', timestamp: '2024-01-15T09:00:00Z', metadata: null },
    ]
    vi.mocked(db.getAllPending)
      .mockResolvedValueOnce(pending)
      .mockResolvedValue(pending) // still pending after failed flush
    vi.mocked(events.logEvent).mockRejectedValue(new Error('offline'))

    const { result } = renderHook(() => useSync())
    await waitFor(() => expect(result.current.lastSynced).not.toBeNull())

    // First item attempted, second never sent
    expect(vi.mocked(events.logEvent)).toHaveBeenCalledTimes(1)
    expect(result.current.pendingCount).toBe(2)
  })
})

describe('useSync.log — pending count behaviour', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(db.getAllPending).mockResolvedValue([])
    vi.mocked(events.getLast24HoursEvents).mockResolvedValue([])
    vi.mocked(events.getNightSessionEvents).mockResolvedValue([])
  })

  it('does not increment pendingCount when the API call succeeds (online)', async () => {
    vi.mocked(events.logEvent).mockResolvedValue(MOCK_RESPONSE as events.BabyEvent)

    const { result } = renderHook(() => useSync())
    // Wait for the mount-time sync() to finish so it can't race and reset pendingCount
    await waitFor(() => expect(result.current.lastSynced).not.toBeNull())

    await act(async () => {
      await result.current.log(PAYLOAD)
    })

    expect(result.current.pendingCount).toBe(0)
    expect(db.addPending).not.toHaveBeenCalled()
  })

  it('adds event to nightSessionEvents after sync when isInNightSession returns true', async () => {
    vi.mocked(events.isInNightSession).mockReturnValue(true)
    vi.mocked(events.logEvent).mockResolvedValue(MOCK_RESPONSE as events.BabyEvent)
    // Simulate backend returning the event in the night session after successful POST
    vi.mocked(events.getNightSessionEvents).mockResolvedValue([MOCK_RESPONSE as events.BabyEvent])

    const { result } = renderHook(() => useSync())
    await waitFor(() => expect(result.current.lastSynced).not.toBeNull())

    await act(async () => { await result.current.log(PAYLOAD) })

    expect(result.current.nightSessionEvents).toHaveLength(1)
    expect(result.current.nightSessionEvents[0].id).toBe('evt-001')
  })

  it('does not add event to nightSessionEvents when isInNightSession returns false', async () => {
    vi.mocked(events.isInNightSession).mockReturnValue(false)
    vi.mocked(events.logEvent).mockResolvedValue(MOCK_RESPONSE as events.BabyEvent)

    const { result } = renderHook(() => useSync())
    await waitFor(() => expect(result.current.lastSynced).not.toBeNull())

    await act(async () => { await result.current.log(PAYLOAD) })

    expect(result.current.nightSessionEvents).toHaveLength(0)
  })

  it('increments pendingCount and queues the event when the API call fails (offline)', async () => {
    vi.mocked(events.logEvent).mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useSync())
    // Wait for the mount-time sync() to finish; it would otherwise race and
    // reset pendingCount back to 0 after our log() call queues the event
    await waitFor(() => expect(result.current.lastSynced).not.toBeNull())

    await act(async () => {
      await result.current.log(PAYLOAD)
    })

    // addPending is called without await inside log(), so poll until state settles
    await waitFor(() => expect(result.current.pendingCount).toBe(1))
    expect(db.addPending).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'evt-001', type: 'feed' }),
    )
  })
})
