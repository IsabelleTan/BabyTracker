import { describe, it, expect, vi, afterEach } from 'vitest'
import { toDateTimeLocal, fromDateTimeLocal, currentDayStart, currentDayEnd, getAllEvents } from '@/lib/events'

describe('toDateTimeLocal', () => {
  it('formats a UTC date to a local datetime-local string', () => {
    // Use a fixed UTC date: 2024-01-15T10:30:00Z
    const date = new Date('2024-01-15T10:30:00Z')
    const result = toDateTimeLocal(date)
    // Should be 16 chars (YYYY-MM-DDTHH:mm) and parseable
    expect(result).toHaveLength(16)
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
  })

  it('round-trips through fromDateTimeLocal within a minute', () => {
    const original = new Date('2024-06-20T08:00:00Z')
    const localStr = toDateTimeLocal(original)
    const backToUtc = new Date(fromDateTimeLocal(localStr))
    // Difference should be less than 60 seconds (we lose seconds in datetime-local)
    expect(Math.abs(backToUtc.getTime() - original.getTime())).toBeLessThan(60_000)
  })
})

describe('fromDateTimeLocal', () => {
  it('converts a datetime-local string to a UTC ISO string', () => {
    const result = fromDateTimeLocal('2024-01-15T10:30')
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/)
  })
})

describe('currentDayEnd — end-of-day boundary', () => {
  afterEach(() => vi.useRealTimers())

  it('returns 23:59:59.999 of the same calendar day', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 5, 20, 10, 0, 0))
    const d = currentDayEnd()
    expect(d.getFullYear()).toBe(2024)
    expect(d.getMonth()).toBe(5)
    expect(d.getDate()).toBe(20)
    expect(d.getHours()).toBe(23)
    expect(d.getMinutes()).toBe(59)
    expect(d.getSeconds()).toBe(59)
    expect(d.getMilliseconds()).toBe(999)
  })

  it('accepts a base date and does not mutate it', () => {
    const base = new Date(2024, 0, 1, 8, 0, 0)
    const original = base.getTime()
    const d = currentDayEnd(base)
    expect(d.getDate()).toBe(1)
    expect(d.getHours()).toBe(23)
    expect(base.getTime()).toBe(original)
  })
})

describe('getAllEvents', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('calls /events with from_ and to as ISO strings', async () => {
    const mockEvents = [{ id: '1', type: 'feed', timestamp: '2024-01-15T10:00:00Z', logged_by: 'u1', display_name: 'Alice', metadata: null }]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve(mockEvents),
    }))

    const from = new Date('2024-01-01T00:00:00.000Z')
    const to = new Date('2024-01-31T23:59:59.999Z')
    const result = await getAllEvents(from, to)

    const [url] = vi.mocked(fetch).mock.calls[0]
    expect(url).toContain('from_=2024-01-01T00%3A00%3A00.000Z')
    expect(url).toContain('to=2024-01-31T23%3A59%3A59.999Z')
    expect(result).toEqual(mockEvents)
  })
})

describe('currentDayStart — midnight day boundary', () => {
  afterEach(() => vi.useRealTimers())

  it('at 10am returns 00:00 of the same calendar day', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 5, 20, 10, 0, 0)) // June 20 10:00am
    const d = currentDayStart()
    expect(d.getFullYear()).toBe(2024)
    expect(d.getMonth()).toBe(5)   // June
    expect(d.getDate()).toBe(20)
    expect(d.getHours()).toBe(0)
    expect(d.getMinutes()).toBe(0)
    expect(d.getSeconds()).toBe(0)
  })

  it('at exactly midnight returns 00:00 of the same calendar day', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 5, 20, 0, 0, 0))
    const d = currentDayStart()
    expect(d.getDate()).toBe(20)
    expect(d.getHours()).toBe(0)
  })

  it('at 4:59am belongs to the current calendar day (returns 00:00 today)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 5, 20, 4, 59, 0))
    const d = currentDayStart()
    expect(d.getDate()).toBe(20)   // June 20
    expect(d.getHours()).toBe(0)
  })

  it('at 3am belongs to the current calendar day (returns 00:00 today)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 5, 20, 3, 0, 0))
    const d = currentDayStart()
    expect(d.getDate()).toBe(20)
    expect(d.getHours()).toBe(0)
  })

  it('at 2am on the first of a month returns 00:00 of that day', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 6, 1, 2, 0, 0)) // July 1 2am
    const d = currentDayStart()
    expect(d.getMonth()).toBe(6)   // July
    expect(d.getDate()).toBe(1)
    expect(d.getHours()).toBe(0)
  })
})
