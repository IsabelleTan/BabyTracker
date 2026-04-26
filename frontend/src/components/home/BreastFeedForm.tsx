function formatTimer(ms: number): string {
  const totalSecs = Math.floor(ms / 1000)
  const mins = Math.floor(totalSecs / 60)
  const secs = totalSecs % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

export function BreastFeedForm({
  leftMin,
  setLeftMin,
  rightMin,
  setRightMin,
  leftRunning,
  rightRunning,
  leftElapsedMs,
  rightElapsedMs,
  onToggleLeft,
  onToggleRight,
}: {
  leftMin: string
  setLeftMin: (v: string) => void
  rightMin: string
  setRightMin: (v: string) => void
  leftRunning: boolean
  rightRunning: boolean
  leftElapsedMs: number
  rightElapsedMs: number
  onToggleLeft: () => void
  onToggleRight: () => void
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
            onClick={onToggleRight}
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
  )
}
