import { describe, it, expect, beforeEach } from 'vitest'
import { isAuthenticated, getUser } from '@/lib/auth'

beforeEach(() => {
  localStorage.clear()
})

function makeJwt(exp: number): string {
  const payload = btoa(JSON.stringify({ exp }))
  return `header.${payload}.signature`
}

describe('isAuthenticated', () => {
  it('returns false when no token', () => {
    expect(isAuthenticated()).toBe(false)
  })

  it('returns true when token has a future expiry', () => {
    const futureExp = Math.floor(Date.now() / 1000) + 3600 // 1 hour from now
    localStorage.setItem('token', makeJwt(futureExp))
    expect(isAuthenticated()).toBe(true)
  })

  it('returns false when token is expired', () => {
    const pastExp = Math.floor(Date.now() / 1000) - 1 // 1 second ago
    localStorage.setItem('token', makeJwt(pastExp))
    expect(isAuthenticated()).toBe(false)
  })

  it('returns false when token is malformed', () => {
    localStorage.setItem('token', 'not-a-jwt')
    expect(isAuthenticated()).toBe(false)
  })
})

describe('getUser', () => {
  it('returns null when no user in storage', () => {
    expect(getUser()).toBeNull()
  })

  it('returns parsed user when set', () => {
    const user = { user_id: 'u1', display_name: 'Parent 1' }
    localStorage.setItem('user', JSON.stringify(user))
    expect(getUser()).toEqual(user)
  })
})
