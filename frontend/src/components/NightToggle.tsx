import { Sun, Moon } from 'lucide-react'
import { useNightModeCtx } from '@/contexts/NightModeContext'

export default function NightToggle() {
  const { night, toggle } = useNightModeCtx()
  return (
    <button
      onClick={toggle}
      aria-label={night ? 'Switch to day mode' : 'Switch to night mode'}
      className="flex items-center rounded-full border border-primary/25 bg-muted/50 p-0.5 gap-0.5"
    >
      <span className={`flex items-center justify-center w-6 h-6 rounded-full ${!night ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}>
        <Sun className="w-3.5 h-3.5" />
      </span>
      <span className={`flex items-center justify-center w-6 h-6 rounded-full ${night ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}>
        <Moon className="w-3.5 h-3.5" />
      </span>
    </button>
  )
}
