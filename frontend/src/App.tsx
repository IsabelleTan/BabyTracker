import { Routes, Route, Navigate } from 'react-router-dom'
import BottomNav from '@/components/BottomNav'
import RequireAuth from '@/components/RequireAuth'
import Login from '@/pages/Login'
import Home from '@/pages/Home'
import Stats from '@/pages/Stats'
import Leaderboards from '@/pages/Leaderboards'

function AppLayout() {
  return (
    <div className="flex flex-col min-h-svh max-w-lg mx-auto">
      <main className="flex-1 pb-16">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/leaderboards" element={<Leaderboards />} />
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
