import type { BabyEvent } from './events'

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
  "You both showed up today — nice teamwork.",
  "Two parents, one team. Baby is lucky.",
  "You're both keeping things consistent.",
  "Both of you in the log today. That counts for a lot.",
  "The village starts at home. Look at you two.",
]

const PARTNER_MESSAGES_SOLO = [
  "Flying solo today — that's a lot. Well done.",
  "Carrying the load today. That doesn't go unnoticed.",
  "One parent, full effort. Respect.",
]

const PARTNER_MESSAGES_NIGHT_SHIFT = [
  "Night shift handled. That's the hardest part.",
  "Those night logs tell a story of dedication.",
  "Up in the night and still logging — you're doing great.",
]

const PARTNER_MESSAGES_POOP_DUTY = [
  "Someone's been on diaper duty today. An unsung hero.",
  "Poop diaper count: high. Complaints logged: zero. Respect.",
  "The glamorous side of parenting — handled without fuss.",
]

const BABY_VOICE_MESSAGES: Record<BabyVoiceContext, string[]> = {
  many_feeds: [
    "Hungry day — growth is real work.",
    "Maximum feeds unlocked.",
    "I had needs. You met them. Respect.",
  ],
  long_nap: [
    "Finally, a proper sleep.",
    "That nap was everything.",
    "Recharging complete.",
  ],
  cluster: [
    "Just needed some extra comfort tonight.",
    "Evening snacks: mandatory.",
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
  all_event_types:   "Feeds, sleep, and diapers all logged today — the full picture.",
  // Time of day
  night_survived:    "You were up at 3am and logged it. That level of dedication is something.",
  cluster_first:     "First cluster feeding logged. It's a lot — and it's completely normal.",
  // Teamwork
  both_partners_first: "First day with both of you in the log. Teamwork from day one.",
  // Consistency
  logging_days_7:    "7 days of logging. You're building something genuinely useful.",
  logging_days_30:   "30 days of logging. A month in. You're really doing this.",
}

// ── types ─────────────────────────────────────────────────────────────────────

export type BabyVoiceContext = 'many_feeds' | 'long_nap' | 'cluster' | 'chaotic' | 'quiet' | 'normal'

export type PartnerContext = 'both' | 'solo' | 'night_shift' | 'poop_duty'

export type MilestoneKey =
  | 'sleep_5h' | 'sleep_8h' | 'nap_2h' | 'sleep_total_14h'
  | 'feeds_8' | 'feeds_12'
  | 'diaper_8'
  | 'all_event_types'
  | 'night_survived' | 'cluster_first'
  | 'both_partners_first'
  | 'logging_days_7' | 'logging_days_30'

export interface PartnerMessageResult {
  context: PartnerContext
  message: string
}

// ── night-hour check ──────────────────────────────────────────────────────────

export function isNightHours(): boolean {
  const h = new Date().getHours()
  return h >= 22 || h < 6
}

// ── baby voice context detection ──────────────────────────────────────────────

export function getBabyVoiceContext(events: BabyEvent[]): BabyVoiceContext {
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
  if (events.length <= 3)  return 'quiet'
  return 'normal'
}

// ── partner context detection ─────────────────────────────────────────────────

export function getPartnerContext(events: BabyEvent[], currentUserId: string): PartnerContext {
  // Poop duty: any user logged ≥ 3 dirty/both diapers
  const poopByUser = new Map<string, number>()
  for (const e of events) {
    if (e.type === 'diaper') {
      const kind = e.metadata?.diaper_type as string | undefined
      if (kind === 'dirty' || kind === 'both') {
        poopByUser.set(e.logged_by, (poopByUser.get(e.logged_by) ?? 0) + 1)
      }
    }
  }
  if ([...poopByUser.values()].some((n) => n >= 3)) return 'poop_duty'

  // Night shift: any user logged ≥ 2 events between 22:00–06:00
  const nightByUser = new Map<string, number>()
  for (const e of events) {
    const h = new Date(e.timestamp).getHours()
    if (h >= 22 || h < 6) {
      nightByUser.set(e.logged_by, (nightByUser.get(e.logged_by) ?? 0) + 1)
    }
  }
  if ([...nightByUser.values()].some((n) => n >= 2)) return 'night_shift'

  // Solo: only one user, or current user logged ≥ 70% of events
  const users = new Set(events.map((e) => e.logged_by))
  if (users.size === 1) return 'solo'
  const myCount = events.filter((e) => e.logged_by === currentUserId).length
  if (events.length > 0 && myCount / events.length >= 0.7) return 'solo'

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

// ── milestone detection ───────────────────────────────────────────────────────

/** Increment the total-days-logged counter, once per calendar day. */
export function trackDailyLogging(): void {
  const key = 'logging_total_days'
  const lastKey = 'logging_last_day'
  const today = new Date().toISOString().slice(0, 10)
  if (localStorage.getItem(lastKey) === today) return
  const current = parseInt(localStorage.getItem(key) ?? '0', 10)
  localStorage.setItem(key, String(current + 1))
  localStorage.setItem(lastKey, today)
}

function totalDaysLogged(): number {
  return parseInt(localStorage.getItem('logging_total_days') ?? '0', 10)
}

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
  if (events.filter((e) => e.type === 'diaper').length >= 8 && unseen('diaper_8'))
    candidates.push('diaper_8')

  // ── variety ────────────────────────────────────────────────────────────────
  const types = new Set(events.map((e) => e.type))
  if (
    types.has('feed') && types.has('sleep_start') && types.has('diaper') &&
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
  const days = totalDaysLogged()
  if (days >= 30 && unseen('logging_days_30'))     candidates.push('logging_days_30')
  else if (days >= 7 && unseen('logging_days_7'))  candidates.push('logging_days_7')

  return candidates[0] ?? null
}

export function getMilestoneMessage(key: MilestoneKey): string {
  return MILESTONE_MESSAGES[key]
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
  return new Date().toISOString().slice(0, 10)
}

// Night session spans 22:00–05:59. Key it to the evening date (before 6am = yesterday).
function nightSessionDate(): string {
  const now = new Date()
  if (now.getHours() < 6) {
    const d = new Date(now)
    d.setDate(d.getDate() - 1)
    return d.toISOString().slice(0, 10)
  }
  return now.toISOString().slice(0, 10)
}

function nightsSinceLastShown(): number {
  const last = localStorage.getItem('night_msg_last_shown')
  if (!last) return 999
  return Math.floor((Date.now() - new Date(last).getTime()) / 86_400_000)
}

const NIGHT_SHOWN_KEY = 'night_msg_shown'
const BABY_VOICE_KEY  = 'baby_voice_dismissed'

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
  localStorage.setItem('night_msg_last_shown', new Date().toISOString().slice(0, 10))
}

export function babyVoiceShouldShow(): boolean {
  return localStorage.getItem(`${BABY_VOICE_KEY}_${todayDate()}`) !== 'true'
}

export function dismissBabyVoice(): void {
  localStorage.setItem(`${BABY_VOICE_KEY}_${todayDate()}`, 'true')
}
