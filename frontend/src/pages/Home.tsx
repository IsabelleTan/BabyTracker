import { useState, useEffect } from 'react'
import EventSheet from '@/components/home/EventSheet'
import StatusSection from '@/components/home/StatusSection'
import SummarySection from '@/components/home/SummarySection'
import TimelineSection from '@/components/home/TimelineSection'
import { logEvent, getTodayEvents, getLastFeeds, type EventType, type BabyEvent } from '@/lib/events'

function currentSleepState(events: BabyEvent[]): 'sleeping' | 'awake' {
  const last = [...events]
    .filter((e) => e.type === 'sleep_start' || e.type === 'sleep_end')
    .at(-1)
  return last?.type === 'sleep_start' ? 'sleeping' : 'awake'
}

export default function Home() {
  const [events, setEvents] = useState<BabyEvent[]>([])
  const [lastFeeds, setLastFeeds] = useState<BabyEvent[]>([])
  const [sheetType, setSheetType] = useState<EventType | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([getTodayEvents(), getLastFeeds(3)])
      .then(([today, feeds]) => {
        setEvents(today)
        setLastFeeds(feeds)
      })
      .finally(() => setLoading(false))
  }, [])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  async function handleSheetSave(timestamp: string, metadata: Record<string, unknown> | null) {
    if (!sheetType) return
    const id = crypto.randomUUID()
    setSheetType(null)
    try {
      const event = await logEvent({ id, type: sheetType, timestamp, metadata })
      setEvents((prev) => [...prev, event].sort((a, b) => a.timestamp.localeCompare(b.timestamp)))
      if (event.type === 'feed') {
        setLastFeeds((prev) => [...prev, event].slice(-3))
      }
      showToast('Logged ✓')
    } catch {
      showToast('Failed to save — try again')
    }
  }

  function handleSheetDismiss() {
    setSheetType(null)
  }

  function handleDeleted(id: string) {
    setEvents((prev) => prev.filter((e) => e.id !== id))
    setLastFeeds((prev) => prev.filter((e) => e.id !== id))
  }

  const isSleeping = currentSleepState(events) === 'sleeping'

  return (
    <div className="flex flex-col min-h-[calc(100svh-4rem)] p-4 gap-6">

      {!loading && (
        <StatusSection todayEvents={events} lastFeeds={lastFeeds} />
      )}

      {/* Quick actions */}
      <div className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">
          Log event
        </h2>
        <div className="grid grid-cols-3 gap-3">
          <ActionButton emoji="🍼" label="Feed" onClick={() => setSheetType('feed')} />
          <ActionButton
            emoji={isSleeping ? '☀️' : '🌙'}
            label={isSleeping ? 'Wake' : 'Sleep'}
            onClick={() => setSheetType(isSleeping ? 'sleep_end' : 'sleep_start')}
          />
          <ActionButton emoji="💧" label="Diaper" onClick={() => setSheetType('diaper')} />
        </div>
      </div>

      {!loading && (
        <SummarySection events={events} />
      )}

      {!loading && (
        <TimelineSection events={events} onDeleted={handleDeleted} />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-foreground text-background text-sm font-medium px-4 py-2 rounded-full shadow-lg">
          {toast}
        </div>
      )}

      <EventSheet type={sheetType} onSave={handleSheetSave} onDismiss={handleSheetDismiss} />
    </div>
  )
}

function ActionButton({ emoji, label, onClick }: { emoji: string; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-2 h-24 rounded-xl border border-border bg-background active:bg-muted transition-colors text-sm font-medium"
    >
      <span className="text-3xl">{emoji}</span>
      <span>{label}</span>
    </button>
  )
}
