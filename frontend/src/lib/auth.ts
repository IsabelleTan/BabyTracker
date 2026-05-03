import { api } from './api'

export interface AuthUser {
  user_id: string
  display_name: string
  baby_id: string | null
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const form = new URLSearchParams({ username: email, password })
  const { data } = await api.post<{ access_token: string; user_id: string; display_name: string; baby_id: string | null }>('/auth/login', form)
  localStorage.setItem('token', data.access_token)
  const user: AuthUser = { user_id: data.user_id, display_name: data.display_name, baby_id: data.baby_id ?? null }
  localStorage.setItem('user', JSON.stringify(user))
  return user
}

export function logout() {
  localStorage.removeItem('token')
  localStorage.removeItem('user')
}

export function getUser(): AuthUser | null {
  const raw = localStorage.getItem('user')
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    localStorage.removeItem('user')
    return null
  }
}

export function isAuthenticated(): boolean {
  const token = localStorage.getItem('token')
  if (!token) return false
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return payload.exp * 1000 > Date.now()
  } catch {
    return false
  }
}
