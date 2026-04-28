import { formatDuration } from '@/hooks/useTimeSince'
import { type BabyEvent, type FeedMeta, type OutputMeta } from '@/lib/events'
import { MS_PER_DAY } from '@/lib/time'

export interface TrackedStat {
  current: number
  average: number
  scale: number
}

export interface SummaryStats {
  breast: TrackedStat
  pumped: TrackedStat
  formula: TrackedStat
  wet: TrackedStat
  dirty: TrackedStat
  sleep: TrackedStat
  totalSleep: string
}

// Sums sleep duration clipped to [windowStart, capAt]. Pass all available events (not just
// window-filtered) so sessions that started before the window are counted for their overlap.
function computeSleepMs(events: BabyEvent[], windowStart: Date, capAt: Date): number {
  const sleepEvents = events.filter(
    (e) => e.type === 'sleep_start' || e.type === 'sleep_end',
  )
  let total = 0
  let openStart: Date | null = null
  for (const e of sleepEvents) {
    if (e.type === 'sleep_start') {
      openStart = new Date(e.timestamp)
    } else if (e.type === 'sleep_end' && openStart) {
      const clippedStart = Math.max(openStart.getTime(), windowStart.getTime())
      const end = Math.min(new Date(e.timestamp).getTime(), capAt.getTime())
      if (end > clippedStart) total += end - clippedStart
      openStart = null
    }
  }
  if (openStart !== null) {
    const clippedStart = Math.max(openStart.getTime(), windowStart.getTime())
    if (capAt.getTime() > clippedStart) total += capAt.getTime() - clippedStart
  }
  return total
}

function diaperType(e: BabyEvent): 'wet' | 'dirty' | 'both' | undefined {
  return (e.metadata as OutputMeta | null)?.diaper_type
}

export function computeStats(events: BabyEvent[], now = new Date()): SummaryStats {
  const windowStart = new Date(now.getTime() - MS_PER_DAY)

  const todayEvents = events.filter((e) => new Date(e.timestamp) >= windowStart)

  const todayDiapers = todayEvents.filter((e) => e.type === 'output')
  const wetCount = todayDiapers.filter((e) => {
    const t = diaperType(e)
    return t === 'wet' || t === 'both'
  }).length
  const dirtyCount = todayDiapers.filter((e) => {
    const t = diaperType(e)
    return t === 'dirty' || t === 'both'
  }).length

  let breastMinTotal = 0
  let pumpedMlTotal = 0
  let formulaMlTotal = 0
  for (const e of todayEvents.filter((e) => e.type === 'feed')) {
    const m = e.metadata as FeedMeta | null
    if (m?.feed_type === 'breast') {
      breastMinTotal += (m.left_duration_min ?? 0) + (m.right_duration_min ?? 0)
    } else if (m?.feed_type === 'bottle') {
      const ml = m.amount_ml ?? 0
      if (m.bottle_type === 'formula') formulaMlTotal += ml
      else pumpedMlTotal += ml
    }
  }

  // Pass all events (not just todayEvents) so sleep that started before the window still counts
  const totalSleepMs = computeSleepMs(events, windowStart, now)

  const oldestMs = events.length > 0
    ? events.reduce((min, e) => Math.min(min, new Date(e.timestamp).getTime()), Infinity)
    : now.getTime()
  const nAvgDays = Math.min(Math.ceil((now.getTime() - oldestMs) / (MS_PER_DAY)), 7)

  const dailyWets: number[] = []
  const dailyDirtys: number[] = []
  const dailyBreastMins: number[] = []
  const dailyPumpedMls: number[] = []
  const dailyFormulaMls: number[] = []
  const dailySleepMs: number[] = []

  for (let d = 1; d <= nAvgDays; d++) {
    const dayEnd = new Date(now.getTime() - (d - 1) * MS_PER_DAY)
    const dayStart = new Date(now.getTime() - d * MS_PER_DAY)
    const dayEvents = events.filter((e) => {
      const t = new Date(e.timestamp)
      return t >= dayStart && t < dayEnd
    })

    const dayDiapers = dayEvents.filter((e) => e.type === 'output')
    dailyWets.push(dayDiapers.filter((e) => { const t = diaperType(e); return t === 'wet' || t === 'both' }).length)
    dailyDirtys.push(dayDiapers.filter((e) => { const t = diaperType(e); return t === 'dirty' || t === 'both' }).length)

    let dBreastMin = 0
    let dPumpedMl = 0
    let dFormulaMl = 0
    for (const e of dayEvents.filter((e) => e.type === 'feed')) {
      const m = e.metadata as FeedMeta | null
      if (m?.feed_type === 'breast') {
        dBreastMin += (m.left_duration_min ?? 0) + (m.right_duration_min ?? 0)
      } else if (m?.feed_type === 'bottle') {
        const ml = m.amount_ml ?? 0
        if (m.bottle_type === 'formula') dFormulaMl += ml
        else dPumpedMl += ml
      }
    }
    dailyBreastMins.push(dBreastMin)
    dailyPumpedMls.push(dPumpedMl)
    dailyFormulaMls.push(dFormulaMl)

    // Pass all events to correctly handle sleep sessions that cross the day boundary
    dailySleepMs.push(computeSleepMs(events, dayStart, dayEnd))
  }

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0

  const maxDiapers = Math.max(wetCount, dirtyCount, ...dailyWets, ...dailyDirtys, 1)
  const maxBreastMin = Math.max(breastMinTotal, ...dailyBreastMins, 1)
  const maxBottleMl = Math.max(pumpedMlTotal, formulaMlTotal, ...dailyPumpedMls, ...dailyFormulaMls, 1)
  const maxSleepMs = Math.max(totalSleepMs, ...dailySleepMs, 1)

  return {
    breast:  { current: breastMinTotal, average: avg(dailyBreastMins), scale: maxBreastMin },
    pumped:  { current: pumpedMlTotal,  average: avg(dailyPumpedMls),  scale: maxBottleMl  },
    formula: { current: formulaMlTotal, average: avg(dailyFormulaMls), scale: maxBottleMl  },
    wet:     { current: wetCount,       average: avg(dailyWets),       scale: maxDiapers   },
    dirty:   { current: dirtyCount,     average: avg(dailyDirtys),     scale: maxDiapers   },
    sleep:   { current: totalSleepMs,   average: avg(dailySleepMs),    scale: maxSleepMs   },
    totalSleep: totalSleepMs > 0 ? formatDuration(totalSleepMs) : '—',
  }
}
