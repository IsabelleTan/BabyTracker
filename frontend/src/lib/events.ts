import { api } from './api'

export type EventType = 'feed' | 'sleep_start' | 'sleep_end' | 'output' | 'vitamin_d'

export interface BottleFeedMeta {
  feed_type: 'bottle'
  amount_ml: number | null
  bottle_type?: 'pumped' | 'formula' | null
}

export interface BreastFeedMeta {
  feed_type: 'breast'
  left_duration_min?: number | null
  right_duration_min?: number | null
}

export type FeedMeta = BottleFeedMeta | BreastFeedMeta

export interface OutputMeta {
  diaper_type: 'wet' | 'dirty' | 'both'
  location: 'diaper' | 'potty'
}

export type EventMeta = FeedMeta | OutputMeta | null

export interface BabyEvent {
  id: string
  type: EventType
  timestamp: string
  logged_by: string
  display_name: string
  metadata: EventMeta
}

export interface LogEventPayload {
  id: string
  type: EventType
  timestamp: string
  metadata?: EventMeta
}

export async function logEvent(payload: LogEventPayload): Promise<BabyEvent> {
  const { data } = await api.post<BabyEvent>('/events', payload)
  return data
}

export async function deleteEvent(id: string): Promise<void> {
  await api.delete(`/events/${id}`)
}


export async function getLast24HoursEvents(): Promise<BabyEvent[]> {
  const now = new Date()
  const from = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const { data } = await api.get<BabyEvent[]>('/events', {
    params: { from_: from.toISOString(), to: now.toISOString() },
  })
  return data
}

/** Start of the current parenting day (05:00 local today, or 05:00 yesterday if before 05:00). */
export function currentDayStart(base: Date = new Date()): Date {
  const d = new Date(base)
  if (d.getHours() < 5) d.setDate(d.getDate() - 1)
  d.setHours(5, 0, 0, 0)
  return d
}

/** Events from the past N parenting days (05:00 local N days ago → now). */
export async function getEventsSince(days: number): Promise<BabyEvent[]> {
  const now = new Date()
  const from = currentDayStart()
  from.setDate(from.getDate() - days)
  const { data } = await api.get<BabyEvent[]>('/events', {
    params: { from_: from.toISOString(), to: now.toISOString() },
  })
  return data
}

export function nightSessionStart(now = new Date()): Date {
  const start = new Date(now)
  if (now.getHours() < 7) start.setDate(start.getDate() - 1)
  start.setHours(21, 0, 0, 0)
  return start
}

export function isInNightSession(timestamp: string): boolean {
  const t = new Date(timestamp)
  const now = new Date()
  return t >= nightSessionStart(now) && t <= now
}

/** Events from the current night session: 21:00 tonight (or yesterday if before 07:00) to now. */
export async function getNightSessionEvents(): Promise<BabyEvent[]> {
  const now = new Date()
  const sessionStart = nightSessionStart(now)
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

/** Parse a datetime-local string back to a UTC ISO string.
 *  ECMAScript treats datetime strings without a timezone suffix as local time,
 *  so new Date("2024-01-01T10:00") gives the correct UTC equivalent. */
export function fromDateTimeLocal(value: string): string {
  return new Date(value).toISOString()
}
