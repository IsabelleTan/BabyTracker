import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { api } from '@/lib/api'

function mockFetch(status: number, body?: unknown) {
  const contentType = body !== undefined ? 'application/json' : undefined
  const headers = new Headers(contentType ? { 'content-type': contentType } : {})
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    status,
    ok: status >= 200 && status < 300,
    headers,
    json: () => Promise.resolve(body),
  }))
}

beforeEach(() => {
  localStorage.clear()
  Object.defineProperty(window, 'location', {
    value: { ...window.location, href: '' },
    writable: true,
    configurable: true,
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('API — 401 handling', () => {
  it('clears token and user from localStorage on 401', async () => {
    localStorage.setItem('token', 'tok')
    localStorage.setItem('user', '{"user_id":"u1"}')

    mockFetch(401)
    await api.get('/test').catch(() => {})

    expect(localStorage.getItem('token')).toBeNull()
    expect(localStorage.getItem('user')).toBeNull()
  })

  it('redirects to /login on 401', async () => {
    mockFetch(401)
    await api.get('/test').catch(() => {})
    expect(window.location.href).toBe('/login')
  })

  it('does not clear storage for non-401 errors', async () => {
    localStorage.setItem('token', 'tok')

    mockFetch(500)
    await api.get('/test').catch(() => {})

    expect(localStorage.getItem('token')).toBe('tok')
  })

  it('re-rejects the promise so callers can handle the error', async () => {
    mockFetch(500)
    await expect(api.get('/test')).rejects.toThrow()
  })
})

describe('API — request behaviour', () => {
  it('sends Authorization header when token is present', async () => {
    localStorage.setItem('token', 'my-token')
    mockFetch(200, { ok: true })

    await api.get('/test')

    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect((init?.headers as Record<string, string>)['Authorization']).toBe('Bearer my-token')
  })

  it('appends query params to the URL', async () => {
    mockFetch(200, [])

    await api.get('/events', { params: { limit: 10, type: 'feed' } })

    const [url] = vi.mocked(fetch).mock.calls[0]
    expect(url).toContain('limit=10')
    expect(url).toContain('type=feed')
  })
})
