import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import BottomNav from '@/components/BottomNav'
import RequireAuth from '@/components/RequireAuth'
import Login from '@/pages/Login'
import Home from '@/pages/Home'
import { useNightMode } from '@/hooks/useNightMode'

const Stats = lazy(() => import('@/pages/Stats'))
const Leaderboards = lazy(() => import('@/pages/Leaderboards'))

function AppLayout() {
  return (
    <div className="w-full flex flex-col min-h-svh max-w-lg mx-auto">
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
  const night = useNightMode()

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
            <AppLayout />
          </RequireAuth>
        }
      />
    </Routes>
  )
}
