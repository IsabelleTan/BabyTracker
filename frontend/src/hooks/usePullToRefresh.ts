import { useState, useRef } from 'react'

const PULL_THRESHOLD = 72

export function usePullToRefresh({
  onRefresh,
  disabled = false,
  isRefreshing = false,
}: {
  onRefresh: () => Promise<void>
  disabled?: boolean
  isRefreshing?: boolean
}) {
  const touchStartY = useRef<number | null>(null)
  const [pullDistance, setPullDistance] = useState(0)
  const [pullRefreshing, setPullRefreshing] = useState(false)

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
      await onRefresh()
      setPullRefreshing(false)
    } else {
      setPullDistance(0)
    }
  }

  return {
    pulling: pullDistance > 0,
    pullDistance,
    pullRefreshing,
    PULL_THRESHOLD,
    handlers: { onTouchStart, onTouchMove, onTouchEnd },
  }
}
