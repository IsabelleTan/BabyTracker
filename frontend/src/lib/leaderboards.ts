import { api } from './api'

export interface ParentStat {
  display_name: string
  night_shifts: number
  total_logs: number
  poop_changes: number
}

export interface LeaderboardData {
  has_enough_data: boolean
  longest_sleep_min: number | null
  longest_sleep_date: string | null
  longest_sleep_new: boolean
  best_night_min: number | null
  best_night_date: string | null
  best_night_new: boolean
  worst_night_min: number | null
  worst_night_date: string | null
  most_feeds_count: number | null
  most_feeds_date: string | null
  most_feeds_new: boolean
  most_poop_count: number | null
  most_poop_date: string | null
  most_poop_new: boolean
  night_shift_claimed_today: boolean
  chief_log_claimed_today: boolean
  poop_award_claimed_today: boolean
  parents: ParentStat[]
}

export async function getLeaderboards(): Promise<LeaderboardData> {
  const { data } = await api.get<LeaderboardData>('/leaderboards')
  return data
}
