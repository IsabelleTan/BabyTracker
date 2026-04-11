import { NavLink } from 'react-router-dom'
import { Home, BarChart2, Trophy, HelpCircle, type LucideIcon } from 'lucide-react'

const tabs: { to: string; label: string; icon: LucideIcon }[] = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/stats', label: 'Stats', icon: BarChart2 },
  { to: '/leaderboards', label: 'Leaderboards', icon: Trophy },
  { to: '/help', label: 'Guide', icon: HelpCircle },
]

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 h-16 bg-background border-t border-foreground/20 flex items-center justify-around z-50">
      {tabs.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 flex-1 py-2 text-xs font-medium transition-colors ${
              isActive ? 'text-primary' : 'text-muted-foreground'
            }`
          }
        >
          <Icon className="w-6 h-6" />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
