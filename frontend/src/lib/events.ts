import { api } from './api'

export type EventType = 'feed' | 'sleep_start' | 'sleep_end' | 'diaper'

export interface BabyEvent {
  id: string
  type: EventType
  timestamp: string
  logged_by: string
  display_name: string
  metadata: Record<string, unknown> | null
}

export interface LogEventPayload {
  id: string
  type: EventType
  timestamp: string
  metadata?: Record<string, unknown> | null
}

export async function logEvent(payload: LogEventPayload): Promise<BabyEvent> {
  const { data } = await api.post<BabyEvent>('/events', payload)
  return data
}

export async function deleteEvent(id: string): Promise<void> {
  await api.delete(`/events/${id}`)
}

export async function getLastFeeds(n: number): Promise<BabyEvent[]> {
  const { data } = await api.get<BabyEvent[]>('/events', {
    params: { type: 'feed', limit: n },
  })
  // API returns DESC order when using limit; reverse so oldest-first
  return [...data].reverse()
}

export async function getLast24HoursEvents(): Promise<BabyEvent[]> {
  const now = new Date()
  const from = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const { data } = await api.get<BabyEvent[]>('/events', {
    params: { from_: from.toISOString(), to: now.toISOString() },
  })
  return data
}

/** Events from the current night session: 21:00 tonight (or yesterday if before 07:00) to now. */
export async function getNightSessionEvents(): Promise<BabyEvent[]> {
  const now = new Date()
  const sessionStart = new Date(now)
  if (now.getHours() < 7) sessionStart.setDate(sessionStart.getDate() - 1)
  sessionStart.setHours(21, 0, 0, 0)
  const { data } = await api.get<BabyEvent[]>('/events', {
    params: { from_: sessionStart.toISOString(), to: now.toISOString() },
  })
  return data
}

/** Format a Date to the value expected by <input type="datetime-local"> */
export function toDateTimeLocal(date: Date): string {
  const offset = date.getTimezoneOffset()
  return new Date(date.getTime() - offset * 60 * 1000).toISOString().slice(0, 16)
}

/** Parse a datetime-local string back to a UTC ISO string */
export function fromDateTimeLocal(value: string): string {
  return new Date(value).toISOString()
}
