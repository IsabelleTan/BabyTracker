import { Routes, Route } from 'react-router-dom'
import BottomNav from '@/components/BottomNav'
import Home from '@/pages/Home'
import Stats from '@/pages/Stats'
import Leaderboards from '@/pages/Leaderboards'

export default function App() {
  return (
    <div className="flex flex-col min-h-svh max-w-lg mx-auto">
      <main className="flex-1 pb-16">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/leaderboards" element={<Leaderboards />} />
        </Routes>
      </main>
      <BottomNav />
    </div>
  )
}
