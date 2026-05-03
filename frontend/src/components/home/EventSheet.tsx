import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useTimer } from '@/hooks/useTimer'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from '@/components/ui/drawer'
import { Droplet, Droplets, CirclePile, Baby, Toilet, Trash2, Moon, Sun, AlertTriangle } from 'lucide-react'
import { fromDateTimeLocal, type EventType, type BabyEvent, type EventMeta, type FeedMeta, type OutputMeta } from '@/lib/events'

interface EventSheetProps {
  type: EventType | null
  /** When set, the form is pre-filled with this event's data (edit mode). */
  initialEvent?: BabyEvent | null
  onSave: (timestamp: string, metadata: EventMeta) => void
  /** When provided a Delete button is shown (edit mode only). */
  onDelete?: () => void
  onDismiss: () => void
  /** Called when the user toggles between sleep_start / sleep_end in create mode. */
  onTypeChange?: (type: EventType) => void
}

const TITLES: Record<EventType, string> = {
  feed: 'Feed',
  sleep_start: 'Sleep started',
  sleep_end: 'Woke up',
  output: 'Output',
  vitamin_d: 'Vitamin D',
}

// ─── Wheel data ──────────────────────────────────────────────────────────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const HOURS   = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'))

function daysArray(monthIdx: number, year: number): string[] {
  const count = new Date(year, monthIdx + 1, 0).getDate()
  return Array.from({ length: count }, (_, i) => String(i + 1).padStart(2, '0'))
}

// ─── WheelPicker ─────────────────────────────────────────────────────────────

const ITEM_H = 40
const CYCLIC_REPEAT = 11  // middle repetition is index 5; 5 cycles of padding each side

function WheelPicker({
  values,
  selectedIndex,
  onChange,
  width = 52,
  cyclic = false,
}: {
  values: string[]
  selectedIndex: number
  onChange: (index: number) => void
  width?: number
  cyclic?: boolean
}) {
  const n = values.length
  const HALF = cyclic ? Math.floor(CYCLIC_REPEAT / 2) : 0

  // For cyclic pickers expand to a large virtual list; otherwise use values as-is
  // Callers must pass a stable reference (constant or memoized array).
  const virtualValues = useMemo(
    () => cyclic
      ? Array.from({ length: CYCLIC_REPEAT * n }, (_, i) => values[i % n])
      : values,
    [cyclic, n, values]
  )

  // Map external index → virtual index (always in the middle section)
  const toVirtual  = (idx: number) => cyclic ? HALF * n + idx : idx
  // Map virtual index → external index
  const toExternal = (vIdx: number) => cyclic ? ((vIdx % n) + n) % n : vIdx

  const maxOffset = (virtualValues.length - 1) * ITEM_H

  const startYRef      = useRef<number | null>(null)
  const startOffsetRef = useRef(toVirtual(selectedIndex) * ITEM_H)
  const currentOffRef  = useRef(toVirtual(selectedIndex) * ITEM_H)
  const isDraggingRef  = useRef(false)
  const onChangeRef    = useRef(onChange)
  onChangeRef.current  = onChange // event-handler ref; onChange is never called during render

  // Velocity tracking: ring buffer of recent {y, t} samples
  const moveHistoryRef = useRef<{ y: number; t: number }[]>([])
  const rafRef         = useRef<number | null>(null)
  const momentumRef    = useRef(false)

  const [displayOffset, setDisplayOffset] = useState(toVirtual(selectedIndex) * ITEM_H)
  const [dragging, setDragging] = useState(false)

  // Sync display when selectedIndex changes externally (reset / month length change)
  useEffect(() => {
    if (!isDraggingRef.current && !momentumRef.current) {
      // For cyclic, find the virtual index nearest to the current scroll position
      // that maps to the new selectedIndex, to avoid large jumps
      let targetVirtual: number
      if (cyclic) {
        const currentVirtualIdx = Math.round(currentOffRef.current / ITEM_H)
        const k = Math.round((currentVirtualIdx - selectedIndex) / n)
        targetVirtual = Math.max(0, Math.min(virtualValues.length - 1, selectedIndex + k * n))
      } else {
        targetVirtual = selectedIndex
      }
      const clamped = Math.max(0, Math.min(maxOffset, targetVirtual * ITEM_H))
      currentOffRef.current = clamped
      setDisplayOffset(clamped)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- cyclic, n, and virtualValues.length are all transitively captured by maxOffset; if any of them change, maxOffset changes and the effect re-fires
  }, [selectedIndex, maxOffset])

  function cancelMomentum() {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    momentumRef.current = false
  }

  function snapToNearest() {
    const snapped = Math.max(0, Math.min(virtualValues.length - 1, Math.round(currentOffRef.current / ITEM_H)))
    currentOffRef.current = snapped * ITEM_H
    setDisplayOffset(snapped * ITEM_H)
    onChangeRef.current(toExternal(snapped))
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- moveDrag/endDrag read all mutable state through refs so they never go stale; empty deps is intentional to avoid re-registering listeners on every render
  }, [])

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
            transition: (dragging || momentumRef.current) ? 'none' : 'transform 150ms ease-out', // reads ref to skip CSS transition during momentum
          }}
        >
          {virtualValues.map((v, i) => {
            const dist     = Math.abs(i * ITEM_H - displayOffset) / ITEM_H
            const isCenter = dist < 0.4
            return (
              <div
                key={i}
                className="flex items-center justify-center tabular-nums"
                style={{
                  height:     ITEM_H,
                  opacity:    Math.max(0.2, 1 - dist * 0.45),
                  fontSize:   isCenter ? '1.2rem' : '1.05rem',
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

// ─── Feed / output sub-forms ──────────────────────────────────────────────────

function BreastFeedForm({
  leftMin, setLeftMin, rightMin, setRightMin,
  leftRunning, rightRunning, leftElapsedMs, rightElapsedMs,
  onToggleLeft, onToggleRight,
}: {
  leftMin: string; setLeftMin: (v: string) => void
  rightMin: string; setRightMin: (v: string) => void
  leftRunning: boolean; rightRunning: boolean
  leftElapsedMs: number; rightElapsedMs: number
  onToggleLeft: () => void; onToggleRight: () => void
}) {
  return (
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
            onClick={onToggleLeft}
            className={`h-11 px-2.5 rounded-md text-sm font-medium border transition-colors flex flex-col items-center justify-center ${
              leftRunning
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background border-input text-foreground'
            }`}
          >
            {leftRunning ? (
              <><span>Stop</span><span className="text-[10px] tabular-nums leading-none">{formatTimer(leftElapsedMs)}</span></>
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
            onClick={onToggleRight}
            className={`h-11 px-2.5 rounded-md text-sm font-medium border transition-colors flex flex-col items-center justify-center ${
              rightRunning
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background border-input text-foreground'
            }`}
          >
            {rightRunning ? (
              <><span>Stop</span><span className="text-[10px] tabular-nums leading-none">{formatTimer(rightElapsedMs)}</span></>
            ) : 'Start'}
          </button>
        </div>
      </div>
    </div>
  )
}


function OutputForm({
  outputLocation, setOutputLocation, diaperType, setDiaperType,
}: {
  outputLocation: 'diaper' | 'potty' | 'accident'; setOutputLocation: (v: 'diaper' | 'potty' | 'accident') => void
  diaperType: 'wet' | 'dirty' | 'both'; setDiaperType: (v: 'wet' | 'dirty' | 'both') => void
}) {
  return (
    <>
      <div className="space-y-1.5">
        <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Where</label>
        <SegmentedControl
          options={['diaper', 'potty', 'accident'] as const}
          value={outputLocation}
          onChange={setOutputLocation}
          labels={{
            diaper: <span className="flex items-center justify-center gap-1.5"><Baby className="w-3.5 h-3.5" />Diaper</span>,
            potty: <span className="flex items-center justify-center gap-1.5"><Toilet className="w-3.5 h-3.5" />Potty</span>,
            accident: <span className="flex items-center justify-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" />Accident</span>,
          }}
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Type</label>
        <SegmentedControl
          options={['wet', 'dirty', 'both'] as const}
          value={diaperType}
          onChange={setDiaperType}
          labels={{
            wet:   <span className="flex items-center justify-center gap-1.5"><Droplet    className="w-3.5 h-3.5" />Pee</span>,
            dirty: <span className="flex items-center justify-center gap-1.5"><CirclePile className="w-3.5 h-3.5" />Poo</span>,
            both:  <span className="flex items-center justify-center gap-1.5"><Droplets   className="w-3.5 h-3.5" />Both</span>,
          }}
        />
      </div>
    </>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function EventSheet({ type, initialEvent, onSave, onDelete, onDismiss, onTypeChange }: EventSheetProps) {
  const [baseYear, setBaseYear] = useState(() => new Date().getFullYear())
  const years = useMemo(
    () => [String(baseYear - 1), String(baseYear), String(baseYear + 1)],
    [baseYear],
  )

  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  const [selDay,    setSelDay]    = useState(0)
  const [selMonth,  setSelMonth]  = useState(0)
  const [selYear,   setSelYear]   = useState(1)   // 1 = current year
  const [selHour,   setSelHour]   = useState(0)
  const [selMinute, setSelMinute] = useState(0)

  const [leftMin,    setLeftMin]    = useState('')
  const [rightMin,   setRightMin]   = useState('')
  const [pumpedMl,   setPumpedMl]   = useState('')
  const [formulaMl,  setFormulaMl]  = useState('')
  const [diaperType, setDiaperType] = useState<'wet' | 'dirty' | 'both'>('wet')
  const [outputLocation, setOutputLocation] = useState<'diaper' | 'potty' | 'accident'>('diaper')

  // Breastfeed timers
  const leftTimer  = useTimer((minutes) => setLeftMin(String(minutes)))
  const rightTimer = useTimer((minutes) => setRightMin(String(minutes)))

  const days = useMemo(
    () => daysArray(selMonth, Number(years[selYear])),
    [selMonth, selYear, years],
  )

  // Clamp day when month / year changes
  useEffect(() => {
    if (selDay >= days.length) setSelDay(days.length - 1) // eslint-disable-line react-hooks/set-state-in-effect
  }, [days.length, selDay])

  // Reset / pre-fill form when the sheet opens or the target event changes
  useEffect(() => {
    if (type) {
      // Compute fresh year values inline so we don't read the stale `years` memo
      const freshBaseYear = new Date().getFullYear()
      const freshYears = [String(freshBaseYear - 1), String(freshBaseYear), String(freshBaseYear + 1)]
      setBaseYear(freshBaseYear) // eslint-disable-line react-hooks/set-state-in-effect

      // Reset timers unconditionally
      leftTimer.reset()
      rightTimer.reset()

      if (initialEvent) {
        // Edit mode — pre-fill from the existing event
        const d = new Date(initialEvent.timestamp)
        const yearIdx = freshYears.indexOf(String(d.getFullYear()))
        setSelDay(d.getDate() - 1)
        setSelMonth(d.getMonth())
        setSelYear(yearIdx !== -1 ? yearIdx : 1)
        setSelHour(d.getHours())
        setSelMinute(Math.floor(d.getMinutes() / 5))

        const m = initialEvent.metadata
        if (initialEvent.type === 'feed') {
          const fm = (m ?? {}) as FeedMeta & Record<string, unknown>
          setLeftMin(fm.breast_left_min != null ? String(fm.breast_left_min) : '')
          setRightMin(fm.breast_right_min != null ? String(fm.breast_right_min) : '')
          setPumpedMl(fm.pumped_ml != null ? String(fm.pumped_ml) : '')
          setFormulaMl(fm.formula_ml != null ? String(fm.formula_ml) : '')
        } else if (initialEvent.type === 'output' && m) {
          const om = m as OutputMeta
          setDiaperType(om.diaper_type)
          setOutputLocation(om.location)
        } else {
          // sleep_start / sleep_end / vitamin_d — no metadata
          setLeftMin('')
          setRightMin('')
          setPumpedMl('')
          setFormulaMl('')
          setDiaperType('wet')
          setOutputLocation('diaper')
        }
      } else {
        // Create mode — reset to now
        const now = new Date()
        setSelDay(now.getDate() - 1)
        setSelMonth(now.getMonth())
        setSelYear(1)
        setSelHour(now.getHours())
        setSelMinute(Math.floor(now.getMinutes() / 5))
        setLeftMin('')
        setRightMin('')
        setPumpedMl('')
        setFormulaMl('')
        setDiaperType('wet')
        setOutputLocation('diaper')
      }
    }
  }, [type, initialEvent?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  function resetToNow() {
    const now = new Date()
    setSelDay(now.getDate() - 1)
    setSelMonth(now.getMonth())
    setSelYear(1)
    setSelHour(now.getHours())
    setSelMinute(Math.floor(now.getMinutes() / 5))
  }

  const feedEmpty = type === 'feed' && !leftMin && !rightMin && !leftTimer.running && !rightTimer.running && !pumpedMl && !formulaMl

  function buildMetadata(): EventMeta {
    if (type === 'feed') {
      // If a timer is still running when saving, use its current elapsed value
      const lMin = leftTimer.running  ? leftTimer.getElapsedMinutes()  : (leftMin  ? Number(leftMin)  : null)
      const rMin = rightTimer.running ? rightTimer.getElapsedMinutes() : (rightMin ? Number(rightMin) : null)
      return {
        breast_left_min:  lMin,
        breast_right_min: rMin,
        pumped_ml:  pumpedMl  ? Number(pumpedMl)  : null,
        formula_ml: formulaMl ? Number(formulaMl) : null,
      }
    }
    if (type === 'output') return { diaper_type: diaperType, location: outputLocation }
    return null
  }

  function handleSave() {
    const year    = Number(years[selYear])
    const month   = String(selMonth + 1).padStart(2, '0')
    const day     = String(selDay + 1).padStart(2, '0')
    const hour    = String(selHour).padStart(2, '0')
    const minute  = String(selMinute * 5).padStart(2, '0')
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
            <WheelPicker values={years}  selectedIndex={selYear}   onChange={setSelYear}   width={64} />

            {/* Spacer between date and time */}
            <div className="w-4" />

            {/* Time group */}
            <WheelPicker values={HOURS}   selectedIndex={selHour}   onChange={setSelHour}   width={44} cyclic />
            <div className="text-xl font-semibold text-muted-foreground">:</div>
            <WheelPicker values={MINUTES} selectedIndex={selMinute} onChange={setSelMinute} width={44} cyclic />

            {/* Now reset */}
            <button
              type="button"
              onClick={resetToNow}
              className="ml-2 px-3 py-2 text-sm rounded-md bg-card border border-input text-foreground font-medium shadow-sm active:brightness-95"
            >
              Now
            </button>
          </div>

          {/* Date/time warning */}
          {(() => {
            const selected = new Date(
              Number(years[selYear]),
              selMonth,
              selDay + 1,
              selHour,
              selMinute * 5,
            )
            const diffMs = selected.getTime() - nowMs
            if (diffMs > 0) {
              return (
                <p className="text-sm text-amber-500">
                  Selected time is in the future, is it correct?
                </p>
              )
            }
            if (!initialEvent && diffMs < -3 * 60 * 60 * 1000) {
              return (
                <p className="text-sm text-amber-500">
                  Selected time is more than 3 hours ago, is it correct?
                </p>
              )
            }
            return null
          })()}

          {/* Sleep/Wake toggle — create mode only */}
          {(type === 'sleep_start' || type === 'sleep_end') && !initialEvent && (
            <SegmentedControl
              options={['sleep_start', 'sleep_end'] as const}
              value={type}
              onChange={onTypeChange ?? (() => {})}
              labels={{
                sleep_start: <span className="flex items-center justify-center gap-1.5"><Moon className="w-3.5 h-3.5" />Sleep</span>,
                sleep_end:   <span className="flex items-center justify-center gap-1.5"><Sun  className="w-3.5 h-3.5" />Wake</span>,
              }}
            />
          )}

          {/* Feed-specific */}
          {type === 'feed' && (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Breast</label>
                <BreastFeedForm
                  leftMin={leftMin}          setLeftMin={setLeftMin}
                  rightMin={rightMin}        setRightMin={setRightMin}
                  leftRunning={leftTimer.running}   rightRunning={rightTimer.running}
                  leftElapsedMs={leftTimer.elapsedMs} rightElapsedMs={rightTimer.elapsedMs}
                  onToggleLeft={leftTimer.toggle}   onToggleRight={rightTimer.toggle}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="pumped-ml" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Pumped (ml)</label>
                <input
                  id="pumped-ml"
                  type="number"
                  min="0"
                  placeholder="—"
                  value={pumpedMl}
                  onChange={(e) => setPumpedMl(e.target.value)}
                  className="w-full h-11 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="formula-ml" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Formula (ml)</label>
                <input
                  id="formula-ml"
                  type="number"
                  min="0"
                  placeholder="—"
                  value={formulaMl}
                  onChange={(e) => setFormulaMl(e.target.value)}
                  className="w-full h-11 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </>
          )}

          {/* Output-specific */}
          {type === 'output' && (
            <OutputForm
              outputLocation={outputLocation} setOutputLocation={setOutputLocation}
              diaperType={diaperType}         setDiaperType={setDiaperType}
            />
          )}

        </div>

        <DrawerFooter className="pt-2" data-vaul-no-drag>
          {onDelete ? (
            <div className="flex gap-2">
              <button
                onClick={onDelete}
                className="flex-1 h-11 rounded-md border border-input bg-card text-foreground font-medium text-sm flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4 text-destructive" />
                Delete
              </button>
              <button
                onClick={handleSave}
                disabled={feedEmpty}
                className="flex-1 h-11 rounded-md bg-primary text-primary-foreground font-medium text-sm disabled:opacity-40"
              >
                Save
              </button>
            </div>
          ) : (
            <button
              onClick={handleSave}
              disabled={feedEmpty}
              className="w-full h-11 rounded-md bg-primary text-primary-foreground font-medium text-sm disabled:opacity-40"
            >
              Save
            </button>
          )}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
