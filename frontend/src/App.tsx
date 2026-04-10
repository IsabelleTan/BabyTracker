import { lazy, Suspense, useEffect, createContext, useContext } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import BottomNav from '@/components/BottomNav'
import RequireAuth from '@/components/RequireAuth'
import Login from '@/pages/Login'
import Home from '@/pages/Home'
import { useNightMode } from '@/hooks/useNightMode'

const Stats = lazy(() => import('@/pages/Stats'))
const Leaderboards = lazy(() => import('@/pages/Leaderboards'))

interface NightModeCtx { night: boolean; toggle: () => void }
const NightModeContext = createContext<NightModeCtx>({ night: false, toggle: () => {} })
export const useNightModeCtx = () => useContext(NightModeContext)

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
  const { night, toggle } = useNightMode()

  useEffect(() => {
    document.documentElement.classList.toggle('night', night)
  }, [night])

  return (
    <NightModeContext.Provider value={{ night, toggle }}>
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
    </NightModeContext.Provider>
  )
}
