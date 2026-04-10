import { describe, it, expect, beforeEach } from 'vitest'
import { isAuthenticated, getUser } from '@/lib/auth'

beforeEach(() => {
  localStorage.clear()
})

describe('isAuthenticated', () => {
  it('returns false when no token', () => {
    expect(isAuthenticated()).toBe(false)
  })

  it('returns true when token is set', () => {
    localStorage.setItem('token', 'some-jwt')
    expect(isAuthenticated()).toBe(true)
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
