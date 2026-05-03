export interface HttpError extends Error {
  status: number
}

type Params = Record<string, string | number | boolean | undefined>

export type ApiResponse<T> = {
  status: number
  data: T
}

function buildUrl(path: string, params?: Params): string {
  const url = '/api' + path
  if (!params) return url
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) qs.set(k, String(v))
  }
  const s = qs.toString()
  return s ? `${url}?${s}` : url
}

async function request<T>(method: string, path: string, body?: unknown, params?: Params): Promise<ApiResponse<T>> {
  const token = localStorage.getItem('token')
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (body instanceof URLSearchParams) headers['Content-Type'] = 'application/x-www-form-urlencoded'
  else if (body !== undefined) headers['Content-Type'] = 'application/json'

  const res = await fetch(buildUrl(path, params), {
    method,
    headers,
    body: body instanceof URLSearchParams ? body.toString() : body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (res.status === 401) {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    window.location.href = '/login'
    return Promise.reject(Object.assign(new Error('Unauthorized'), { status: 401 }))
  }

  if (!res.ok) {
    return Promise.reject(Object.assign(new Error(`Request failed: ${res.status}`), { status: res.status }))
  }

  const contentType = res.headers.get('content-type')
  // Starlette 1.x incorrectly includes content-type: application/json on 204/304 responses.
  // Guard by status code — these must never have a body per the HTTP spec.
  const hasBody = res.status !== 204 && res.status !== 304
  const data = (hasBody && contentType?.includes('application/json')) ? (await res.json() as T) : (undefined as T)

  return { status: res.status, data }
}

export const api = {
  get: <T>(path: string, options?: { params?: Params }) =>
    request<T>('GET', path, undefined, options?.params),
  post: <T>(path: string, body?: unknown) =>
    request<T>('POST', path, body),
  delete: <T>(path: string) =>
    request<T>('DELETE', path),
}
