export const MS_PER_MIN = 60_000
export const MS_PER_DAY = 24 * 60 * MS_PER_MIN

/** True between 21:00 and 07:00 — matches NIGHT_SHIFT_START/END and useNightMode auto-switch. */
export function isNightHours(date: Date = new Date()): boolean {
  const h = date.getHours()
  return h >= 21 || h < 7
}

/** "Xm" / "Xh Ym" — format a duration as minutes, or as elapsed time between two dates. */
export function formatDuration(mins: number | null | undefined): string
export function formatDuration(from: Date, to?: Date): string
export function formatDuration(minsOrFrom: number | null | undefined | Date, to?: Date): string {
  if (minsOrFrom instanceof Date) {
    const totalMins = Math.floor(((to ?? new Date()).getTime() - minsOrFrom.getTime()) / 60_000)
    const h = Math.floor(totalMins / 60), m = totalMins % 60
    if (h === 0) return `${m}m`
    return m === 0 ? `${h}h` : `${h}h ${m}m`
  }
  if (minsOrFrom == null) return '—'
  const h = Math.floor(minsOrFrom / 60)
  const m = Math.round(minsOrFrom % 60)
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

/**
 * Returns a y-axis tick formatter whose unit (h vs m) is fixed to the scale of the axis.
 * Pass the domain max so that all ticks — including 0 — use the same unit.
 */
export function timeAxisFormatter(maxMins: number): (v: number | null) => string {
  const useHours = maxMins >= 60
  return (mins) => {
    if (mins == null) return ''
    if (mins === 0) return useHours ? '0h' : '0m'
    const h = Math.floor(mins / 60)
    const m = Math.round(mins % 60)
    if (h === 0) return `${m}m`
    return m === 0 ? `${h}h` : `${h}h ${m}m`
  }
}

/** "M/D" — compact numeric date for chart axes (e.g. "4/25"). */
export function formatDateAxis(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return `${d.getMonth() + 1}/${d.getDate()}`
}

/** "Mon D" — short month-name date for display cards (e.g. "Apr 25"). */
export function formatDateShort(dateStr: string | null): string {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  return `${d.toLocaleString('default', { month: 'short' })} ${d.getDate()}`
}

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
