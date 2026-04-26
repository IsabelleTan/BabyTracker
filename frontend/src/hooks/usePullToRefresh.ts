import { useState, useRef } from 'react'
import type React from 'react'

export const PULL_THRESHOLD = 72

export function usePullToRefresh({
  isRefreshing,
  sync,
  disabled,
}: {
  isRefreshing: boolean
  sync: () => Promise<void>
  disabled?: boolean
}) {
  const touchStartY = useRef<number | null>(null)
  const [pullDistance, setPullDistance] = useState(0)
  const [pullRefreshing, setPullRefreshing] = useState(false)
  const pulling = pullDistance > 0

  function onTouchStart(e: React.TouchEvent) {
    if (disabled) return
    if (window.scrollY === 0) touchStartY.current = e.touches[0].clientY
  }

  function onTouchMove(e: React.TouchEvent) {
    if (touchStartY.current === null || isRefreshing) return
    const delta = e.touches[0].clientY - touchStartY.current
    if (delta > 0) setPullDistance(Math.min(delta, PULL_THRESHOLD + 24))
  }

  async function onTouchEnd() {
    touchStartY.current = null
    if (pullDistance >= PULL_THRESHOLD) {
      setPullDistance(0)
      setPullRefreshing(true)
      await sync()
      setPullRefreshing(false)
    } else {
      setPullDistance(0)
    }
  }

  return { onTouchStart, onTouchMove, onTouchEnd, pullDistance, pullRefreshing, pulling }
}
