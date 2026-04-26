import { useMemo, useState } from 'react'
import { Milk, Droplets, Moon, Sun, Pill, TriangleAlert, List, LineDotRightHorizontal, type LucideIcon } from 'lucide-react'
import { type BabyEvent } from '@/lib/events'
import { formatTime } from '@/lib/time'

// ─── Layout constants (px) ────────────────────────────────────────────────────

const PX_PER_HOUR = 80
const TOTAL_H = 24 * PX_PER_HOUR  // 1920

const LABEL_W = 44      // width of hour-label column
const LINE_GAP = 12     // gap between label column and line
const LINE_X = LABEL_W + LINE_GAP   // left edge of vertical line = 56
const LINE_W = 5        // line width
const LINE_CX = LINE_X + LINE_W / 2 // centre of line = 58.5
const MARKER_R = 10     // event-marker circle radius
const MIN_SPACING = 26  // minimum px between adjacent marker centres

// ─── Colors ───────────────────────────────────────────────────────────────────

const SLEEP_COLOR   = 'oklch(0.72 0.08 230 / 0.55)'
const SLEEP_FADE_BOTTOM = `linear-gradient(to bottom, ${SLEEP_COLOR} 55%, oklch(0.72 0.08 230 / 0.18) 100%)`
const SLEEP_DASHED  = `repeating-linear-gradient(to bottom, ${SLEEP_COLOR} 0px, ${SLEEP_COLOR} 9px, transparent 9px, transparent 15px)`

// ─── Types ────────────────────────────────────────────────────────────────────

interface SleepSegment {
  topY: number
  height: number
  orphanTop: boolean
  orphanBottom: boolean
  isConflict: boolean
}

interface SleepWarning {
  y: number
  message: string
}

interface SleepComputed {
  segments: SleepSegment[]
  warnings: SleepWarning[]
}

interface Props {
  events: BabyEvent[]
  onEditEvent: (event: BabyEvent) => void
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function msToY(ms: number, nowMs: number): number {
  return ((nowMs - ms) / 3_600_000) * PX_PER_HOUR
}

function formatHour(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:00`
}

function formatInterval(ms: number): string {
  const totalMin = Math.round(ms / 60_000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function buildDetail(event: BabyEvent): string | null {
  const m = event.metadata
  if (!m) return null
  if (event.type === 'feed') {
    if (m.feed_type === 'breast') {
      const parts: string[] = []
      if (m.left_duration_min)  parts.push(`L${m.left_duration_min}m`)
      if (m.right_duration_min) parts.push(`R${m.right_duration_min}m`)
      return parts.length > 0 ? `Breast ${parts.join(' ')}` : 'Breast'
    }
    if (m.feed_type === 'bottle') {
      const label = m.bottle_type === 'formula' ? 'Formula' : 'Pumped'
      return `${label} ${m.amount_ml ?? '?'}ml`
    }
  }
  if (event.type === 'output') {
    const typeMap: Record<string, string> = { wet: 'Pee', dirty: 'Poo', both: 'Pee+Poo' }
    const label = typeMap[m.diaper_type as string] ?? null
    if (!label) return null
    const loc = m.location as string | undefined
    return loc === 'potty' ? `${label} Potty` : label
  }
  return null
}

const EVENT_ICON: Partial<Record<string, LucideIcon>> = { feed: Milk, output: Droplets }

// ─── Feed interval map ────────────────────────────────────────────────────────

function buildFeedIntervals(events: BabyEvent[]): Map<string, string> {
  const feeds = [...events]
    .filter(e => e.type === 'feed')
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))

  const map = new Map<string, string>()
  for (let i = 1; i < feeds.length; i++) {
    const gap = new Date(feeds[i].timestamp).getTime() - new Date(feeds[i - 1].timestamp).getTime()
    map.set(feeds[i].id, formatInterval(gap))
  }
  return map
}

// ─── Sleep-segment computation ────────────────────────────────────────────────

function computeSleepSegments(events: BabyEvent[], nowMs: number): SleepComputed {
  const sleepEvts = [...events]
    .filter(e => e.type === 'sleep_start' || e.type === 'sleep_end')
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp)) // oldest first

  const segs: SleepSegment[] = []
  const warnings: SleepWarning[] = []
  let openStartMs: number | null = null
  let hadAnySleepEvent = false
  let lastSleepEventY: number | null = null

  for (const e of sleepEvts) {
    const ts = new Date(e.timestamp).getTime()
    const y = msToY(ts, nowMs)

    if (e.type === 'sleep_start') {
      if (openStartMs !== null) {
        // Double sleep_start: dashed conflict segment spanning from the second start (top)
        // to the first start (bottom). Warning at the second (newer) start.
        const oldStartY = msToY(openStartMs, nowMs)
        segs.push({ topY: y, height: oldStartY - y, orphanTop: false, orphanBottom: false, isConflict: true })
        warnings.push({ y, message: 'Missing wake-up?' })
      }
      openStartMs = ts
      hadAnySleepEvent = true
      lastSleepEventY = y
    } else {
      // sleep_end
      if (openStartMs !== null) {
        // Normal paired segment
        const startY = msToY(openStartMs, nowMs)
        segs.push({ topY: y, height: startY - y, orphanTop: false, orphanBottom: false, isConflict: false })
        openStartMs = null
      } else if (hadAnySleepEvent) {
        // sleep_end with no open start but prior sleep events seen → double sleep_end.
        // Dashed conflict segment from this end (top) to the previous sleep event (bottom).
        const prevY = lastSleepEventY ?? TOTAL_H
        segs.push({ topY: y, height: prevY - y, orphanTop: false, orphanBottom: false, isConflict: true })
        warnings.push({ y, message: 'Missing sleep start?' })
      } else {
        // Normal orphanBottom: first event in window is a sleep_end — sleep started before window
        segs.push({ topY: y, height: TOTAL_H - y, orphanTop: false, orphanBottom: true, isConflict: false })
      }
      hadAnySleepEvent = true
      lastSleepEventY = y
    }
  }

  if (openStartMs !== null) {
    // Unclosed sleep_start — currently asleep (or missing sleep_end)
    const startY = msToY(openStartMs, nowMs)
    segs.push({ topY: 0, height: startY, orphanTop: true, orphanBottom: false, isConflict: false })
  }

  const clampedSegs = segs
    .map(s => {
      const top = Math.max(0, Math.min(TOTAL_H, s.topY))
      const bot = Math.max(0, Math.min(TOTAL_H, s.topY + s.height))
      return { ...s, topY: top, height: bot - top }
    })
    .filter(s => s.height > 1)

  return { segments: clampedSegs, warnings }
}

// ─── Overlap resolution ───────────────────────────────────────────────────────

function resolveOverlaps(naturalYs: number[]): number[] {
  const ys = [...naturalYs]
  for (let i = 1; i < ys.length; i++) {
    if (ys[i - 1] - ys[i] < MIN_SPACING) {
      ys[i] = ys[i - 1] - MIN_SPACING
    }
  }
  return ys
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TimelineSection({ events, onEditEvent }: Props) {
  const [tab, setTab] = useState<'timeline' | 'list'>('timeline')

  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now()

  const hourLabels: { label: string; y: number }[] = []
  const cursorBase = new Date(nowMs)
  cursorBase.setMinutes(0, 0, 0)
  for (let i = 0; i <= 24; i++) {
    const t = new Date(cursorBase.getTime() - i * 3_600_000)
    const y = msToY(t.getTime(), nowMs)
    if (y > TOTAL_H) break
    hourLabels.push({ label: formatHour(t), y })
  }

  const { segments: sleepSegments, warnings: sleepWarnings } =
    useMemo(() => computeSleepSegments(events, nowMs), [events]) // eslint-disable-line react-hooks/exhaustive-deps

  const markerEvents = useMemo(
    () => [...events]
      .filter(e => e.type === 'feed' || e.type === 'output')
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    [events],
  )

  const feedIntervals = useMemo(() => buildFeedIntervals(events), [events])

  const adjustedYs = resolveOverlaps(
    markerEvents.map(e => msToY(new Date(e.timestamp).getTime(), nowMs)),
  )

  const topPad = adjustedYs.length > 0 ? Math.max(0, MARKER_R - Math.min(...adjustedYs)) : 0

  const listEvents = useMemo(
    () => [...events].sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
    [events],
  )

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {tab === 'timeline' ? 'Timeline' : 'List'}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setTab('timeline')}
            aria-label="Timeline view"
            className={`p-1 rounded transition-colors ${tab === 'timeline' ? 'text-foreground' : 'text-muted-foreground/40 hover:text-muted-foreground'}`}
          >
            <LineDotRightHorizontal className="w-4 h-4 rotate-90" />
          </button>
          <button
            type="button"
            onClick={() => setTab('list')}
            aria-label="List view"
            className={`p-1 rounded transition-colors ${tab === 'list' ? 'text-foreground' : 'text-muted-foreground/40 hover:text-muted-foreground'}`}
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {tab === 'list' ? (
        <EventList events={listEvents} onEditEvent={onEditEvent} />
      ) : events.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No events in the last 24 hours</p>
      ) : (
        <div className="relative select-none" style={{ height: TOTAL_H + 20 + topPad }}>
          <div className="absolute left-0 right-0 bottom-0" style={{ top: topPad }}>

          {/* "now" label — hidden when within 10 min of a whole hour to avoid overlap */}
          {(() => { const m = new Date(nowMs).getMinutes(); return m >= 10 && m <= 50 })() && (
            <div
              className="absolute text-xs tabular-nums text-muted-foreground"
              style={{ top: -7, left: 0, width: LABEL_W, textAlign: 'right', lineHeight: 1 }}
            >
              now
            </div>
          )}

          {/* Hour labels */}
          {hourLabels.map(({ label, y }) => (
            <div
              key={label}
              className="absolute text-xs tabular-nums text-muted-foreground"
              style={{ top: y - 7, left: 0, width: LABEL_W, textAlign: 'right', lineHeight: 1 }}
            >
              {label}
            </div>
          ))}

          {/* Hour tick marks */}
          {hourLabels.map(({ label, y }) => (
            <div
              key={`tick-${label}`}
              className="absolute"
              style={{
                top: y, left: LINE_X, width: LINE_W, height: 1,
                backgroundColor: 'var(--muted-foreground)', opacity: 0.25,
              }}
            />
          ))}

          {/* Awake line */}
          <div
            className="absolute"
            style={{
              left: LINE_X, width: LINE_W, top: -topPad, height: TOTAL_H + topPad,
              backgroundColor: 'var(--border)', borderRadius: LINE_W,
            }}
          />

          {/* Sleep segments */}
          {sleepSegments.map((seg, i) => {
            const { topY, height, orphanTop, orphanBottom, isConflict } = seg
            let background: string
            if (isConflict || orphanTop) {
              background = SLEEP_DASHED
            } else if (orphanBottom) {
              background = SLEEP_FADE_BOTTOM
            } else {
              background = SLEEP_COLOR
            }
            return (
              <div
                key={i}
                className="absolute"
                style={{ left: LINE_X, width: LINE_W, top: topY, height, background, borderRadius: LINE_W }}
              />
            )
          })}

          {/* Sleep conflict warnings */}
          {sleepWarnings.map((w, i) => (
            <div
              key={i}
              className="absolute flex items-center gap-1 pointer-events-none"
              style={{
                top: w.y,
                left: LINE_CX + LINE_W / 2 + 6,
                transform: 'translateY(-50%)',
              }}
            >
              <TriangleAlert className="w-3 h-3 text-amber-500 shrink-0" />
              <span className="text-xs text-amber-500">{w.message}</span>
            </div>
          ))}

          {/* Event markers + single-line details */}
          {markerEvents.map((event, idx) => {
            const y = adjustedYs[idx]
            const Icon = EVENT_ICON[event.type]
            const detail = buildDetail(event)
            const interval = event.type === 'feed' ? feedIntervals.get(event.id) : undefined

            return (
              <button
                key={event.id}
                onClick={() => onEditEvent(event)}
                aria-label={`Edit ${event.type} event`}
                className="absolute flex items-center gap-2 active:opacity-60"
                style={{
                  top: y,
                  left: LINE_CX - MARKER_R,
                  right: 0,
                  transform: 'translateY(-50%)',
                  paddingRight: 8,
                  minHeight: MARKER_R * 2,
                }}
              >
                <div
                  className="rounded-full border-2 border-primary bg-card shrink-0 flex items-center justify-center"
                  style={{ width: MARKER_R * 2, height: MARKER_R * 2 }}
                >
                  {Icon && <Icon className="text-primary" style={{ width: 10, height: 10 }} />}
                </div>

                <div className="min-w-0 flex-1 flex items-baseline gap-1 overflow-hidden">
                  {detail && (
                    <span className="text-xs text-muted-foreground truncate">{detail}</span>
                  )}
                  {interval && (
                    <span className="text-xs text-muted-foreground/60 shrink-0 tabular-nums">
                      +{interval}
                    </span>
                  )}
                </div>
              </button>
            )
          })}

          </div>
        </div>
      )}
    </div>
  )
}

// ─── List view ────────────────────────────────────────────────────────────────

const LIST_ICON: Partial<Record<string, LucideIcon>> = {
  feed: Milk,
  output: Droplets,
  sleep_start: Moon,
  sleep_end: Sun,
  vitamin_d: Pill,
}

const LIST_LABEL: Partial<Record<string, string>> = {
  sleep_start: 'Sleep',
  sleep_end: 'Wake',
  vitamin_d: 'Vitamin D',
}

function EventList({ events, onEditEvent }: { events: BabyEvent[]; onEditEvent: (e: BabyEvent) => void }) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-6">No events in the last 24 hours</p>
  }

  return (
    <div className="flex flex-col divide-y divide-border">
      {events.map((event) => {
        const Icon = LIST_ICON[event.type]
        const label = LIST_LABEL[event.type]
        const detail = buildDetail(event)
        const date = new Date(event.timestamp)

        return (
          <button
            key={event.id}
            onClick={() => onEditEvent(event)}
            className="flex items-center gap-3 py-2.5 text-left active:opacity-60 w-full"
          >
            <span className="text-xs tabular-nums text-muted-foreground shrink-0 w-10 text-right">{formatTime(date)}</span>
            <div className="rounded-full border-2 border-primary bg-card shrink-0 flex items-center justify-center w-8 h-8">
              {Icon && <Icon className="text-primary w-3.5 h-3.5" />}
            </div>
            <div className="flex-1 min-w-0 flex items-baseline gap-1.5">
              {label && <span className="text-sm text-muted-foreground shrink-0">{label}</span>}
              {detail && <span className="text-sm text-muted-foreground truncate">{detail}</span>}
            </div>
          </button>
        )
      })}
    </div>
  )
}
