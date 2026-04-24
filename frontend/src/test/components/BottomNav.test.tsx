import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import BottomNav from '@/components/BottomNav'

function renderNav(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <BottomNav />
    </MemoryRouter>,
  )
}

describe('BottomNav', () => {
  it('renders all three tabs', () => {
    renderNav()
    expect(screen.getByText('Home')).toBeInTheDocument()
    expect(screen.getByText('Stats')).toBeInTheDocument()
    expect(screen.getByText('Leaderboards')).toBeInTheDocument()
  })

  it('Home tab link points to /', () => {
    renderNav()
    expect(screen.getByText('Home').closest('a')).toHaveAttribute('href', '/')
  })

  it('Stats tab link points to /stats', () => {
    renderNav()
    expect(screen.getByText('Stats').closest('a')).toHaveAttribute('href', '/stats')
  })

  it('Leaderboards tab link points to /leaderboards', () => {
    renderNav()
    expect(screen.getByText('Leaderboards').closest('a')).toHaveAttribute('href', '/leaderboards')
  })

  it('Home tab is active on /', () => {
    renderNav('/')
    const homeLink = screen.getByText('Home').closest('a')!
    expect(homeLink.className).toContain('text-primary')
    expect(screen.getByText('Stats').closest('a')!.className).toContain('text-muted-foreground')
  })

  it('Stats tab is active on /stats', () => {
    renderNav('/stats')
    const statsLink = screen.getByText('Stats').closest('a')!
    expect(statsLink.className).toContain('text-primary')
    expect(screen.getByText('Home').closest('a')!.className).toContain('text-muted-foreground')
  })

  it('Leaderboards tab is active on /leaderboards', () => {
    renderNav('/leaderboards')
    const lb = screen.getByText('Leaderboards').closest('a')!
    expect(lb.className).toContain('text-primary')
    expect(screen.getByText('Home').closest('a')!.className).toContain('text-muted-foreground')
  })
})
