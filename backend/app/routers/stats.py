from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.db.database import get_db
from app.models.event import Event
from app.models.user import User

router = APIRouter(prefix="/stats", tags=["stats"])


class DailyStat(BaseModel):
    date: str  # YYYY-MM-DD UTC
    feed_count: int
    avg_feed_interval_min: float | None
    total_sleep_min: int
    sleep_session_count: int
    avg_sleep_session_min: float | None
    avg_wake_min: float | None
    diaper_count: int


class StatsRange(BaseModel):
    earliest: datetime | None


@router.get("/range", response_model=StatsRange)
async def get_stats_range(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(func.min(Event.timestamp)))
    earliest = result.scalar()
    if earliest and earliest.tzinfo is None:
        earliest = earliest.replace(tzinfo=timezone.utc)
    return StatsRange(earliest=earliest)


def _utc(ts: datetime) -> datetime:
    return ts if ts.tzinfo else ts.replace(tzinfo=timezone.utc)


@router.get("/daily", response_model=list[DailyStat])
async def get_daily_stats(
    from_: datetime = Query(alias="from"),
    to: datetime = Query(),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Fetch one extra day before/after to catch cross-day sleep sessions
    result = await db.execute(
        select(Event)
        .where(
            Event.timestamp >= _utc(from_) - timedelta(days=1),
            Event.timestamp < _utc(to) + timedelta(days=1),
        )
        .order_by(Event.timestamp)
    )
    events = result.scalars().all()

    feeds_by_day: dict[str, list[datetime]] = defaultdict(list)
    diapers_by_day: dict[str, list[datetime]] = defaultdict(list)
    sleep_events: list[tuple[str, datetime]] = []

    for e in events:
        ts = _utc(e.timestamp)
        day = ts.date().isoformat()
        if e.type == "feed":
            feeds_by_day[day].append(ts)
        elif e.type == "diaper":
            diapers_by_day[day].append(ts)
        elif e.type in ("sleep_start", "sleep_end"):
            sleep_events.append((e.type, ts))

    # Pair sleep_start/sleep_end into completed sessions
    sleep_sessions: list[tuple[datetime, datetime]] = []
    open_start: datetime | None = None
    for etype, ts in sleep_events:
        if etype == "sleep_start":
            open_start = ts
        elif etype == "sleep_end" and open_start is not None:
            sleep_sessions.append((open_start, ts))
            open_start = None

    # Group sessions by the day they started (only within requested range)
    from_utc = _utc(from_)
    to_utc = _utc(to)
    sleep_by_day: dict[str, list[tuple[datetime, datetime]]] = defaultdict(list)
    for start, end in sleep_sessions:
        if from_utc <= start < to_utc + timedelta(days=1):
            sleep_by_day[start.date().isoformat()].append((start, end))

    # Wake periods = gap between consecutive sessions
    wake_by_day: dict[str, list[float]] = defaultdict(list)
    for i in range(1, len(sleep_sessions)):
        prev_end = sleep_sessions[i - 1][1]
        curr_start = sleep_sessions[i][0]
        wake_min = (curr_start - prev_end).total_seconds() / 60
        if wake_min >= 0:
            wake_by_day[curr_start.date().isoformat()].append(wake_min)

    results: list[DailyStat] = []
    current = from_utc.date()
    end_date = to_utc.date()
    while current <= end_date:
        day = current.isoformat()

        feed_times = feeds_by_day.get(day, [])
        avg_feed_interval: float | None = None
        if len(feed_times) >= 2:
            intervals = [
                (feed_times[i] - feed_times[i - 1]).total_seconds() / 60
                for i in range(1, len(feed_times))
            ]
            avg_feed_interval = round(sum(intervals) / len(intervals), 1)

        sessions = sleep_by_day.get(day, [])
        total_sleep = sum((e - s).total_seconds() / 60 for s, e in sessions)
        avg_sleep: float | None = round(total_sleep / len(sessions), 1) if sessions else None

        wakes = wake_by_day.get(day, [])
        avg_wake: float | None = round(sum(wakes) / len(wakes), 1) if wakes else None

        results.append(
            DailyStat(
                date=day,
                feed_count=len(feed_times),
                avg_feed_interval_min=avg_feed_interval,
                total_sleep_min=round(total_sleep),
                sleep_session_count=len(sessions),
                avg_sleep_session_min=avg_sleep,
                avg_wake_min=avg_wake,
                diaper_count=len(diapers_by_day.get(day, [])),
            )
        )
        current += timedelta(days=1)

    return results
