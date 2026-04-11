# Baby Tracker

A mobile-first PWA for two parents to track their baby's feeds, sleep, and diapers.

[![CI](https://github.com/IsabelleTan/BabyTracker/actions/workflows/ci.yml/badge.svg)](https://github.com/IsabelleTan/BabyTracker/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/IsabelleTan/BabyTracker/branch/main/graph/badge.svg?token=T4UOKMWPJH&flag=backend)](https://codecov.io/gh/IsabelleTan/BabyTracker)

## Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite + TypeScript + Tailwind v4 + shadcn/ui |
| Backend | FastAPI + SQLAlchemy + Alembic |
| Database | SQLite |
| App type | PWA (mobile-first) |

## Project Structure

```
babytracker/
├── backend/        # FastAPI app
│   ├── app/
│   │   ├── db/     # Database connection
│   │   ├── models/ # SQLAlchemy models
│   │   ├── routers/# API route handlers
│   │   ├── schemas/# Pydantic schemas
│   │   └── main.py
│   └── alembic/    # DB migrations
└── frontend/       # React app
    └── src/
        ├── components/
        ├── pages/
        └── lib/
```

## Getting Started

**Backend**
```bash
cd backend
poetry install
poetry run uvicorn app.main:app --reload
```
API available at `http://localhost:8000` — Swagger docs at `http://localhost:8000/docs`.

**Frontend**
```bash
cd frontend
npm install
npm run dev
```
App available at `http://localhost:5173`.

## Features

- Ultra-fast event logging (feed, sleep, diaper) — 1–2 taps
- Shared between two parents with real-time-ish sync
- Daily dashboard with live status and timeline
- Historical stats and trend charts
- Fun leaderboards and parent comparison
- Night mode (auto-activates 9pm–7am)
- Offline support — logs locally and syncs when back online
- Installable as a PWA on iOS and Android
