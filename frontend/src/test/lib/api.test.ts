import { describe, it, expect, beforeEach } from 'vitest'
import { api } from '@/lib/api'

// Suppress jsdom's "Not implemented: navigation" warning when the interceptor
// sets window.location.href = '/login'.
const { location } = window
beforeEach(() => {
  localStorage.clear()
  Object.defineProperty(window, 'location', {
    value: { ...location, href: '' },
    writable: true,
    configurable: true,
  })
})

type InterceptorHandler = {
  fulfilled: unknown
  rejected: (err: unknown) => Promise<never>
}

function getResponseRejectionHandler(): InterceptorHandler['rejected'] {
  const handlers = (api.interceptors.response as unknown as { handlers: InterceptorHandler[] }).handlers
  const h = handlers.find((h) => h?.rejected)
  if (!h) throw new Error('No response rejection handler registered on api')
  return h.rejected
}

describe('API response interceptor — 401 handling', () => {
  it('clears token and user from localStorage on 401', async () => {
    localStorage.setItem('token', 'tok')
    localStorage.setItem('user', '{"user_id":"u1"}')

    const err = { response: { status: 401 }, isAxiosError: true }
    await getResponseRejectionHandler()(err).catch(() => {})

    expect(localStorage.getItem('token')).toBeNull()
    expect(localStorage.getItem('user')).toBeNull()
  })

  it('redirects to /login on 401', async () => {
    const err = { response: { status: 401 }, isAxiosError: true }
    await getResponseRejectionHandler()(err).catch(() => {})
    expect(window.location.href).toBe('/login')
  })

  it('does not clear storage for non-401 errors', async () => {
    localStorage.setItem('token', 'tok')

    const err = { response: { status: 500 }, isAxiosError: true }
    await getResponseRejectionHandler()(err).catch(() => {})

    expect(localStorage.getItem('token')).toBe('tok')
  })

  it('re-rejects the promise so callers can handle the error', async () => {
    const err = { response: { status: 500 }, isAxiosError: true }
    await expect(getResponseRejectionHandler()(err)).rejects.toBe(err)
  })
})
