import { describe, it, expect } from 'vitest'
import { niceStep, computeYTicks, computeYTicksMulti } from '@/lib/chartUtils'

describe('niceStep', () => {
  it('returns 1 when max is 0', () => {
    expect(niceStep(0)).toBe(1)
  })

  it('returns 1 for max ≤ 5', () => {
    expect(niceStep(1)).toBe(1)
    expect(niceStep(5)).toBe(1)
  })

  it('returns 2 for max ≤ 10', () => {
    expect(niceStep(6)).toBe(2)
    expect(niceStep(10)).toBe(2)
  })

  it('returns a round step for larger values', () => {
    // max=100 → rough=25 → exp=1, pow=10, n=2.5 → 2*10=20
    expect(niceStep(100)).toBe(20)
    // max=50 → rough=12.5 → exp=1, pow=10, n=1.25 → 10
    expect(niceStep(50)).toBe(10)
    // max=1000 → rough=250 → exp=2, pow=100, n=2.5 → 200
    expect(niceStep(1000)).toBe(200)
  })
})

describe('computeYTicks', () => {
  it('returns tick [0,1] and domain [0,1] for empty data', () => {
    const { ticks, domain } = computeYTicks([], 'val')
    expect(ticks).toEqual([0, 1])
    expect(domain).toEqual([0, 1])
  })

  it('computes ticks up to the ceiling of max', () => {
    const data = [{ val: 8 }, { val: 6 }, { val: 3 }]
    const { ticks, domain } = computeYTicks(data, 'val')
    // max=8, niceStep(8)=2, domainMax=8 → ticks 0,2,4,6,8
    expect(ticks).toEqual([0, 2, 4, 6, 8])
    expect(domain).toEqual([0, 8])
  })

  it('ignores null and undefined values', () => {
    const data = [{ val: 4 }, { val: null }, { val: undefined }]
    const { domain } = computeYTicks(data, 'val')
    // max=4, step=1, domainMax=4
    expect(domain).toEqual([0, 4])
  })

  it('respects an explicit tickStep override', () => {
    const data = [{ val: 7 }]
    const { ticks, domain } = computeYTicks(data, 'val', 5)
    // step=5, domainMax=ceil(7/5)*5=10
    expect(ticks).toEqual([0, 5, 10])
    expect(domain).toEqual([0, 10])
  })
})

describe('computeYTicksMulti', () => {
  it('uses the max across all specified keys', () => {
    const data = [{ a: 3, b: 9 }, { a: 7, b: 2 }]
    const { domain } = computeYTicksMulti(data, ['a', 'b'])
    // max=9, step=2, domainMax=10
    expect(domain[1]).toBe(10)
  })

  it('handles empty data gracefully', () => {
    const { ticks, domain } = computeYTicksMulti([], ['a', 'b'])
    expect(ticks).toEqual([0, 1])
    expect(domain).toEqual([0, 1])
  })
})
