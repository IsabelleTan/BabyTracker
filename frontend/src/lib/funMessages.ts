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

// Partner messages by context
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

// Milestone messages — shown once ever per milestone key
const MILESTONE_MESSAGES: Record<MilestoneKey, string> = {
  sleep_5h:    "First 5-hour sleep stretch logged. That's a real milestone.",
  feeds_8:     "8 feeds in a day — you're keeping up a great rhythm.",
  days_7:      "7 days of logging. You're building something really useful here.",
  sleep_8h:    "First 8-hour sleep stretch. Sleep is consolidating.",
  poop_streak: "Diaper tracking every day this week — nothing gets past you.",
}

// ── types ─────────────────────────────────────────────────────────────────────

export type BabyVoiceContext = 'many_feeds' | 'long_nap' | 'cluster' | 'chaotic' | 'quiet' | 'normal'

export type PartnerContext = 'both' | 'solo' | 'night_shift' | 'poop_duty'

export type MilestoneKey = 'sleep_5h' | 'feeds_8' | 'days_7' | 'sleep_8h' | 'poop_streak'

export interface PartnerMessageResult {
  context: PartnerContext
  message: string
}

// ── context detection ─────────────────────────────────────────────────────────

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
        new Date(eveningFeeds[i - 1].timestamp).getTime()) /
      60_000
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

/** Returns the partner message context based on today's event distribution. */
export function getPartnerContext(events: BabyEvent[], currentUserId: string): PartnerContext {
  const users = new Set(events.map((e) => e.logged_by))

  // Poop duty: one user logged ≥ 3 dirty/both diapers
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
  const nightEventsByUser = new Map<string, number>()
  for (const e of events) {
    const h = new Date(e.timestamp).getHours()
    if (h >= 22 || h < 6) {
      nightEventsByUser.set(e.logged_by, (nightEventsByUser.get(e.logged_by) ?? 0) + 1)
    }
  }
  if ([...nightEventsByUser.values()].some((n) => n >= 2)) return 'night_shift'

  // Solo: only one user, or one user logged ≥ 70% of events
  if (users.size === 1) return 'solo'
  const myCount = events.filter((e) => e.logged_by === currentUserId).length
  if (events.length > 0 && myCount / events.length >= 0.7) return 'solo'

  return 'both'
}

/** Returns null if no partner message should be shown (no events). */
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

/** Returns the first milestone unlocked today that hasn't been shown before, or null. */
export function getNewMilestone(events: BabyEvent[]): MilestoneKey | null {
  const candidates: MilestoneKey[] = []

  // sleep_5h / sleep_8h: longest completed sleep block
  const sleepSorted = events
    .filter((e) => e.type === 'sleep_start' || e.type === 'sleep_end')
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  let openStart: Date | null = null
  let longestSleepMin = 0
  for (const e of sleepSorted) {
    if (e.type === 'sleep_start') {
      openStart = new Date(e.timestamp)
    } else if (e.type === 'sleep_end' && openStart) {
      const durMin = (new Date(e.timestamp).getTime() - openStart.getTime()) / 60_000
      if (durMin > longestSleepMin) longestSleepMin = durMin
      openStart = null
    }
  }
  if (longestSleepMin >= 480) candidates.push('sleep_8h')
  else if (longestSleepMin >= 300) candidates.push('sleep_5h')

  // feeds_8: ≥ 8 feeds logged today
  if (events.filter((e) => e.type === 'feed').length >= 8) candidates.push('feeds_8')

  // Return the first candidate not yet shown
  for (const key of candidates) {
    if (localStorage.getItem(`milestone_${key}`) !== 'true') return key
  }
  return null
}

export function getMilestoneMessage(key: MilestoneKey): string {
  return MILESTONE_MESSAGES[key]
}

export function markMilestoneSeen(key: MilestoneKey): void {
  localStorage.setItem(`milestone_${key}`, 'true')
}

// ── day-seeded message rotation ───────────────────────────────────────────────

function dayOfYear(): number {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 0)
  return Math.floor((now.getTime() - start.getTime()) / 86_400_000)
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

// ── night-hour check ──────────────────────────────────────────────────────────

export function isNightHours(): boolean {
  const h = new Date().getHours()
  return h >= 22 || h < 6
}

// ── localStorage suppression ──────────────────────────────────────────────────

function todayDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function nightSessionDate(): string {
  const now = new Date()
  if (now.getHours() < 6) {
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    return yesterday.toISOString().slice(0, 10)
  }
  return now.toISOString().slice(0, 10)
}

const NIGHT_SHOWN_KEY = 'night_msg_shown'
const BABY_VOICE_KEY  = 'baby_voice_dismissed'

export function nightMessageShouldShow(): boolean {
  return isNightHours() &&
    localStorage.getItem(`${NIGHT_SHOWN_KEY}_${nightSessionDate()}`) !== 'true'
}

export function markNightMessageShown(): void {
  localStorage.setItem(`${NIGHT_SHOWN_KEY}_${nightSessionDate()}`, 'true')
}

export function babyVoiceShouldShow(): boolean {
  return localStorage.getItem(`${BABY_VOICE_KEY}_${todayDate()}`) !== 'true'
}

export function dismissBabyVoice(): void {
  localStorage.setItem(`${BABY_VOICE_KEY}_${todayDate()}`, 'true')
}
