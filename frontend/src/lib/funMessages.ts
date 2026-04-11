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

const PARTNER_MESSAGES = [
  "You both showed up today — nice teamwork.",
  "Two parents, one team. Baby is lucky.",
  "You're both keeping things consistent.",
  "Both of you in the log today. That counts for a lot.",
  "The village starts at home. Look at you two.",
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

// ── context detection ─────────────────────────────────────────────────────────

export type BabyVoiceContext = 'many_feeds' | 'long_nap' | 'cluster' | 'chaotic' | 'quiet' | 'normal'

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

  if (feeds.length >= 9)    return 'many_feeds'
  if (events.length >= 20)  return 'chaotic'
  if (events.length <= 3)   return 'quiet'
  return 'normal'
}

export function bothPartnersLogged(events: BabyEvent[]): boolean {
  return new Set(events.map((e) => e.logged_by)).size >= 2
}

// ── day-seeded message rotation ───────────────────────────────────────────────
// Using day-of-year so the message changes daily but is stable within a day.

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

export function getPartnerMessage(): string {
  return pickByDay(PARTNER_MESSAGES)
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
// Night encouragement: once per "night session". A session spans 22:00 one day
// through 05:59 the next — key it to whichever calendar date contains the 22:00
// start (i.e. if it's before 6am, use yesterday's date).

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

const NIGHT_SHOWN_KEY   = 'night_msg_shown'
const BABY_VOICE_KEY    = 'baby_voice_dismissed'

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
