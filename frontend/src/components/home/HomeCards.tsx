import { LogOut, type LucideIcon } from 'lucide-react'
import NightToggle from '@/components/NightToggle'
import { logout } from '@/lib/auth'
import { useTimeSince } from '@/hooks/useTimeSince'

interface Stat {
  label: string
  lines: string[]
}

export function ActionCard({
  icon: Icon,
  label,
  onClick,
  stats,
}: {
  icon: LucideIcon
  label: string
  onClick: () => void
  stats: (Stat | null)[]
}) {
  const visibleStats = stats.filter(Boolean) as Stat[]
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center rounded-xl bg-card shadow-sm active:brightness-95 active:shadow-none transition-all px-2 py-3 text-center w-full"
    >
      <div className="flex-1 w-full flex flex-col gap-2 pb-2">
        {visibleStats.map((s, i) => (
          <div key={i} className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground/60">
              {s.label}
            </span>
            {s.lines.map((line, j) => (
              <span
                key={j}
                className={j === 0
                  ? 'text-base leading-tight font-semibold'
                  : 'text-xs text-muted-foreground leading-tight'
                }
              >
                {line}
              </span>
            ))}
          </div>
        ))}
      </div>
      <div className={`w-full pt-2 flex flex-col items-center gap-1.5 ${visibleStats.length > 0 ? 'border-t border-primary/15' : ''}`}>
        <Icon className="w-8 h-8 text-primary" />
        <span className="text-sm font-medium">{label}</span>
      </div>
    </button>
  )
}

export function MessageCard({
  icon: Icon,
  message,
  onDismiss,
}: {
  icon: LucideIcon
  message: string
  onDismiss: () => void
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
      <Icon className="w-4 h-4 text-primary shrink-0 mt-0.5" />
      <p className="flex-1 text-sm text-foreground">{message}</p>
      <button
        onClick={onDismiss}
        className="text-muted-foreground hover:text-foreground text-xs shrink-0 leading-none pt-0.5"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  )
}

export function TopBar({
  pendingCount,
  lastSynced,
  isRefreshing,
}: {
  pendingCount: number
  lastSynced: Date | null
  isRefreshing: boolean
}) {
  const ago = useTimeSince(lastSynced)

  let syncText: { text: string; className: string } | null = null
  if (isRefreshing) syncText = { text: 'Syncing…', className: 'text-muted-foreground' }
  else if (pendingCount > 0) syncText = { text: `${pendingCount} pending — will sync when online`, className: 'text-amber-500' }
  else if (lastSynced) syncText = { text: `Synced ${ago}`, className: 'text-muted-foreground' }

  return (
    <div className="flex items-center justify-between -mb-2">
      <span className={`text-xs ${syncText?.className ?? ''}`}>
        {syncText?.text ?? ''}
        {lastSynced && <span className="text-muted-foreground/40 ml-1">{__APP_VERSION__}</span>}
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => { logout(); window.location.reload() }}
          aria-label="Log out"
          className="text-muted-foreground hover:text-foreground"
        >
          <LogOut className="w-4 h-4" />
        </button>
        <NightToggle />
      </div>
    </div>
  )
}
