import type { BabyEvent } from './events'

/** A detected cluster feeding episode. */
export interface ClusterEpisode {
  /** IDs of all feed events that are part of this cluster. */
  eventIds: Set<string>
  /** Timestamp of the earliest feed in the cluster. */
  start: Date
  /** Timestamp of the most recent feed in the cluster. */
  end: Date
}

const MIN_FEEDS = 3
const MAX_INTERVAL_MIN = 45   // feeds spaced ≤ 45 min apart are considered part of a cluster
const WINDOW_MIN = 150        // the entire cluster must fit within a 2.5-hour window
const CLUSTER_HOUR_START = 17 // clusters are expected 17:00–23:00
const CLUSTER_HOUR_END = 23

/**
 * Detects cluster feeding episodes from a list of events.
 *
 * A cluster is defined as ≥3 feeds where every consecutive interval is
 * ≤ 45 minutes and the entire episode fits within 2.5 hours.
 * Only episodes that overlap the 17:00–23:00 window are returned, since
 * cluster feeding is predominantly an evening phenomenon.
 *
 * Intervals shorter than this threshold are excluded from the feed
 * prediction model (they are not representative of the underlying hunger
 * cycle). See feature-ideas.md §1 for the rationale and sources.
 */
export function detectClusters(events: BabyEvent[]): ClusterEpisode[] {
  const feeds = events
    .filter((e) => e.type === 'feed')
    .map((e) => ({ id: e.id, time: new Date(e.timestamp) }))
    .sort((a, b) => a.time.getTime() - b.time.getTime())

  if (feeds.length < MIN_FEEDS) return []

  const episodes: ClusterEpisode[] = []
  let i = 0

  while (i < feeds.length) {
    // Greedily extend a candidate cluster starting at i
    const group = [feeds[i]]

    for (let j = i + 1; j < feeds.length; j++) {
      const prev = group[group.length - 1]
      const intervalMin = (feeds[j].time.getTime() - prev.time.getTime()) / 60_000
      if (intervalMin > MAX_INTERVAL_MIN) break
      group.push(feeds[j])
    }

    if (group.length >= MIN_FEEDS) {
      const start = group[0].time
      const end = group[group.length - 1].time
      const windowMin = (end.getTime() - start.getTime()) / 60_000

      if (windowMin <= WINDOW_MIN && overlapsEveningWindow(start, end)) {
        episodes.push({
          eventIds: new Set(group.map((f) => f.id)),
          start,
          end,
        })
        i += group.length // skip past this cluster
        continue
      }
    }

    i++
  }

  return episodes
}

function overlapsEveningWindow(start: Date, end: Date): boolean {
  const startH = start.getHours()
  const endH = end.getHours()
  return (
    (startH >= CLUSTER_HOUR_START && startH < CLUSTER_HOUR_END) ||
    (endH >= CLUSTER_HOUR_START && endH < CLUSTER_HOUR_END)
  )
}
