/** Format a Date as HH:MM (24-hour, no AM/PM). */
export function formatTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

/** "Xm ago" / "Xh Ym ago" — how long since a past date. */
export function formatAgo(date: Date): string {
  const mins = Math.floor((Date.now() - date.getTime()) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const h = Math.floor(mins / 60), m = mins % 60
  return m === 0 ? `${h}h ago` : `${h}h ${m}m ago`
}

/** "in Xm" / "in Xh Ym" — how long until a future date. */
export function formatUntil(date: Date): string {
  const mins = Math.floor((date.getTime() - Date.now()) / 60_000)
  if (mins <= 0) return 'now'
  if (mins < 60) return `in ${mins}m`
  const h = Math.floor(mins / 60), m = mins % 60
  return m === 0 ? `in ${h}h` : `in ${h}h ${m}m`
}

/** "Xm" / "Xh Ym" — elapsed time between two dates (defaults to now). */
export function formatDuration(from: Date, to: Date = new Date()): string {
  const totalMins = Math.floor((to.getTime() - from.getTime()) / 60_000)
  const h = Math.floor(totalMins / 60), m = totalMins % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

/** "Xm" / "Xh Ym" — format a duration given as milliseconds. */
export function formatDurationMs(ms: number): string {
  return formatDuration(new Date(0), new Date(ms))
}
