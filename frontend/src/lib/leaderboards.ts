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

function fmtMins(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = Math.round(mins % 60)
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function awardWinner(
  parents: ParentStat[],
  getValue: (p: ParentStat) => number,
): { winner: ParentStat; loser: ParentStat; winnerScore: number; loserScore: number } | null {
  if (parents.length < 2) return null
  const [a, b] = parents
  const [sa, sb] = [getValue(a), getValue(b)]
  return sa >= sb
    ? { winner: a, loser: b, winnerScore: sa, loserScore: sb }
    : { winner: b, loser: a, winnerScore: sb, loserScore: sa }
}

export function buildNotifications(data: LeaderboardData): string[] {
  if (!data.has_enough_data) return []
  const msgs: string[] = []

  if (data.longest_sleep_new && data.longest_sleep_min != null) {
    const v = fmtMins(data.longest_sleep_min)
    msgs.push(pick([
      `New longest sleep record: ${v}. Who slipped melatonin in the bottle?`,
      `${v} in one stretch! New longest sleep record. Treasure this.`,
      `New record: ${v} of uninterrupted sleep. Scientists are baffled.`,
      `Longest sleep ever: ${v}. Do not jinx it by telling anyone.`,
    ]))
  }

  if (data.best_night_new && data.best_night_min != null) {
    const v = fmtMins(data.best_night_min)
    msgs.push(pick([
      `New best night on record: ${v}. Frame this night and never speak of it again.`,
      `${v} of night sleep! New record. Mark this date in history.`,
      `Best night ever: ${v}. You may cautiously feel like a human again.`,
      `New best night: ${v}. Evidence that things do, eventually, get better.`,
    ]))
  }

  if (data.most_feeds_new && data.most_feeds_count != null) {
    const v = data.most_feeds_count
    msgs.push(pick([
      `New most feeds in a day: ${v}. This baby is basically a subscription service.`,
      `${v} feeds today — new record. The kitchen is open around the clock.`,
      `New record: ${v} feeds in one day. Someone is going through a growth spurt.`,
      `${v} feeds! New most-feeds record. Baby's metabolism does not mess around.`,
    ]))
  }

  if (data.most_poop_new && data.most_poop_count != null) {
    const v = data.most_poop_count
    msgs.push(pick([
      `New poop record: ${v} diapers in a day. An impressive throughput.`,
      `${v} poop diapers today — new record. The factory is running at full capacity.`,
      `New record: ${v} dirty diapers in one day. Buy more wipes.`,
      `${v} poops! New record. Something you never expected to be proud of.`,
    ]))
  }

  if (data.night_shift_claimed_today) {
    const w = awardWinner(data.parents, (p) => p.night_shifts)
    if (w)
      msgs.push(pick([
        `${w.winner.display_name} snatched the Night Shift Ninja title! ${w.winnerScore} logs vs ${w.loserScore} from ${w.loser.display_name}. Sleep is for the weak.`,
        `New Night Shift Ninja: ${w.winner.display_name}! ${w.winnerScore} night logs vs ${w.loserScore} from ${w.loser.display_name}. Thriving on fumes.`,
        `${w.winner.display_name} owns the night shift now. ${w.winnerScore} logs vs ${w.loserScore} from ${w.loser.display_name}. Respect.`,
        `Night Shift Ninja crown goes to ${w.winner.display_name}! ${w.winnerScore} vs ${w.loserScore}. ${w.loser.display_name} was not consulted.`,
      ]))
  }

  if (data.chief_log_claimed_today) {
    const w = awardWinner(data.parents, (p) => p.total_logs)
    if (w)
      msgs.push(pick([
        `${w.winner.display_name} is the new Chief Log Officer! ${w.winnerScore} logs vs ${w.loserScore} from ${w.loser.display_name}. Power move.`,
        `Chief Log Officer: ${w.winner.display_name}! ${w.winnerScore} total logs vs ${w.loserScore} from ${w.loser.display_name}. Utterly dedicated.`,
        `${w.winner.display_name} took the CLO title. ${w.winnerScore} logs vs ${w.loserScore} from ${w.loser.display_name}. ${w.loser.display_name} may want to step it up.`,
        `New Chief Log Officer: ${w.winner.display_name}! ${w.winnerScore} vs ${w.loserScore}. The spreadsheet does not lie.`,
      ]))
  }

  if (data.poop_award_claimed_today) {
    const w = awardWinner(data.parents, (p) => p.poop_changes)
    if (w)
      msgs.push(pick([
        `${w.winner.display_name} is now Number One at Number Two! ${w.winnerScore} changes vs ${w.loserScore} from ${w.loser.display_name}. A stinky achievement.`,
        `Number One at Number Two: ${w.winner.display_name}! ${w.winnerScore} poop changes vs ${w.loserScore} from ${w.loser.display_name}. Truly selfless.`,
        `${w.winner.display_name} claimed the poop crown. ${w.winnerScore} changes vs ${w.loserScore} from ${w.loser.display_name}. An unsung hero.`,
        `New Number One at Number Two: ${w.winner.display_name}! ${w.winnerScore} vs ${w.loserScore}. ${w.loser.display_name} is off the hook today.`,
      ]))
  }

  return msgs
}
