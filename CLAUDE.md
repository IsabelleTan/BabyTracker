# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Backend (Python / Poetry)
```bash
cd backend
poetry install
poetry run uvicorn app.main:app --reload

# Tests
poetry run pytest                                                    # all tests
poetry run pytest tests/test_events.py -v                           # single file
poetry run pytest tests/test_events.py::test_create_event -v        # single test

# Migrations
poetry run alembic upgrade head
```

### Frontend (Node / npm)
```bash
cd frontend
npm install
npm run dev          # Vite dev server → http://localhost:5173
npm run build        # tsc -b + Vite build → dist/
npm run lint         # ESLint + TS checks
npm run test         # Vitest (watch)
npm run test -- --run             # single run
npm run test -- --run --coverage  # with coverage
```

### Deploy
Push a semver tag to trigger the GitHub Actions deploy pipeline (requires manual approval):
```bash
git tag 1.0.0 && git push origin 1.0.0
```

## Architecture

### Stack
- **Frontend**: React 19, TypeScript, Vite, React Router v7, Tailwind CSS v4, shadcn/ui, Axios, idb (IndexedDB), Workbox PWA
- **Backend**: FastAPI, SQLAlchemy 2 (async), SQLite + aiosqlite, Alembic, JWT + bcrypt, SlowAPI
- **Testing**: Vitest + @testing-library/react (frontend), pytest + pytest-asyncio (backend)

### Offline-First Sync Pattern
The central design: user actions are optimistic and queued locally, then synced to the server.

1. Logging an event immediately updates React state, writes to IndexedDB (`pending_events`), and renders optimistically.
2. If online, the POST fires immediately; if offline, the event stays queued.
3. `useSync()` runs an auto-flush loop every 30 s (also triggered on tab visibility change and network reconnect) that drains the queue and re-fetches authoritative server state.
4. The server is the source of truth after sync — local state is replaced, not merged.

Events use **client-generated UUIDs** and the backend uses `INSERT ... ON CONFLICT DO NOTHING`, making retries idempotent.

### Key Frontend Abstractions
- **`useSync()`** — owns events, pending queue, and the 30 s refresh loop
- **`useNightMode()`** — localStorage-backed; auto-activates 21:00–07:00, toggles a CSS class on `<html>`
- **`LeaderboardContext`** — lazy-loads leaderboard data with a 5-minute TTL cache, refreshes on visibility change
- Pages (`Stats`, `Leaderboards`) are `React.lazy`-loaded for code splitting

### Backend API Surface
| Prefix | Purpose |
|---|---|
| `/auth/` | Login, signup, JWT token |
| `/events/` | Create (POST), list (GET, filters: since/from/to/limit/type), delete |
| `/stats/` | Daily/weekly/monthly feed, sleep, diaper aggregates |
| `/leaderboards/` | Badges, streaks, milestone comparisons |
| `/health` | Liveness check |

Rate limits are configurable via env vars (defaults: `RATE_LIMIT_EVENTS=60/minute`, `RATE_LIMIT_READ=30/minute`, `RATE_LIMIT_AUTH=10/minute`). JWT tokens expire after 7 days; 401 triggers a client-side redirect to `/login`.

### Data Model
- **User** / **Baby** / **UserBaby** (join) / **Event**
- All queries are scoped: `current_user → UserBaby.baby_id → events` — no cross-family data leakage.
- `Event.metadata` is a JSON column for type-specific fields (feed volume, sleep duration, etc.).
- DB index on `(baby_id, timestamp)` for fast range queries.

### "Parenting day" convention
The logical day starts at **05:00 local time**, not midnight. Any feature that groups events by day must account for this boundary.
