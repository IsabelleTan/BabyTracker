import { api } from './api'

export interface AuthUser {
  user_id: string
  display_name: string
  baby_id: string | null
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const form = new URLSearchParams({ username: email, password })
  const { data } = await api.post('/auth/login', form)
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
  return !!localStorage.getItem('token')
}
