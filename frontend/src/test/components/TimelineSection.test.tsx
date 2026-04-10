import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import TimelineSection from '@/components/home/TimelineSection'
import * as eventsLib from '@/lib/events'

// Intercept any direct calls to deleteEvent from inside TimelineSection.
// The fix for the double-delete bug moved deletion entirely into the onDeleted
// callback; this mock lets us assert it's never called by the component itself.
vi.mock('@/lib/events', () => ({
  deleteEvent: vi.fn(),
}))

const FEED_EVENT: eventsLib.BabyEvent = {
  id: 'evt-001',
  type: 'feed',
  timestamp: new Date().toISOString(),
  logged_by: 'user-1',
  display_name: 'Parent 1',
  metadata: null,
}

describe('TimelineSection — delete flow', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls onDeleted with the event id when delete is confirmed', async () => {
    const onDeleted = vi.fn().mockResolvedValue(undefined)
    const { container } = render(
      <TimelineSection events={[FEED_EVENT]} onDeleted={onDeleted} />,
    )

    // Simulate a left-swipe gesture on the row's sliding content div
    const rowContent = container.querySelector('.bg-surface.flex')!
    fireEvent.touchStart(rowContent, { touches: [{ clientX: 300 }] })
    fireEvent.touchMove(rowContent, { touches: [{ clientX: 200 }] }) // 100 px > 80 threshold
    fireEvent.touchEnd(rowContent)

    // Tap the revealed delete background to open the confirm dialog
    const trashBg = container.querySelector('.bg-destructive')!
    fireEvent.click(trashBg)

    // Confirm deletion
    const deleteBtn = await screen.findByRole('button', { name: 'Delete' })
    fireEvent.click(deleteBtn)

    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith('evt-001'))
  })

  it('does not call deleteEvent directly (regression: double-delete bug)', async () => {
    const onDeleted = vi.fn().mockResolvedValue(undefined)
    const { container } = render(
      <TimelineSection events={[FEED_EVENT]} onDeleted={onDeleted} />,
    )

    const rowContent = container.querySelector('.bg-surface.flex')!
    fireEvent.touchStart(rowContent, { touches: [{ clientX: 300 }] })
    fireEvent.touchMove(rowContent, { touches: [{ clientX: 200 }] })
    fireEvent.touchEnd(rowContent)
    fireEvent.click(container.querySelector('.bg-destructive')!)

    const deleteBtn = await screen.findByRole('button', { name: 'Delete' })
    fireEvent.click(deleteBtn)

    await waitFor(() => expect(onDeleted).toHaveBeenCalledOnce())
    // deleteEvent must never be called by the component itself —
    // all deletion goes through onDeleted
    expect(eventsLib.deleteEvent).not.toHaveBeenCalled()
  })
})
