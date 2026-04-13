import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useNightMode } from '@/hooks/useNightMode'

const OVERRIDE_KEY = 'night_mode_override'

describe('useNightMode', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
    localStorage.clear()
  })

  it('is active at 21:00', () => {
    vi.setSystemTime(new Date('2024-01-15T21:00:00'))
    const { result } = renderHook(() => useNightMode())
    expect(result.current.night).toBe(true)
  })

  it('is active at 06:59', () => {
    vi.setSystemTime(new Date('2024-01-15T06:59:00'))
    const { result } = renderHook(() => useNightMode())
    expect(result.current.night).toBe(true)
  })

  it('is not active at 07:00', () => {
    vi.setSystemTime(new Date('2024-01-15T07:00:00'))
    const { result } = renderHook(() => useNightMode())
    expect(result.current.night).toBe(false)
  })

  it('is not active at 20:59', () => {
    vi.setSystemTime(new Date('2024-01-15T20:59:00'))
    const { result } = renderHook(() => useNightMode())
    expect(result.current.night).toBe(false)
  })

  it('manual toggle overrides auto during daytime', () => {
    vi.setSystemTime(new Date('2024-01-15T12:00:00'))
    const { result } = renderHook(() => useNightMode())
    expect(result.current.night).toBe(false)

    act(() => result.current.toggle())
    expect(result.current.night).toBe(true)

    act(() => result.current.toggle())
    expect(result.current.night).toBe(false)
  })

  it('manual toggle overrides auto during night', () => {
    vi.setSystemTime(new Date('2024-01-15T22:00:00'))
    const { result } = renderHook(() => useNightMode())
    expect(result.current.night).toBe(true)

    act(() => result.current.toggle())
    expect(result.current.night).toBe(false)
  })

  it('clears override when clock boundary matches the overridden value', () => {
    // Daytime — user manually enables night mode
    vi.setSystemTime(new Date('2024-01-15T12:00:00'))
    const { result } = renderHook(() => useNightMode())
    act(() => result.current.toggle()) // override = true
    expect(result.current.night).toBe(true)

    // Clock reaches 21:00 — auto becomes true, matching the override → override cleared
    act(() => vi.setSystemTime(new Date('2024-01-15T21:00:00')))
    act(() => vi.advanceTimersByTime(60_000))
    expect(result.current.night).toBe(true) // still night, now via auto

    // With override cleared, toggling off should now stick
    act(() => result.current.toggle())
    expect(result.current.night).toBe(false)
  })

  it('persists override to localStorage on toggle', () => {
    vi.setSystemTime(new Date('2024-01-15T12:00:00'))
    const { result } = renderHook(() => useNightMode())
    expect(localStorage.getItem(OVERRIDE_KEY)).toBeNull()

    act(() => result.current.toggle())
    expect(localStorage.getItem(OVERRIDE_KEY)).toBe('true')

    act(() => result.current.toggle())
    expect(localStorage.getItem(OVERRIDE_KEY)).toBe('false')
  })

  it('reads override from localStorage on mount (simulates page refresh)', () => {
    // Simulate a previous session: user forced night mode during daytime
    localStorage.setItem(OVERRIDE_KEY, 'true')
    vi.setSystemTime(new Date('2024-01-15T12:00:00'))
    const { result } = renderHook(() => useNightMode())
    expect(result.current.night).toBe(true)
  })

  it('clears localStorage when override matches auto at boundary', () => {
    vi.setSystemTime(new Date('2024-01-15T12:00:00'))
    const { result } = renderHook(() => useNightMode())
    act(() => result.current.toggle()) // force night during day
    expect(localStorage.getItem(OVERRIDE_KEY)).toBe('true')

    // Clock hits 21:00 — auto=true matches override=true → override cleared
    act(() => vi.setSystemTime(new Date('2024-01-15T21:00:00')))
    act(() => vi.advanceTimersByTime(60_000))
    expect(localStorage.getItem(OVERRIDE_KEY)).toBeNull()
  })
})
