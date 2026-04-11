import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useNightMode } from '@/hooks/useNightMode'

describe('useNightMode', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
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
})
