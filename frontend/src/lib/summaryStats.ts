import { formatDuration } from '@/hooks/useTimeSince'
import { type BabyEvent } from '@/lib/events'

function computeSleepMs(events: BabyEvent[], capAt: Date): number {
  const sleepEvents = events.filter(
    (e) => e.type === 'sleep_start' || e.type === 'sleep_end',
  )
  let total = 0
  let openStart: Date | null = null
  for (const e of sleepEvents) {
    if (e.type === 'sleep_start') {
      openStart = new Date(e.timestamp)
    } else if (e.type === 'sleep_end' && openStart) {
      total += new Date(e.timestamp).getTime() - openStart.getTime()
      openStart = null
    }
  }
  if (openStart !== null) {
    total += capAt.getTime() - openStart.getTime()
  }
  return total
}

function diaperType(e: BabyEvent): string | undefined {
  return (e.metadata as { diaper_type?: string } | null)?.diaper_type
}

export function computeStats(events: BabyEvent[], now = new Date()) {
  const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000)

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
    const m = e.metadata as Record<string, unknown> | null
    if (m?.feed_type === 'breast') {
      breastMinTotal += ((m.left_duration_min as number) ?? 0) + ((m.right_duration_min as number) ?? 0)
    } else if (m?.feed_type === 'bottle') {
      const ml = (m.amount_ml as number) ?? 0
      if (m.bottle_type === 'formula') formulaMlTotal += ml
      else pumpedMlTotal += ml
    }
  }

  const totalSleepMs = computeSleepMs(todayEvents, now)

  const oldestMs = events.length > 0
    ? events.reduce((min, e) => Math.min(min, new Date(e.timestamp).getTime()), Infinity)
    : now.getTime()
  const nAvgDays = Math.min(Math.ceil((now.getTime() - oldestMs) / (24 * 60 * 60 * 1000)), 7)

  const dailyWets: number[] = []
  const dailyDirtys: number[] = []
  const dailyBreastMins: number[] = []
  const dailyPumpedMls: number[] = []
  const dailyFormulaMls: number[] = []
  const dailySleepMs: number[] = []

  for (let d = 1; d <= nAvgDays; d++) {
    const dayEnd = new Date(now.getTime() - (d - 1) * 24 * 60 * 60 * 1000)
    const dayStart = new Date(now.getTime() - d * 24 * 60 * 60 * 1000)
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
      const m = e.metadata as Record<string, unknown> | null
      if (m?.feed_type === 'breast') {
        dBreastMin += ((m.left_duration_min as number) ?? 0) + ((m.right_duration_min as number) ?? 0)
      } else if (m?.feed_type === 'bottle') {
        const ml = (m.amount_ml as number) ?? 0
        if (m.bottle_type === 'formula') dFormulaMl += ml
        else dPumpedMl += ml
      }
    }
    dailyBreastMins.push(dBreastMin)
    dailyPumpedMls.push(dPumpedMl)
    dailyFormulaMls.push(dFormulaMl)

    dailySleepMs.push(computeSleepMs(dayEvents, dayEnd))
  }

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0

  const avgWet = avg(dailyWets)
  const avgDirty = avg(dailyDirtys)
  const avgBreastMin = avg(dailyBreastMins)
  const avgPumpedMl = avg(dailyPumpedMls)
  const avgFormulaMl = avg(dailyFormulaMls)
  const avgSleepMs = avg(dailySleepMs)

  const maxDiapers = Math.max(wetCount, dirtyCount, ...dailyWets, ...dailyDirtys, 1)
  const maxBreastMin = Math.max(breastMinTotal, ...dailyBreastMins, 1)
  const maxBottleMl = Math.max(pumpedMlTotal, formulaMlTotal, ...dailyPumpedMls, ...dailyFormulaMls, 1)
  const maxSleepMs = Math.max(totalSleepMs, ...dailySleepMs, 1)

  return {
    wetCount,
    dirtyCount,
    breastMinTotal,
    pumpedMlTotal,
    formulaMlTotal,
    totalSleepMs,
    totalSleep: totalSleepMs > 0 ? formatDuration(totalSleepMs) : '—',
    avgWet,
    avgDirty,
    avgBreastMin,
    avgPumpedMl,
    avgFormulaMl,
    avgSleepMs,
    maxDiapers,
    maxBreastMin,
    maxBottleMl,
    maxSleepMs,
  }
}
