import { api } from './api'

export interface DailyStat {
  date: string // YYYY-MM-DD
  feed_count: number
  avg_feed_interval_min: number | null
  total_sleep_min: number
  sleep_session_count: number
  avg_sleep_session_min: number | null
  avg_wake_min: number | null
  diaper_count: number
  wet_count: number
  dirty_count: number
  breast_min: number
  bottle_ml: number
}

export async function getDailyStats(from: Date, to: Date): Promise<DailyStat[]> {
  const { data } = await api.get<DailyStat[]>('/stats/daily', {
    params: {
      from: from.toISOString(),
      to: to.toISOString(),
      tz_offset: -new Date().getTimezoneOffset(), // minutes east of UTC (positive = UTC+)
    },
  })
  return data
}

export async function getEarliestEventDate(): Promise<Date | null> {
  const { data } = await api.get<{ earliest: string | null }>('/stats/range')
  return data.earliest ? new Date(data.earliest) : null
}
