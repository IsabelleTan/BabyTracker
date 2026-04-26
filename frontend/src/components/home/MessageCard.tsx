import { type LucideIcon } from 'lucide-react'

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
