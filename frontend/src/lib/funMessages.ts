import type { BabyEvent, OutputMeta } from './events'
import { isNightHours } from './time'
import { getPottyStreak, getPottyTotal, getDaysLogged } from './streaks'

// ── message banks ─────────────────────────────────────────────────────────────

const NIGHT_MESSAGES = [
  "Night shift. You showed up — that's everything.",
  "Somewhere another parent is awake right now. You're not alone.",
  "The nights are hard. You are harder.",
  "Every night feed is a moment of connection. You're doing great.",
  "This phase is temporary. Your love isn't.",
  "3am is tough. So are you.",
  "Even in the dark, you know exactly what to do.",
  "Rest will come. For now, you've got this.",
]

const PARTNER_MESSAGES_BOTH = [
  "You're both logging today, keeping pace with each other. Teamwork.",
  "Both of you tracking today. Baby's story told by two.",
  "Equal parts in the log today. That's what shared parenting looks like.",
  "Both of you showing up in the data. That counts for a lot.",
  "You're each pulling your weight in the tracking. The full picture comes through.",
]

// Shown when the OTHER parent logged ≥ 70% of events
const PARTNER_MESSAGES_SOLO = [
  "Your partner carried most of the logging today. That's a lot of work.",
  "Your partner put in the majority of the tracking today. They showed up.",
  "Most of today's logs are your partner's. That doesn't go unnoticed.",
]

// Shown when the OTHER parent logged ≥ 3 events during 22:00–06:00
const PARTNER_MESSAGES_NIGHT_SHIFT = [
  "Your partner took the night shift — up logging in the early hours.",
  "Those night logs? Your partner. That kind of dedication deserves recognition.",
  "Your partner was up in the night handling things. Worth appreciating.",
]

// Shown when the OTHER parent logged ≥ 3 dirty/both diapers
const PARTNER_MESSAGES_POOP_DUTY = [
  "Your partner handled 3+ poop diapers today. Quietly heroic.",
  "Three or more messy diapers dealt with by your partner today. Respect.",
  "Your partner took on 3+ dirty diapers today. The unglamorous work, done without fuss.",
]

const BABY_VOICE_MESSAGES: Record<BabyVoiceContext, string[]> = {
  many_feeds: [
    "Hungry day — growth is real work.",
    "So many feeds today. Every single one answered.",
    "Fed on demand all day long. Hungry work, being a baby.",
  ],
  long_nap: [
    "Finally, a proper sleep.",
    "That nap was everything.",
    "Long nap! Recharging complete.",
  ],
  cluster: [
    "Just needed a little extra comfort food tonight.",
    "Evening comfort feeds: mandatory.",
    "Lots of feeds, zero regrets.",
  ],
  chaotic: [
    "Big day for a small human.",
    "Today had character.",
    "I gave it my all.",
  ],
  quiet: [
    "A slow day. Those are good too.",
    "Low-drama day. 10/10.",
    "Quiet today. Well-paced.",
  ],
  normal: [
    "Solid day. Minimal complaints.",
    "Everything according to plan.",
    "Good day overall.",
  ],
  potty_first: [
    "I used the big toilet today. I'm basically an adult.",
  ],
  potty_streak: [
    "Diapers are so last month.",
  ],
}

const MILESTONE_MESSAGES: Record<MilestoneKey, string> = {
  // Sleep
  sleep_5h:          "First 5-hour sleep stretch logged. That's a real milestone.",
  sleep_8h:          "First 8-hour sleep stretch. Sleep is consolidating — keep going.",
  nap_2h:            "First 2-hour nap logged. They really went for it.",
  sleep_total_14h:   "14 hours of sleep today. A restful one.",
  // Feeds
  feeds_8:           "8 feeds in a day — you're keeping up a great rhythm.",
  feeds_12:          "12 feeds today. That's an intense day. You handled it.",
  // Diapers
  diaper_8:          "8 diapers in a day. Thorough logging, thorough parenting.",
  // Events / variety
  all_event_types:   "Feeds, diapers, and sleep all logged today — the full picture.",
  // Time of day
  night_survived:    "You were up at 3am and logged it. That level of dedication is something.",
  cluster_first:     "First cluster feeding logged. It's a lot — and it's completely normal.",
  // Teamwork
  both_partners_first: "First day with both of you in the log. Teamwork from day one.",
  // Consistency
  logging_days_7:    "7 days of logging. You're building something genuinely useful.",
  logging_days_30:   "30 days of logging. A month in. You're really doing this.",
  // Potty training
  potty_first:       "First potty trip ever logged. 1 potty event today. Big steps for small feet.",
  potty_first_poo:   "First poo on the potty — that takes some convincing. 1 potty poo event. Well done.",
  potty_10:          "10 total potty trips logged. The data says potty training is actually working.",
  potty_big_kid_day: "First day where potty trips matched diaper changes. Progress is real.",
  potty_fully_trained: "First fully potty day — zero diaper outputs, all pee/poo on the potty. That's huge.",
}

// ── types ─────────────────────────────────────────────────────────────────────

export type BabyVoiceContext = 'many_feeds' | 'long_nap' | 'cluster' | 'chaotic' | 'quiet' | 'normal' | 'potty_first' | 'potty_streak'

export type PartnerContext = 'both' | 'solo' | 'night_shift' | 'poop_duty'

export type MilestoneKey =
  | 'sleep_5h' | 'sleep_8h' | 'nap_2h' | 'sleep_total_14h'
  | 'feeds_8' | 'feeds_12'
  | 'diaper_8'
  | 'all_event_types'
  | 'night_survived' | 'cluster_first'
  | 'both_partners_first'
  | 'logging_days_7' | 'logging_days_30'
  | 'potty_first' | 'potty_first_poo' | 'potty_10' | 'potty_big_kid_day' | 'potty_fully_trained'

export interface PartnerMessageResult {
  context: PartnerContext
  message: string
}

// ── baby voice context detection ──────────────────────────────────────────────

export function getBabyVoiceContext(events: BabyEvent[]): BabyVoiceContext {
  // Potty streak message: shown when ≥2 consecutive days with potty events
  if (getPottyStreak() >= 2) return 'potty_streak'

  // First potty ever: shown on the day it happens, before the milestone is dismissed
  const hasPottyToday = events.some(
    (e) => e.type === 'output' && (e.metadata as OutputMeta | null)?.location === 'potty',
  )
  if (hasPottyToday && localStorage.getItem('milestone_potty_first') !== 'true') return 'potty_first'

  const feeds = events.filter((e) => e.type === 'feed')

  // Evening cluster: ≥2 consecutive feed gaps < 45 min between 17:00–23:00
  const eveningFeeds = feeds
    .filter((e) => { const h = new Date(e.timestamp).getHours(); return h >= 17 && h < 23 })
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  let shortGaps = 0
  for (let i = 1; i < eveningFeeds.length; i++) {
    const gapMin =
      (new Date(eveningFeeds[i].timestamp).getTime() -
        new Date(eveningFeeds[i - 1].timestamp).getTime()) / 60_000
    if (gapMin < 45) shortGaps++
  }
  if (shortGaps >= 2) return 'cluster'

  // Long nap: any completed sleep block ≥ 3 hours
  const sleepSorted = events
    .filter((e) => e.type === 'sleep_start' || e.type === 'sleep_end')
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  let openStart: Date | null = null
  for (const e of sleepSorted) {
    if (e.type === 'sleep_start') {
      openStart = new Date(e.timestamp)
    } else if (e.type === 'sleep_end' && openStart) {
      const durMin = (new Date(e.timestamp).getTime() - openStart.getTime()) / 60_000
      if (durMin >= 180) return 'long_nap'
      openStart = null
    }
  }

  if (feeds.length >= 9)   return 'many_feeds'
  if (events.length >= 20) return 'chaotic'
  if (events.length <= 8)  return 'quiet'
  return 'normal'
}

// ── partner context detection ─────────────────────────────────────────────────

export function getPartnerContext(events: BabyEvent[], currentUserId: string): PartnerContext {
  // Poop duty: OTHER user logged ≥ 3 dirty/both diapers
  const otherPoopCount = events.filter((e) => {
    if (e.type !== 'output' || e.logged_by === currentUserId) return false
    const t = (e.metadata as OutputMeta | null)?.diaper_type
    return t === 'dirty' || t === 'both'
  }).length
  if (otherPoopCount >= 3) return 'poop_duty'

  // Night shift: OTHER user logged ≥ 3 events between 21:00–07:00
  const otherNightCount = events.filter((e) => {
    if (e.logged_by === currentUserId) return false
    return isNightHours(new Date(e.timestamp))
  }).length
  if (otherNightCount >= 3) return 'night_shift'

  // Solo: OTHER user logged ≥ 70% of events (they carried the load)
  const otherTotal = events.filter((e) => e.logged_by !== currentUserId).length
  if (events.length > 0 && otherTotal / events.length >= 0.7) return 'solo'

  return 'both'
}

export function getPartnerMessage(
  events: BabyEvent[],
  currentUserId: string,
): PartnerMessageResult | null {
  if (events.length === 0) return null
  const context = getPartnerContext(events, currentUserId)
  const bank = {
    both:        PARTNER_MESSAGES_BOTH,
    solo:        PARTNER_MESSAGES_SOLO,
    night_shift: PARTNER_MESSAGES_NIGHT_SHIFT,
    poop_duty:   PARTNER_MESSAGES_POOP_DUTY,
  }[context]
  return { context, message: pickByDay(bank) }
}

const PARTNER_MSG_KEY = 'partner_msg_last_shown'

/** Whether 3+ days have passed since the partner message was last shown. */
export function partnerMessageAllowed(): boolean {
  const last = localStorage.getItem(PARTNER_MSG_KEY)
  if (!last) return true
  return Math.floor((parseLocalDate(todayDate()) - parseLocalDate(last)) / 86_400_000) >= 3
}

export function recordPartnerMessageShown(): void {
  localStorage.setItem(PARTNER_MSG_KEY, todayDate())
}

// ── milestone detection ───────────────────────────────────────────────────────

/** Returns the first milestone unlocked today that hasn't been shown before, or null. */
export function getNewMilestone(events: BabyEvent[]): MilestoneKey | null {
  const unseen = (key: MilestoneKey) =>
    localStorage.getItem(`milestone_${key}`) !== 'true'

  const candidates: MilestoneKey[] = []

  // ── sleep ──────────────────────────────────────────────────────────────────
  const sleepSorted = events
    .filter((e) => e.type === 'sleep_start' || e.type === 'sleep_end')
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))

  let openStart: Date | null = null
  let longestStretchMin = 0
  let longestDaytimeMin = 0
  let totalSleepMin = 0

  for (const e of sleepSorted) {
    if (e.type === 'sleep_start') {
      openStart = new Date(e.timestamp)
    } else if (e.type === 'sleep_end' && openStart) {
      const durMin = (new Date(e.timestamp).getTime() - openStart.getTime()) / 60_000
      totalSleepMin += durMin
      if (durMin > longestStretchMin) longestStretchMin = durMin
      const startHour = openStart.getHours()
      if (startHour >= 6 && startHour < 20 && durMin > longestDaytimeMin) {
        longestDaytimeMin = durMin
      }
      openStart = null
    }
  }

  if (longestStretchMin >= 480 && unseen('sleep_8h'))        candidates.push('sleep_8h')
  else if (longestStretchMin >= 300 && unseen('sleep_5h'))   candidates.push('sleep_5h')
  if (longestDaytimeMin >= 120 && unseen('nap_2h'))          candidates.push('nap_2h')
  if (totalSleepMin >= 840 && unseen('sleep_total_14h'))     candidates.push('sleep_total_14h')

  // ── feeds ──────────────────────────────────────────────────────────────────
  const feedCount = events.filter((e) => e.type === 'feed').length
  if (feedCount >= 12 && unseen('feeds_12'))  candidates.push('feeds_12')
  else if (feedCount >= 8 && unseen('feeds_8')) candidates.push('feeds_8')

  // ── diapers ────────────────────────────────────────────────────────────────
  if (events.filter((e) => e.type === 'output').length >= 8 && unseen('diaper_8'))
    candidates.push('diaper_8')

  // ── variety ────────────────────────────────────────────────────────────────
  const types = new Set(events.map((e) => e.type))
  if (
    types.has('feed') && types.has('sleep_start') && types.has('output') &&
    unseen('all_event_types')
  ) candidates.push('all_event_types')

  // ── time of day ────────────────────────────────────────────────────────────
  const hasDeepNight = events.some((e) => {
    const h = new Date(e.timestamp).getHours()
    return h >= 2 && h < 4
  })
  if (hasDeepNight && unseen('night_survived')) candidates.push('night_survived')

  // Cluster: ≥2 short evening feed gaps (same logic as getBabyVoiceContext)
  const eveningFeeds = events
    .filter((e) => e.type === 'feed')
    .filter((e) => { const h = new Date(e.timestamp).getHours(); return h >= 17 && h < 23 })
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  let shortGaps = 0
  for (let i = 1; i < eveningFeeds.length; i++) {
    const gap = (new Date(eveningFeeds[i].timestamp).getTime() -
      new Date(eveningFeeds[i - 1].timestamp).getTime()) / 60_000
    if (gap < 45) shortGaps++
  }
  if (shortGaps >= 2 && unseen('cluster_first')) candidates.push('cluster_first')

  // ── teamwork ───────────────────────────────────────────────────────────────
  if (new Set(events.map((e) => e.logged_by)).size >= 2 && unseen('both_partners_first'))
    candidates.push('both_partners_first')

  // ── consistency (localStorage-tracked) ────────────────────────────────────
  const days = getDaysLogged()
  if (days >= 30 && unseen('logging_days_30'))     candidates.push('logging_days_30')
  else if (days >= 7 && unseen('logging_days_7'))  candidates.push('logging_days_7')

  // ── potty training ─────────────────────────────────────────────────────────
  const pottyEvents = events.filter(
    (e) => e.type === 'output' &&
      (e.metadata as OutputMeta | null)?.location === 'potty',
  )
  const diaperEvents = events.filter(
    (e) => e.type === 'output' &&
      ((e.metadata as OutputMeta | null)?.location ?? 'diaper') === 'diaper',
  )

  if (pottyEvents.length >= 1 && unseen('potty_first')) candidates.push('potty_first')

  const hasPottyPoo = pottyEvents.some((e) => {
    const t = (e.metadata as OutputMeta | null)?.diaper_type
    return t === 'dirty' || t === 'both'
  })
  if (hasPottyPoo && unseen('potty_first_poo')) candidates.push('potty_first_poo')

  if (getPottyTotal() >= 10 && unseen('potty_10')) candidates.push('potty_10')

  if (
    pottyEvents.length > 0 && diaperEvents.length > 0 &&
    pottyEvents.length >= diaperEvents.length && unseen('potty_big_kid_day')
  ) candidates.push('potty_big_kid_day')

  if (pottyEvents.length > 0 && diaperEvents.length === 0 && unseen('potty_fully_trained'))
    candidates.push('potty_fully_trained')

  return candidates[0] ?? null
}

export function getMilestoneMessage(key: MilestoneKey): string {
  return MILESTONE_MESSAGES[key]
}

/** Returns true if no milestone has been shown in the last 3 days. */
export function milestoneAllowedToday(): boolean {
  const last = localStorage.getItem('milestone_shown_date')
  if (!last) return true
  return Math.floor((parseLocalDate(todayDate()) - parseLocalDate(last)) / 86_400_000) >= 3
}

/** Call when a milestone card is first shown (not on dismiss). */
export function recordMilestoneShownToday(): void {
  localStorage.setItem('milestone_shown_date', todayDate())
}

export function markMilestoneSeen(key: MilestoneKey): void {
  localStorage.setItem(`milestone_${key}`, 'true')
}

// ── day-seeded rotation ───────────────────────────────────────────────────────

function dayOfYear(): number {
  const now = new Date()
  return Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86_400_000)
}

function pickByDay<T>(bank: T[]): T {
  return bank[dayOfYear() % bank.length]
}

export function getBabyVoiceMessage(ctx: BabyVoiceContext): string {
  return pickByDay(BABY_VOICE_MESSAGES[ctx])
}

export function getNightMessage(): string {
  return pickByDay(NIGHT_MESSAGES)
}

// ── localStorage helpers ──────────────────────────────────────────────────────

function todayDate(): string {
  return new Date().toLocaleDateString('en-CA')
}

// Night session spans 21:00–06:59. Key it to the evening date (before 7am = yesterday).
function nightSessionDate(): string {
  const now = new Date()
  const d = new Date(now)
  if (now.getHours() < 7) d.setDate(d.getDate() - 1)
  return d.toLocaleDateString('en-CA')
}

/** Parse a YYYY-MM-DD string as local midnight (avoids UTC-offset day-shift). */
function parseLocalDate(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).getTime()
}

function nightsSinceLastShown(): number {
  const last = localStorage.getItem('night_msg_last_shown')
  if (!last) return 999
  return Math.floor((parseLocalDate(todayDate()) - parseLocalDate(last)) / 86_400_000)
}

const NIGHT_SHOWN_KEY = 'night_msg_shown'

// ── show-condition exports ────────────────────────────────────────────────────

/**
 * Night encouragement is selective: only shown on rough nights (≥3 night-hour
 * events logged) or after a gap of ≥3 nights since it last appeared.
 */
export function nightMessageShouldShow(nightEventCount: number): boolean {
  if (!isNightHours()) return false
  if (localStorage.getItem(`${NIGHT_SHOWN_KEY}_${nightSessionDate()}`) === 'true') return false
  return nightEventCount >= 3 || nightsSinceLastShown() >= 3
}

export function markNightMessageShown(): void {
  localStorage.setItem(`${NIGHT_SHOWN_KEY}_${nightSessionDate()}`, 'true')
  localStorage.setItem('night_msg_last_shown', todayDate())
}

const BABY_VOICE_LAST_KEY = 'baby_voice_last_shown'

/** Returns true if baby voice hasn't been shown in the last 3 days. */
export function babyVoiceShouldShow(): boolean {
  const last = localStorage.getItem(BABY_VOICE_LAST_KEY)
  if (!last) return true
  return Math.floor((parseLocalDate(todayDate()) - parseLocalDate(last)) / 86_400_000) >= 3
}

export function dismissBabyVoice(): void {
  localStorage.setItem(BABY_VOICE_LAST_KEY, todayDate())
}
