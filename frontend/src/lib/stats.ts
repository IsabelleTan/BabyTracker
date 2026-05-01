import { api } from './api'

export interface DailyStat {
  date: string // YYYY-MM-DD
  feed_count: number
  median_feed_interval_min: number | null
  feed_intervals_min: number[]
  total_sleep_min: number
  sleep_session_count: number
  median_sleep_session_min: number | null
  sleep_session_durations_min: number[]
  median_wake_min: number | null
  wake_durations_min: number[]
  output_count: number
  wet_count: number
  dirty_count: number
  potty_wet_count: number
  potty_dirty_count: number
  accident_wet_count: number
  accident_dirty_count: number
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

export interface SummaryValue {
  current: number
  average: number
}

export interface SummaryStats {
  breast_min: SummaryValue
  pumped_ml: SummaryValue
  formula_ml: SummaryValue
  wet: SummaryValue
  dirty: SummaryValue
  sleep_min: SummaryValue
}

export async function getSummaryStats(): Promise<SummaryStats> {
  const { data } = await api.get<SummaryStats>('/stats/summary', {
    params: { tz: Intl.DateTimeFormat().resolvedOptions().timeZone },
  })
  return data
}

export async function getEarliestEventDate(): Promise<Date | null> {
  const { data } = await api.get<{ earliest: string | null }>('/stats/range')
  return data.earliest ? new Date(data.earliest) : null
}
