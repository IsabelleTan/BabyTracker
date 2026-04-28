import { api } from './api'
import { formatMins } from './time'

export interface ParentStat {
  display_name: string
  night_shifts: number
  total_logs: number
  poop_changes: number
  potty_assists: number
}

export interface OldBabyRecord {
  kind: 'old'
  value: number | null
  date: string | null
}

export interface NewBabyRecord {
  kind: 'new'
  value: number
  date: string
}

export type BabyRecord = OldBabyRecord | NewBabyRecord

export interface LeaderboardData {
  longest_sleep: BabyRecord
  best_night: BabyRecord
  worst_night: BabyRecord
  most_feeds: BabyRecord
  most_poop: BabyRecord
  longest_potty_streak: BabyRecord
  night_shift_claimed_today: boolean
  chief_log_claimed_today: boolean
  poop_award_claimed_today: boolean
  potty_award_claimed_today: boolean
  parents: ParentStat[]
}

export async function getLeaderboards(): Promise<LeaderboardData | null> {
  const response = await api.get<LeaderboardData>('/leaderboards', {
    params: { tz: Intl.DateTimeFormat().resolvedOptions().timeZone },
  })
  if (response.status === 204) return null
  return response.data
}

function dateHash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

// Deterministic per-day pick: same message all day, rotates daily.
// offset differentiates categories so they don't all land on the same index.
function seededPick<T>(arr: T[], seed: number, offset: number): T {
  return arr[(seed + offset) % arr.length]
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
  const msgs: string[] = []
  // Each category gets a seed derived from its event date + a per-category offset,
  // so the chosen message is stable for that specific event but varies across categories.
  const today = new Date().toLocaleDateString('en-CA')
  const s = (date: string | null, offset: number) => dateHash((date ?? today) + offset)

  if (data.longest_sleep.kind === 'new') {
    const v = formatMins(data.longest_sleep.value)
    msgs.push(seededPick([
      `New longest sleep record: ${v}. Who slipped melatonin in the bottle?`,
      `${v} in one stretch — new record! Treasure this. Tell no one. Make no changes.`,
      `New record: ${v} of uninterrupted sleep. Scientists are baffled.`,
      `Longest sleep ever: ${v}. Do not jinx it by telling anyone.`,
      `${v}! New longest sleep record. Go buy a lottery ticket, your luck is in.`,
      `New record: ${v} of sleep. The baby has finally read the manual.`,
      `${v} straight — new record! Frame this. Put it on the fridge. Sob a little.`,
      `Longest sleep on record: ${v}. We're not saying it's a miracle, but…`,
      `${v} without waking — new record! The baby is finally showing mercy.`,
      `New longest sleep record: ${v}. Whatever you did last night, do it again.`,
    ], s(data.longest_sleep.date, 0), 0))
  }

  if (data.best_night.kind === 'new') {
    const v = formatMins(data.best_night.value)
    msgs.push(seededPick([
      `New best night on record: ${v}. Frame this night and never speak of it again.`,
      `${v} of night sleep — new record! You may cautiously feel like a human again.`,
      `Best night ever: ${v}. Evidence that things do, eventually, get better.`,
      `New best night: ${v}. Mark this date in history.`,
      `${v} of night sleep — new record. The prophecy is coming true.`,
      `New best night: ${v}. Recommended: do not Google "sleep regression" today.`,
      `Best night on record: ${v}. Celebrate quietly. Very quietly.`,
      `New record night: ${v} of sleep. The tide is turning.`,
      `${v} — new best night! This calls for a hot coffee, drunk while still hot.`,
      `New best night: ${v}. Don't get used to it, but also: allow yourself to hope.`,
    ], s(data.best_night.date, 1), 0))
  }

  if (data.most_feeds.kind === 'new') {
    const v = data.most_feeds.value
    msgs.push(seededPick([
      `New most feeds in a day: ${v}. This baby is basically a subscription service.`,
      `${v} feeds today — new record. The kitchen is open around the clock.`,
      `New record: ${v} feeds in one day. Baby is in a growth phase. Or just hungry. Or both.`,
      `${v} feeds — new record! Baby's metabolism does not mess around.`,
      `New record: ${v} feeds in a day. Someone discovered eating and really leaned in.`,
      `${v} feeds today — new record. The burp cloth industry is thriving.`,
      `Most feeds ever: ${v} in one day. Baby has entered their buffet era.`,
      `New record: ${v} feeds! Did the baby read a "how to keep parents busy" guide?`,
      `${v} feeds — new most-feeds record. Baby running on full-tank all day.`,
      `New daily feeds record: ${v}. We're not saying the baby is a bottomless pit, but…`,
    ], s(data.most_feeds.date, 2), 0))
  }

  if (data.most_poop.kind === 'new') {
    const v = data.most_poop.value
    msgs.push(seededPick([
      `New poop record: ${v} diapers in a day. An impressive throughput.`,
      `${v} dirty diapers today — new record. The factory is running at full capacity.`,
      `New record: ${v} dirty diapers in one day. Buy more wipes.`,
      `${v} poops — new record. Something you never expected to be proud of.`,
      `New poop record: ${v} diapers. Baby is clearly very efficient.`,
      `${v} dirty diapers — new record! What is happening in there?`,
      `Most poop in a day: ${v}. A new personal best, and a new diaper deficit.`,
      `New poop record: ${v}. Baby is communicating something. Loudly.`,
      `${v} poop diapers — new record. Laundry is having a very bad day.`,
      `New record: ${v} dirty diapers. Baby: 1, diaper supply: struggling.`,
    ], s(data.most_poop.date, 3), 0))
  }

  if (data.night_shift_claimed_today) {
    const w = awardWinner(data.parents, (p) => p.night_shifts)
    if (w)
      msgs.push(seededPick([
        `${w.winner.display_name} snatched the Night Shift Ninja title! ${w.winnerScore} logs vs ${w.loserScore} from ${w.loser.display_name}. Sleep is for the weak.`,
        `New Night Shift Ninja: ${w.winner.display_name}! ${w.winnerScore} night logs vs ${w.loserScore} from ${w.loser.display_name}. Thriving on fumes.`,
        `${w.winner.display_name} owns the night now. ${w.winnerScore} logs vs ${w.loserScore} from ${w.loser.display_name}. Respect.`,
        `Night Shift Ninja crown goes to ${w.winner.display_name}! ${w.winnerScore} vs ${w.loserScore}. ${w.loser.display_name} was not consulted.`,
        `${w.winner.display_name} claimed Night Shift Ninja: ${w.winnerScore} logs vs ${w.loserScore} from ${w.loser.display_name}. Dark circles are a badge of honour.`,
        `Night Shift Ninja: ${w.winner.display_name}! ${w.winnerScore} vs ${w.loserScore} for ${w.loser.display_name}. Who needs sleep anyway?`,
        `${w.winner.display_name} is the new Night Shift Ninja. ${w.winnerScore} logs vs ${w.loserScore} from ${w.loser.display_name}. The night shift thanks you.`,
        `Night Shift Ninja title stolen by ${w.winner.display_name}! ${w.winnerScore} logs vs ${w.loserScore} from ${w.loser.display_name}. ${w.loser.display_name} can sleep now.`,
        `${w.winner.display_name} is running the night shift. ${w.winnerScore} logs vs ${w.loserScore} from ${w.loser.display_name}. Send coffee.`,
        `New Night Shift Ninja: ${w.winner.display_name}! ${w.winnerScore} night logs. ${w.loser.display_name} managed ${w.loserScore}. A valiant effort.`,
      ], s(null, 4), 0))
  }

  if (data.chief_log_claimed_today) {
    const w = awardWinner(data.parents, (p) => p.total_logs)
    if (w)
      msgs.push(seededPick([
        `${w.winner.display_name} is the new Chief Log Officer! ${w.winnerScore} logs vs ${w.loserScore} from ${w.loser.display_name}. Power move.`,
        `Chief Log Officer: ${w.winner.display_name}! ${w.winnerScore} total logs vs ${w.loserScore} from ${w.loser.display_name}. Utterly dedicated.`,
        `${w.winner.display_name} took the CLO title. ${w.winnerScore} logs vs ${w.loserScore} from ${w.loser.display_name}. ${w.loser.display_name} may want to step it up.`,
        `New Chief Log Officer: ${w.winner.display_name}! ${w.winnerScore} vs ${w.loserScore} from ${w.loser.display_name}. The spreadsheet does not lie.`,
        `${w.winner.display_name} is logging for two. ${w.winnerScore} entries vs ${w.loserScore} from ${w.loser.display_name}. A true record-keeper.`,
        `CLO title goes to ${w.winner.display_name}: ${w.winnerScore} logs vs ${w.loserScore} from ${w.loser.display_name}. Efficiency personified.`,
        `${w.winner.display_name} claimed Chief Log Officer with ${w.winnerScore} logs. ${w.loser.display_name} is at ${w.loserScore}. Stay vigilant.`,
        `New CLO: ${w.winner.display_name}! ${w.winnerScore} logs vs ${w.loserScore} from ${w.loser.display_name}. Basically a professional at this point.`,
        `${w.winner.display_name} is keeping the receipts. ${w.winnerScore} logs vs ${w.loserScore} from ${w.loser.display_name}. The data doesn't lie.`,
        `Chief Log Officer: ${w.winner.display_name}, with ${w.winnerScore} logs. ${w.loser.display_name} has ${w.loserScore}. The pen is mightier.`,
      ], s(null, 5), 0))
  }

  if (data.poop_award_claimed_today) {
    const w = awardWinner(data.parents, (p) => p.poop_changes)
    if (w)
      msgs.push(seededPick([
        `${w.winner.display_name} is now Number One at Number Two! ${w.winnerScore} changes vs ${w.loserScore} from ${w.loser.display_name}. A stinky achievement.`,
        `Number One at Number Two: ${w.winner.display_name}! ${w.winnerScore} poop changes vs ${w.loserScore} from ${w.loser.display_name}. Truly selfless.`,
        `${w.winner.display_name} claimed the poop crown. ${w.winnerScore} changes vs ${w.loserScore} from ${w.loser.display_name}. An unsung hero.`,
        `New Number One at Number Two: ${w.winner.display_name}! ${w.winnerScore} vs ${w.loserScore}. ${w.loser.display_name} is off the hook today.`,
        `${w.winner.display_name} leads in poop changes: ${w.winnerScore} vs ${w.loserScore} from ${w.loser.display_name}. A title earned through grit.`,
        `Poop crown claimed by ${w.winner.display_name}! ${w.winnerScore} changes vs ${w.loserScore} from ${w.loser.display_name}. Some people juggle geese.`,
        `${w.winner.display_name} is Number One at Number Two: ${w.winnerScore} changes vs ${w.loserScore} from ${w.loser.display_name}. Brave work.`,
        `New poop champ: ${w.winner.display_name}! ${w.winnerScore} changes vs ${w.loserScore} from ${w.loser.display_name}. The smell of dedication.`,
        `${w.winner.display_name} has ${w.winnerScore} poop changes to ${w.loser.display_name}'s ${w.loserScore}. Number One at Number Two title claimed.`,
        `${w.winner.display_name} is the reigning poop champion! ${w.winnerScore} vs ${w.loserScore}. ${w.loser.display_name} remains spiritually present.`,
      ], s(null, 6), 0))
  }

  if (data.potty_award_claimed_today) {
    const w = awardWinner(data.parents, (p) => p.potty_assists)
    if (w)
      msgs.push(seededPick([
        `${w.winner.display_name} is the new Potty Whisperer! ${w.winnerScore} potty assists vs ${w.loserScore} from ${w.loser.display_name}. Patience of a saint.`,
        `Potty Whisperer title goes to ${w.winner.display_name}! ${w.winnerScore} potty trips vs ${w.loserScore} from ${w.loser.display_name}. The training is working.`,
        `${w.winner.display_name} claimed Potty Whisperer with ${w.winnerScore} assists. ${w.loser.display_name} has ${w.loserScore}. True dedication.`,
        `New Potty Whisperer: ${w.winner.display_name}! ${w.winnerScore} potty events vs ${w.loserScore} from ${w.loser.display_name}. Worth celebrating.`,
        `${w.winner.display_name} leads potty assists: ${w.winnerScore} vs ${w.loserScore} from ${w.loser.display_name}. Potty Whisperer earned.`,
      ], s(null, 7), 0))
  }

  return msgs
}
