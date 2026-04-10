import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Sun, Moon } from 'lucide-react'
import BottomNav from '@/components/BottomNav'
import RequireAuth from '@/components/RequireAuth'
import Login from '@/pages/Login'
import Home from '@/pages/Home'
import { useNightMode } from '@/hooks/useNightMode'

const Stats = lazy(() => import('@/pages/Stats'))
const Leaderboards = lazy(() => import('@/pages/Leaderboards'))

function AppLayout({ night, toggle }: { night: boolean; toggle: () => void }) {
  return (
    <div className="w-full flex flex-col min-h-svh max-w-lg mx-auto">
      <div className="flex justify-end px-4 pt-3">
        <button
          onClick={toggle}
          aria-label={night ? 'Switch to day mode' : 'Switch to night mode'}
          className="p-1.5 rounded-full text-muted-foreground hover:text-foreground transition-colors"
        >
          {night ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>
      </div>
      <main className="flex-1 pb-16 px-4">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/stats" element={<Suspense fallback={null}><Stats /></Suspense>} />
          <Route path="/leaderboards" element={<Suspense fallback={null}><Leaderboards /></Suspense>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <BottomNav />
    </div>
  )
}

export default function App() {
  const { night, toggle } = useNightMode()

  useEffect(() => {
    document.documentElement.classList.toggle('night', night)
  }, [night])

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <RequireAuth>
            <AppLayout night={night} toggle={toggle} />
          </RequireAuth>
        }
      />
    </Routes>
  )
}
