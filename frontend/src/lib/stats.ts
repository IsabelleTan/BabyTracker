import { api } from './api'

export interface DailyStat {
  date: string // YYYY-MM-DD
  feed_count: number
  avg_feed_interval_min: number | null
  total_sleep_min: number
  sleep_session_count: number
  avg_sleep_session_min: number | null
  avg_wake_min: number | null
  output_count: number
  wet_count: number
  dirty_count: number
  potty_wet_count: number
  potty_dirty_count: number
  breast_min: number
  pumped_ml: number
  formula_ml: number
}

export async function getDailyStats(from: Date, to: Date): Promise<DailyStat[]> {
  const { data } = await api.get<DailyStat[]>('/stats/daily', {
    params: {
      from: from.toISOString(),
      to: to.toISOString(),
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
  })
  return data
}

export async function getEarliestEventDate(): Promise<Date | null> {
  const { data } = await api.get<{ earliest: string | null }>('/stats/range')
  return data.earliest ? new Date(data.earliest) : null
}
