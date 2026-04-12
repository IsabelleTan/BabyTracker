import { useState, useRef } from 'react'
import { Milk, Moon, Sun, Droplets, Trash2, type LucideIcon } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { type BabyEvent } from '@/lib/events'

const EVENT_LABELS: Record<string, string> = {
  feed: 'Feed',
  sleep_start: 'Fell asleep',
  sleep_end: 'Woke up',
  diaper: 'Diaper',
}

const EVENT_ICON: Record<string, LucideIcon> = {
  feed: Milk,
  sleep_start: Moon,
  sleep_end: Sun,
  diaper: Droplets,
}

const SWIPE_THRESHOLD = 80

interface Props {
  events: BabyEvent[]
  onDeleted: (id: string) => Promise<void>
}

export default function TimelineSection({ events, onDeleted }: Props) {
  const [pendingDelete, setPendingDelete] = useState<BabyEvent | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Most recent first
  const sorted = [...events].sort((a, b) => b.timestamp.localeCompare(a.timestamp))

  async function confirmDelete() {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      await onDeleted(pendingDelete.id)
    } finally {
      setDeleting(false)
      setPendingDelete(null)
    }
  }

  return (
    <>
      <div className="flex flex-col gap-1">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">
          Last 24 hours
        </h2>
        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No events in the last 24 hours</p>
        ) : (
          <div className="rounded-xl border border-primary/35 overflow-hidden">
            {sorted.map((event, i) => (
              <TimelineRow
                key={event.id}
                event={event}
                isLast={i === sorted.length - 1}
                onSwipeDelete={() => setPendingDelete(event)}
              />
            ))}
          </div>
        )}
      </div>

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete event?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete &&
                `${EVENT_LABELS[pendingDelete.type]} at ${formatTime(new Date(pendingDelete.timestamp))} logged by ${pendingDelete.display_name}`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function TimelineRow({
  event,
  isLast,
  onSwipeDelete,
}: {
  event: BabyEvent
  isLast: boolean
  onSwipeDelete: () => void
}) {
  const startXRef = useRef<number | null>(null)
  const [offsetX, setOffsetX] = useState(0)
  const [snapped, setSnapped] = useState(false)

  function onTouchStart(e: React.TouchEvent) {
    startXRef.current = e.touches[0].clientX
    setSnapped(false)
  }

  function onTouchMove(e: React.TouchEvent) {
    if (startXRef.current === null) return
    const delta = startXRef.current - e.touches[0].clientX
    if (delta > 0) setOffsetX(Math.min(delta, SWIPE_THRESHOLD + 20))
  }

  function onTouchEnd() {
    startXRef.current = null
    if (offsetX >= SWIPE_THRESHOLD) {
      setSnapped(true)
      setOffsetX(SWIPE_THRESHOLD)
    } else {
      setOffsetX(0)
    }
  }

  function onTapDelete() {
    setOffsetX(0)
    setSnapped(false)
    onSwipeDelete()
  }

  const label = EVENT_LABELS[event.type] ?? event.type
  const Icon = EVENT_ICON[event.type] ?? Milk
  const subtext = buildSubtext(event)

  return (
    <div className={`relative overflow-hidden bg-surface ${!isLast ? 'border-b border-primary/20' : ''}`}>
      {/* Delete background */}
      <div
        className="absolute right-0 top-0 bottom-0 flex items-center justify-end bg-destructive px-5"
        style={{ width: SWIPE_THRESHOLD }}
        onClick={snapped ? onTapDelete : undefined}
      >
        <Trash2 className="w-5 h-5 text-white" />
      </div>

      {/* Row content */}
      <div
        className="relative bg-surface flex items-center gap-3 px-4 py-3 transition-transform"
        style={{
          transform: `translateX(-${offsetX}px)`,
          transitionDuration: startXRef.current ? '0ms' : '200ms',
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <Icon className="w-5 h-5 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">{label}</div>
          {subtext && <div className="text-xs text-muted-foreground truncate">{subtext}</div>}
        </div>
        <div className="text-right shrink-0">
          <div className="text-sm">{formatTime(new Date(event.timestamp))}</div>
          <div className="text-xs text-muted-foreground">{event.display_name}</div>
        </div>
      </div>
    </div>
  )
}

function formatTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function buildSubtext(event: BabyEvent): string | null {
  const m = event.metadata
  if (!m) return null
  if (event.type === 'feed') {
    if (m.feed_type === 'bottle') return `Bottle · ${m.amount_ml ?? '?'} ml`
    if (m.feed_type === 'breast') {
      const parts: string[] = []
      if (m.left_duration_min) parts.push(`L ${m.left_duration_min}m`)
      if (m.right_duration_min) parts.push(`R ${m.right_duration_min}m`)
      return parts.length > 0 ? `Breast · ${parts.join(' ')}` : 'Breast'
    }
  }
  if (event.type === 'diaper') {
    const map: Record<string, string> = { wet: 'Wet', dirty: 'Dirty', both: 'Wet + Dirty' }
    return map[m.diaper_type as string] ?? null
  }
  return null
}
