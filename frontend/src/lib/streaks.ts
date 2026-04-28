import type { BabyEvent, OutputMeta } from './events'
import { currentDayStart } from './events'
import { MS_PER_DAY } from './time'

function todayDate(): string {
  return new Date().toLocaleDateString('en-CA')
}

function parseLocalDate(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).getTime()
}

// ── potty streak ──────────────────────────────────────────────────────────────

/** Returns the current potty streak (consecutive days with ≥1 potty event). */
export function getPottyStreak(): number {
  return parseInt(localStorage.getItem('potty_streak_count') ?? '0', 10)
}

/**
 * Updates the potty streak based on today's events.
 * Call once per sync. Returns the updated streak count.
 */
export function updatePottyStreak(events: BabyEvent[]): number {
  const STREAK_KEY = 'potty_streak_count'
  const LAST_KEY = 'potty_streak_last_day'
  const today = todayDate()

  const dayStart = currentDayStart()
  const dayEnd = new Date(dayStart.getTime() + MS_PER_DAY)
  const hasPottyToday = events.some((e) => {
    if (e.type !== 'output') return false
    if ((e.metadata as OutputMeta | null)?.location !== 'potty') return false
    const t = new Date(e.timestamp)
    return t >= dayStart && t < dayEnd
  })

  const lastDay = localStorage.getItem(LAST_KEY)

  if (!hasPottyToday) {
    if (lastDay) {
      const daysDiff = Math.floor((parseLocalDate(today) - parseLocalDate(lastDay)) / 86_400_000)
      if (daysDiff > 1) {
        localStorage.setItem(STREAK_KEY, '0')
        return 0
      }
    }
    return getPottyStreak()
  }
  if (lastDay === today) return getPottyStreak()

  const current = parseInt(localStorage.getItem(STREAK_KEY) ?? '0', 10)
  let newStreak: number
  if (lastDay) {
    const daysDiff = Math.floor((parseLocalDate(today) - parseLocalDate(lastDay)) / 86_400_000)
    newStreak = daysDiff === 1 ? current + 1 : 1
  } else {
    newStreak = 1
  }

  localStorage.setItem(STREAK_KEY, String(newStreak))
  localStorage.setItem(LAST_KEY, today)
  return newStreak
}

// ── potty count ───────────────────────────────────────────────────────────────

/** Increment the cumulative potty-event counter, once per calendar day. */
export function trackPottyCount(events: BabyEvent[]): void {
  const TOTAL_KEY = 'potty_total_count'
  const LAST_KEY = 'potty_count_last_day'
  const today = todayDate()
  if (localStorage.getItem(LAST_KEY) === today) return
  const count = events.filter(
    (e) => e.type === 'output' &&
      (e.metadata as OutputMeta | null)?.location === 'potty',
  ).length
  const current = parseInt(localStorage.getItem(TOTAL_KEY) ?? '0', 10)
  localStorage.setItem(TOTAL_KEY, String(current + count))
  localStorage.setItem(LAST_KEY, today)
}

export function getPottyTotal(): number {
  return parseInt(localStorage.getItem('potty_total_count') ?? '0', 10)
}

// ── logging streak ────────────────────────────────────────────────────────────

/** Increment the total-days-logged counter, once per calendar day. */
export function trackDailyLogging(): void {
  const key = 'logging_total_days'
  const lastKey = 'logging_last_day'
  const today = todayDate()
  if (localStorage.getItem(lastKey) === today) return
  const current = parseInt(localStorage.getItem(key) ?? '0', 10)
  localStorage.setItem(key, String(current + 1))
  localStorage.setItem(lastKey, today)
}

export function getDaysLogged(): number {
  return parseInt(localStorage.getItem('logging_total_days') ?? '0', 10)
}
