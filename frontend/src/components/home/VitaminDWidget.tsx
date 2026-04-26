import { useMemo } from 'react'
import { Pill } from 'lucide-react'
import { type BabyEvent, type LogEventPayload, currentDayStart } from '@/lib/events'
import { formatTime } from '@/lib/time'
import { generateId } from '@/lib/uuid'

interface Props {
  events: BabyEvent[]
  onLog: (payload: LogEventPayload) => Promise<void>
}

export default function VitaminDWidget({ events, onLog }: Props) {
  const todayStart = useMemo(() => currentDayStart(), [])

  const givenEvent = useMemo(
    () => events.find(e => e.type === 'vitamin_d' && new Date(e.timestamp) >= todayStart) ?? null,
    [events, todayStart],
  )

  function handleMark() {
    onLog({ id: generateId(), type: 'vitamin_d', timestamp: new Date().toISOString(), metadata: null })
  }

  return (
    <div className="flex items-center justify-between px-1">
      <div className="flex items-center gap-1.5">
        <Pill className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Vitamin D</span>
      </div>
      {givenEvent ? (
        <span className="text-xs text-muted-foreground">
          Given {formatTime(new Date(givenEvent.timestamp))} by {givenEvent.display_name}
        </span>
      ) : (
        <button className="text-xs text-primary font-medium active:opacity-60" onClick={handleMark}>
          Mark as given
        </button>
      )}
    </div>
  )
}
