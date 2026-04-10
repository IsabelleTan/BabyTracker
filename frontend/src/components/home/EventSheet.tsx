import { useState, useEffect } from 'react'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from '@/components/ui/drawer'
import { toDateTimeLocal, fromDateTimeLocal, type EventType } from '@/lib/events'

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

export default function EventSheet({ type, onSave, onDismiss }: EventSheetProps) {
  const [timestamp, setTimestamp] = useState('')
  const [feedType, setFeedType] = useState<'breast' | 'bottle'>('breast')
  const [leftMin, setLeftMin] = useState('')
  const [rightMin, setRightMin] = useState('')
  const [amountMl, setAmountMl] = useState('')
  const [diaperType, setDiaperType] = useState<'wet' | 'dirty' | 'both'>('wet')

  useEffect(() => {
    if (type) {
      setTimestamp(toDateTimeLocal(new Date()))
      setFeedType('breast')
      setLeftMin('')
      setRightMin('')
      setAmountMl('')
      setDiaperType('wet')
    }
  }, [type])

  function buildMetadata(): Record<string, unknown> | null {
    if (type === 'feed') {
      if (feedType === 'breast') {
        return {
          feed_type: 'breast',
          left_duration_min: leftMin ? Number(leftMin) : null,
          right_duration_min: rightMin ? Number(rightMin) : null,
        }
      }
      return { feed_type: 'bottle', amount_ml: amountMl ? Number(amountMl) : null }
    }
    if (type === 'diaper') return { diaper_type: diaperType }
    return null
  }

  const [dbgEvent, setDbgEvent] = useState<string>('idle')

  function handleSave() {
    setDbgEvent('click')
    try {
      const utc = fromDateTimeLocal(timestamp)
      setDbgEvent(`ok:${utc.slice(11, 16)}`)
      onSave(utc, buildMetadata())
    } catch (e) {
      setDbgEvent(`ERR:${String(e).slice(0, 40)}`)
    }
  }

  return (
    <Drawer open={type !== null} onClose={onDismiss}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{type ? TITLES[type] : ''}</DrawerTitle>
        </DrawerHeader>

        <div className="px-4 pb-2 space-y-5">
          {/* Timestamp */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Time</label>
            <input
              type="datetime-local"
              value={timestamp}
              onChange={(e) => setTimestamp(e.target.value)}
              className="w-full h-11 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Feed-specific */}
          {type === 'feed' && (
            <>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['breast', 'bottle'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setFeedType(t)}
                      className={`h-11 rounded-md border text-sm font-medium capitalize transition-colors ${
                        feedType === t
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'border-input bg-background'
                      }`}
                    >
                      {t === 'breast' ? '🤱 Breast' : '🍼 Bottle'}
                    </button>
                  ))}
                </div>
              </div>

              {feedType === 'breast' ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Left (min)</label>
                    <input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={leftMin}
                      onChange={(e) => setLeftMin(e.target.value)}
                      className="w-full h-11 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Right (min)</label>
                    <input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={rightMin}
                      onChange={(e) => setRightMin(e.target.value)}
                      className="w-full h-11 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Amount (ml)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
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
              <label className="text-sm font-medium">Type</label>
              <div className="grid grid-cols-3 gap-2">
                {(['wet', 'dirty', 'both'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setDiaperType(t)}
                    className={`h-11 rounded-md border text-sm font-medium capitalize transition-colors ${
                      diaperType === t
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-input bg-background'
                    }`}
                  >
                    {t === 'wet' ? '💧 Wet' : t === 'dirty' ? '💩 Dirty' : '🔄 Both'}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <DrawerFooter className="pt-2" data-vaul-no-drag>
          <div className="text-xs text-center text-muted-foreground mb-1">ts: "{timestamp}"</div>
          <button
            onTouchStart={() => setDbgEvent('touchstart')}
            onTouchEnd={() => setDbgEvent('touchend')}
            onPointerDown={() => setDbgEvent('pointerdown')}
            onPointerUp={() => setDbgEvent('pointerup')}
            onClick={handleSave}
            className={`w-full h-12 rounded-md font-medium text-sm text-white ${
              dbgEvent === 'idle' ? 'bg-red-500' :
              dbgEvent === 'touchstart' ? 'bg-orange-500' :
              dbgEvent === 'touchend' ? 'bg-yellow-500' :
              dbgEvent === 'pointerdown' ? 'bg-blue-500' :
              dbgEvent === 'pointerup' ? 'bg-purple-500' :
              dbgEvent.startsWith('ERR') ? 'bg-red-800' :
              'bg-green-500'
            }`}
          >
            Save [{dbgEvent}]
          </button>
          <button
            onClick={onDismiss}
            className="w-full h-11 rounded-md border border-input text-sm font-medium"
          >
            Dismiss
          </button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
