import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import RequireAuth from '@/components/RequireAuth'

beforeEach(() => {
  localStorage.clear()
})

function renderWithRouter(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/login" element={<div>Login page</div>} />
        <Route
          path="/*"
          element={
            <RequireAuth>
              <div>Protected content</div>
            </RequireAuth>
          }
        />
      </Routes>
    </MemoryRouter>
  )
}

describe('RequireAuth', () => {
  it('redirects to /login when not authenticated', () => {
    renderWithRouter('/')
    expect(screen.getByText('Login page')).toBeInTheDocument()
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument()
  })

  it('renders children when authenticated', () => {
    const futureExp = Math.floor(Date.now() / 1000) + 3600
    const jwt = `header.${btoa(JSON.stringify({ exp: futureExp }))}.sig`
    localStorage.setItem('token', jwt)
    renderWithRouter('/')
    expect(screen.getByText('Protected content')).toBeInTheDocument()
    expect(screen.queryByText('Login page')).not.toBeInTheDocument()
  })

  it('redirects to /login when token is expired', () => {
    const pastExp = Math.floor(Date.now() / 1000) - 1
    const jwt = `header.${btoa(JSON.stringify({ exp: pastExp }))}.sig`
    localStorage.setItem('token', jwt)
    renderWithRouter('/')
    expect(screen.getByText('Login page')).toBeInTheDocument()
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument()
  })

  it('redirects to /login when token payload is corrupted JSON', () => {
    localStorage.setItem('token', 'header.!!!notbase64!!!.sig')
    renderWithRouter('/')
    expect(screen.getByText('Login page')).toBeInTheDocument()
  })
})
