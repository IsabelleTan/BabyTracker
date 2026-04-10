import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import BottomNav from '@/components/BottomNav'
import RequireAuth from '@/components/RequireAuth'
import Login from '@/pages/Login'
import Home from '@/pages/Home'

const Stats = lazy(() => import('@/pages/Stats'))
const Leaderboards = lazy(() => import('@/pages/Leaderboards'))

function AppLayout() {
  return (
    <div className="flex flex-col min-h-svh max-w-lg mx-auto">
      <main className="flex-1 pb-16">
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
