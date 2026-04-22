import React, { useState, useEffect, useRef, useMemo } from 'react'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from '@/components/ui/drawer'
import { Droplet, Droplets, CirclePile, Milk, Venus } from 'lucide-react'
import { fromDateTimeLocal, type EventType } from '@/lib/events'

interface EventSheetProps {
  type: EventType | null
  onSave: (timestamp: string, metadata: Record<string, unknown> | null) => void
  onDismiss: () => void
}

const TITLES: Record<EventType, string> = {
  feed: 'Feed',
  sleep_start: 'Sleep started',
  sleep_end: 'Woke up',
  diaper: 'Diaper',
}

// ─── Wheel data ──────────────────────────────────────────────────────────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const HOURS   = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))

const BASE_YEAR = new Date().getFullYear()
// Offer 3 years: last, current, next — index 1 = current year
const YEARS = [String(BASE_YEAR - 1), String(BASE_YEAR), String(BASE_YEAR + 1)]

function daysArray(monthIdx: number, yearOffset: number): string[] {
  const year = BASE_YEAR - 1 + yearOffset
  const count = new Date(year, monthIdx + 1, 0).getDate()
  return Array.from({ length: count }, (_, i) => String(i + 1).padStart(2, '0'))
}

// ─── WheelPicker ─────────────────────────────────────────────────────────────

const ITEM_H = 40

function WheelPicker({
  values,
  selectedIndex,
  onChange,
  width = 52,
}: {
  values: string[]
  selectedIndex: number
  onChange: (index: number) => void
  width?: number
}) {
  const maxOffset = (values.length - 1) * ITEM_H

  const startYRef      = useRef<number | null>(null)
  const startOffsetRef = useRef(selectedIndex * ITEM_H)
  const currentOffRef  = useRef(selectedIndex * ITEM_H)
  const isDraggingRef  = useRef(false)
  const onChangeRef    = useRef(onChange)
  onChangeRef.current  = onChange

  // Velocity tracking: ring buffer of recent {y, t} samples
  const moveHistoryRef = useRef<{ y: number; t: number }[]>([])
  const rafRef         = useRef<number | null>(null)
  const momentumRef    = useRef(false)

  const [displayOffset, setDisplayOffset] = useState(selectedIndex * ITEM_H)
  const [dragging, setDragging] = useState(false)

  // Sync display when selectedIndex or maxOffset changes externally (reset / month length change)
  useEffect(() => {
    if (!isDraggingRef.current && !momentumRef.current) {
      const clamped = Math.max(0, Math.min(maxOffset, selectedIndex * ITEM_H))
      currentOffRef.current = clamped
      setDisplayOffset(clamped)
    }
  }, [selectedIndex, maxOffset])

  function cancelMomentum() {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    momentumRef.current = false
  }

  function snapToNearest() {
    const snapped = Math.max(0, Math.min(values.length - 1, Math.round(currentOffRef.current / ITEM_H)))
    currentOffRef.current = snapped * ITEM_H
    setDisplayOffset(snapped * ITEM_H)
    onChangeRef.current(snapped)
    momentumRef.current = false
  }

  function startMomentum(velocityPxPerMs: number) {
    // Convert to px/frame at ~60fps, apply a boost so fast flicks travel further
    let vel = velocityPxPerMs * 16 * 1.4
    const FRICTION = 0.95

    momentumRef.current = true
    setDragging(false)

    function step() {
      vel *= FRICTION
      const next = currentOffRef.current + vel
      const clamped = Math.max(0, Math.min(maxOffset, next))
      currentOffRef.current = clamped
      setDisplayOffset(clamped)

      // Stop when slow enough or hit boundary
      if (Math.abs(vel) > 0.8 && clamped > 0 && clamped < maxOffset) {
        rafRef.current = requestAnimationFrame(step)
      } else {
        snapToNearest()
      }
    }
    rafRef.current = requestAnimationFrame(step)
  }

  function startDrag(clientY: number) {
    cancelMomentum()
    startYRef.current      = clientY
    startOffsetRef.current = currentOffRef.current
    isDraggingRef.current  = true
    moveHistoryRef.current = [{ y: clientY, t: Date.now() }]
    setDragging(true)
  }

  function moveDrag(clientY: number) {
    if (startYRef.current === null) return
    const now = Date.now()
    // Keep only samples from the last 80ms for velocity calculation
    moveHistoryRef.current = moveHistoryRef.current.filter(p => now - p.t < 80)
    moveHistoryRef.current.push({ y: clientY, t: now })

    const delta = startYRef.current - clientY
    const next  = Math.max(0, Math.min(maxOffset, startOffsetRef.current + delta))
    currentOffRef.current = next
    setDisplayOffset(next)
  }

  function endDrag() {
    if (!isDraggingRef.current) return
    isDraggingRef.current = false
    startYRef.current = null

    // Compute velocity from recent history
    const history = moveHistoryRef.current
    let velocity = 0
    if (history.length >= 2) {
      const oldest = history[0]
      const newest = history[history.length - 1]
      const dt = newest.t - oldest.t
      if (dt > 0) velocity = (oldest.y - newest.y) / dt  // px/ms, positive = scrolling down (offset increases)
    }
    moveHistoryRef.current = []

    if (Math.abs(velocity) > 0.1) {
      startMomentum(velocity)
    } else {
      setDragging(false)
      snapToNearest()
    }
  }

  // Global mouse listeners + cleanup
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => { if (isDraggingRef.current) moveDrag(e.clientY) }
    const onMouseUp   = ()              => { if (isDraggingRef.current) endDrag() }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup',   onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup',   onMouseUp)
      cancelMomentum()
    }
  }, []) // refs only — no stale closures

  const translateY = 1 * ITEM_H - displayOffset

  return (
    <div className="flex flex-col items-center">
      <div
        className="relative overflow-hidden select-none cursor-ns-resize"
        style={{ height: 3 * ITEM_H, width }}
        onTouchStart={(e) => { e.stopPropagation(); startDrag(e.touches[0].clientY) }}
        onTouchMove={(e) => { e.stopPropagation(); e.preventDefault(); moveDrag(e.touches[0].clientY) }}
        onTouchEnd={(e) => { e.stopPropagation(); endDrag() }}
        onMouseDown={(e) => startDrag(e.clientY)}
      >
        {/* Scrolling items */}
        <div
          className="absolute top-0 left-0 right-0 z-10"
          style={{
            transform:  `translateY(${translateY}px)`,
            transition: (dragging || momentumRef.current) ? 'none' : 'transform 150ms ease-out',
          }}
        >
          {values.map((v, i) => {
            const dist     = Math.abs(i * ITEM_H - displayOffset) / ITEM_H
            const isCenter = dist < 0.4
            return (
              <div
                key={i}
                className="flex items-center justify-center tabular-nums"
                style={{
                  height:     ITEM_H,
                  opacity:    Math.max(0.2, 1 - dist * 0.45),
                  fontSize:   '0.95rem',
                  fontWeight: isCenter ? 600 : 400,
                  color:      isCenter ? 'var(--foreground)' : 'var(--muted-foreground)',
                }}
              >
                {v}
              </div>
            )
          })}
        </div>

        {/* Fade top / bottom */}
        <div className="absolute inset-x-0 top-0 pointer-events-none z-20"
          style={{ height: 1 * ITEM_H, background: 'linear-gradient(to bottom, var(--card) 15%, transparent 100%)' }} />
        <div className="absolute inset-x-0 bottom-0 pointer-events-none z-20"
          style={{ height: 1 * ITEM_H, background: 'linear-gradient(to top, var(--card) 15%, transparent 100%)' }} />
      </div>
    </div>
  )
}

// ─── Segmented Control ───────────────────────────────────────────────────────

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  labels,
}: {
  options: readonly T[]
  value: T
  onChange: (v: T) => void
  labels?: Partial<Record<T, React.ReactNode>>
}) {
  return (
    <div className="flex rounded-md bg-muted">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={`flex-1 py-2.5 rounded-md text-sm transition-all ${
            value === opt
              ? 'bg-card text-foreground font-semibold shadow-sm'
              : 'text-muted-foreground font-medium'
          }`}
        >
          {labels?.[opt] ?? opt}
        </button>
      ))}
    </div>
  )
}

// ─── Timer helpers ────────────────────────────────────────────────────────────

function formatTimer(ms: number): string {
  const totalSecs = Math.floor(ms / 1000)
  const mins = Math.floor(totalSecs / 60)
  const secs = totalSecs % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function EventSheet({ type, onSave, onDismiss }: EventSheetProps) {
  const [selDay,    setSelDay]    = useState(0)
  const [selMonth,  setSelMonth]  = useState(0)
  const [selYear,   setSelYear]   = useState(1)   // 1 = current year
  const [selHour,   setSelHour]   = useState(0)
  const [selMinute, setSelMinute] = useState(0)

  const [feedType,   setFeedType]   = useState<'breast' | 'bottle'>('breast')
  const [leftMin,    setLeftMin]    = useState('')
  const [rightMin,   setRightMin]   = useState('')
  const [amountMl,   setAmountMl]   = useState('')
  const [diaperType, setDiaperType] = useState<'wet' | 'dirty' | 'both'>('wet')

  // Breastfeed timers
  const [leftRunning,    setLeftRunning]    = useState(false)
  const [rightRunning,   setRightRunning]   = useState(false)
  const [leftElapsedMs,  setLeftElapsedMs]  = useState(0)
  const [rightElapsedMs, setRightElapsedMs] = useState(0)
  const leftStartMsRef    = useRef(0)
  const rightStartMsRef   = useRef(0)
  const leftIntervalRef   = useRef<ReturnType<typeof setInterval> | null>(null)
  const rightIntervalRef  = useRef<ReturnType<typeof setInterval> | null>(null)

  // Cleanup intervals on unmount
  useEffect(() => {
    return () => {
      if (leftIntervalRef.current)  clearInterval(leftIntervalRef.current)
      if (rightIntervalRef.current) clearInterval(rightIntervalRef.current)
    }
  }, [])

  const days = useMemo(() => daysArray(selMonth, selYear), [selMonth, selYear])

  // Clamp day when month / year changes
  useEffect(() => {
    if (selDay >= days.length) setSelDay(days.length - 1)
  }, [days.length])

  // Reset form when a new event type is opened
  useEffect(() => {
    if (type) {
      const now = new Date()
      setSelDay(now.getDate() - 1)
      setSelMonth(now.getMonth())
      setSelYear(1)
      setSelHour(now.getHours())
      setSelMinute(now.getMinutes())
      setFeedType('breast')
      setLeftMin('')
      setRightMin('')
      setAmountMl('')
      setDiaperType('wet')
      // Reset timers
      if (leftIntervalRef.current)  { clearInterval(leftIntervalRef.current);  leftIntervalRef.current  = null }
      if (rightIntervalRef.current) { clearInterval(rightIntervalRef.current); rightIntervalRef.current = null }
      setLeftRunning(false)
      setRightRunning(false)
      setLeftElapsedMs(0)
      setRightElapsedMs(0)
    }
  }, [type])

  function resetToNow() {
    const now = new Date()
    setSelDay(now.getDate() - 1)
    setSelMonth(now.getMonth())
    setSelYear(1)
    setSelHour(now.getHours())
    setSelMinute(now.getMinutes())
  }

  function toggleLeftTimer() {
    if (leftRunning) {
      if (leftIntervalRef.current) { clearInterval(leftIntervalRef.current); leftIntervalRef.current = null }
      setLeftRunning(false)
      const elapsed = Date.now() - leftStartMsRef.current
      setLeftElapsedMs(elapsed)
      setLeftMin(String(Math.round(elapsed / 60000 * 10) / 10))
    } else {
      leftStartMsRef.current = Date.now()
      setLeftRunning(true)
      leftIntervalRef.current = setInterval(() => {
        setLeftElapsedMs(Date.now() - leftStartMsRef.current)
      }, 100)
    }
  }

  function toggleRightTimer() {
    if (rightRunning) {
      if (rightIntervalRef.current) { clearInterval(rightIntervalRef.current); rightIntervalRef.current = null }
      setRightRunning(false)
      const elapsed = Date.now() - rightStartMsRef.current
      setRightElapsedMs(elapsed)
      setRightMin(String(Math.round(elapsed / 60000 * 10) / 10))
    } else {
      rightStartMsRef.current = Date.now()
      setRightRunning(true)
      rightIntervalRef.current = setInterval(() => {
        setRightElapsedMs(Date.now() - rightStartMsRef.current)
      }, 100)
    }
  }

  function buildMetadata(): Record<string, unknown> | null {
    if (type === 'feed') {
      if (feedType === 'breast') {
        // If a timer is still running when saving, use its current elapsed value
        const lMin = leftRunning
          ? (Date.now() - leftStartMsRef.current) / 60000
          : (leftMin ? Number(leftMin) : null)
        const rMin = rightRunning
          ? (Date.now() - rightStartMsRef.current) / 60000
          : (rightMin ? Number(rightMin) : null)
        return {
          feed_type: 'breast',
          left_duration_min:  lMin,
          right_duration_min: rMin,
        }
      }
      return { feed_type: 'bottle', amount_ml: amountMl ? Number(amountMl) : null }
    }
    if (type === 'diaper') return { diaper_type: diaperType }
    return null
  }

  function handleSave() {
    const year    = BASE_YEAR - 1 + selYear
    const month   = String(selMonth + 1).padStart(2, '0')
    const day     = String(selDay + 1).padStart(2, '0')
    const hour    = String(selHour).padStart(2, '0')
    const minute  = String(selMinute).padStart(2, '0')
    onSave(fromDateTimeLocal(`${year}-${month}-${day}T${hour}:${minute}`), buildMetadata())
  }

  return (
    <Drawer open={type !== null} onClose={onDismiss}>
      <DrawerContent>
        <DrawerHeader className="pb-2">
          <DrawerTitle>{type ? TITLES[type] : ''}</DrawerTitle>
        </DrawerHeader>

        <div className="px-4 pb-2 space-y-3">

          {/* Date + time wheels */}
          <div className="flex items-center gap-1" data-vaul-no-drag>
            {/* Date group */}
            <WheelPicker values={days}   selectedIndex={selDay}    onChange={setSelDay}    width={44} />
            <WheelPicker values={MONTHS} selectedIndex={selMonth}  onChange={setSelMonth}  width={54} />
            <WheelPicker values={YEARS}  selectedIndex={selYear}   onChange={setSelYear}   width={64} />

            {/* Spacer between date and time */}
            <div className="w-4" />

            {/* Time group */}
            <WheelPicker values={HOURS}   selectedIndex={selHour}   onChange={setSelHour}   width={44} />
            <div className="text-xl font-semibold text-muted-foreground">:</div>
            <WheelPicker values={MINUTES} selectedIndex={selMinute} onChange={setSelMinute} width={44} />

            {/* Now reset */}
            <button
              type="button"
              onClick={resetToNow}
              className="ml-2 px-3 py-2 text-sm rounded-md bg-card border border-input text-foreground font-medium shadow-sm active:brightness-95"
            >
              Now
            </button>
          </div>

          {/* Feed-specific */}
          {type === 'feed' && (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Type</label>
                <SegmentedControl
                  options={['breast', 'bottle'] as const}
                  value={feedType}
                  onChange={setFeedType}
                  labels={{
                    breast: <span className="flex items-center justify-center gap-1.5"><Venus className="w-3.5 h-3.5" />Breast</span>,
                    bottle: <span className="flex items-center justify-center gap-1.5"><Milk  className="w-3.5 h-3.5" />Bottle</span>,
                  }}
                />
              </div>

              {feedType === 'breast' ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label htmlFor="left-min" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Left (min)</label>
                    <div className="flex gap-1.5">
                      <input
                        id="left-min"
                        type="number"
                        min="0"
                        placeholder="—"
                        value={leftMin}
                        onChange={(e) => setLeftMin(e.target.value)}
                        className="flex-1 min-w-0 h-11 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                      />
                      <button
                        type="button"
                        onClick={toggleLeftTimer}
                        className={`h-11 px-2.5 rounded-md text-sm font-medium border transition-colors flex flex-col items-center justify-center ${
                          leftRunning
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-background border-input text-foreground'
                        }`}
                      >
                        {leftRunning ? (
                          <>
                            <span>Stop</span>
                            <span className="text-[10px] tabular-nums leading-none">{formatTimer(leftElapsedMs)}</span>
                          </>
                        ) : 'Start'}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="right-min" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Right (min)</label>
                    <div className="flex gap-1.5">
                      <input
                        id="right-min"
                        type="number"
                        min="0"
                        placeholder="—"
                        value={rightMin}
                        onChange={(e) => setRightMin(e.target.value)}
                        className="flex-1 min-w-0 h-11 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                      />
                      <button
                        type="button"
                        onClick={toggleRightTimer}
                        className={`h-11 px-2.5 rounded-md text-sm font-medium border transition-colors flex flex-col items-center justify-center ${
                          rightRunning
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-background border-input text-foreground'
                        }`}
                      >
                        {rightRunning ? (
                          <>
                            <span>Stop</span>
                            <span className="text-[10px] tabular-nums leading-none">{formatTimer(rightElapsedMs)}</span>
                          </>
                        ) : 'Start'}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label htmlFor="amount-ml" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Amount (ml)</label>
                  <input
                    id="amount-ml"
                    type="number"
                    min="0"
                    placeholder="—"
                    value={amountMl}
                    onChange={(e) => setAmountMl(e.target.value)}
                    className="w-full h-11 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              )}
            </>
          )}

          {/* Diaper-specific */}
          {type === 'diaper' && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Type</label>
              <SegmentedControl
                options={['wet', 'dirty', 'both'] as const}
                value={diaperType}
                onChange={setDiaperType}
                labels={{
                  wet:   <span className="flex items-center justify-center gap-1.5"><Droplet   className="w-3.5 h-3.5" />Wet</span>,
                  dirty: <span className="flex items-center justify-center gap-1.5"><CirclePile className="w-3.5 h-3.5" />Dirty</span>,
                  both:  <span className="flex items-center justify-center gap-1.5"><Droplets  className="w-3.5 h-3.5" />Both</span>,
                }}
              />
            </div>
          )}

        </div>

        <DrawerFooter className="pt-2" data-vaul-no-drag>
          <button
            onClick={handleSave}
            className="w-full h-11 rounded-md bg-primary text-primary-foreground font-medium text-sm"
          >
            Save
          </button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
