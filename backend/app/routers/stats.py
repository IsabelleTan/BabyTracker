from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.db.database import get_db
from app.db.queries import baby_ids_for_user
from app.config import settings
from app.limiter import limiter
from app.models.event import Event
from app.models.user import User
from app.utils import _utc, local_date, output_dirty, output_at_potty, output_wet, pair_sleep_sessions, safe_zone

router = APIRouter(prefix="/stats", tags=["stats"])


class DailyStat(BaseModel):
    date: date
    feed_count: int
    avg_feed_interval_min: float | None
    total_sleep_min: int
    sleep_session_count: int
    avg_sleep_session_min: float | None
    avg_wake_min: float | None
    output_count: int
    wet_count: int
    dirty_count: int
    potty_wet_count: int
    potty_dirty_count: int
    breast_min: float
    pumped_ml: float
    formula_ml: float


class StatsRange(BaseModel):
    earliest: datetime | None



@router.get("/range", response_model=StatsRange)
async def get_stats_range(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    baby_ids = baby_ids_for_user(current_user.id)
    result = await db.execute(
        select(func.min(Event.timestamp)).where(Event.baby_id.in_(baby_ids))
    )
    earliest = result.scalar()
    if earliest and earliest.tzinfo is None:
        earliest = earliest.replace(tzinfo=timezone.utc)
    return StatsRange(earliest=earliest)


MAX_STATS_RANGE_DAYS = 366


@router.get("/daily", response_model=list[DailyStat])
@limiter.limit(settings.rate_limit_read)
async def get_daily_stats(
    request: Request,
    from_: datetime = Query(alias="from"),
    to: datetime = Query(),
    tz: str = Query(default="UTC"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    range_days = (_utc(to) - _utc(from_)).days
    if range_days < 0:
        raise HTTPException(status_code=422, detail="'from' must not be after 'to'")
    if range_days > MAX_STATS_RANGE_DAYS:
        raise HTTPException(
            status_code=422,
            detail=f"Date range must not exceed {MAX_STATS_RANGE_DAYS} days",
        )

    baby_ids = baby_ids_for_user(current_user.id)
    zone = safe_zone(tz)

    # Fetch one extra day before/after to catch cross-day sleep sessions
    result = await db.execute(
        select(Event)
        .where(
            Event.baby_id.in_(baby_ids),
            Event.timestamp >= _utc(from_) - timedelta(days=1),
            Event.timestamp < _utc(to) + timedelta(days=1),
        )
        .order_by(Event.timestamp)
    )
    events = result.scalars().all()

    feeds_by_day: dict[date, list[datetime]] = defaultdict(list)
    outputs_by_day: dict[date, list[datetime]] = defaultdict(list)
    wet_by_day: dict[date, int] = defaultdict(int)
    dirty_by_day: dict[date, int] = defaultdict(int)
    potty_wet_by_day: dict[date, int] = defaultdict(int)
    potty_dirty_by_day: dict[date, int] = defaultdict(int)
    breast_min_by_day: dict[date, float] = defaultdict(float)
    pumped_ml_by_day: dict[date, float] = defaultdict(float)
    formula_ml_by_day: dict[date, float] = defaultdict(float)
    raw_sleep_events: list[tuple[str, datetime]] = []

    for e in events:
        ts = _utc(e.timestamp)
        day = local_date(ts, zone)
        meta = e.metadata_ or {}
        if e.type == "feed":
            feeds_by_day[day].append(ts)
            ft = meta.get("feed_type")
            if ft == "breast":
                breast_min_by_day[day] += (meta.get("left_duration_min") or 0) + (meta.get("right_duration_min") or 0)
            elif ft == "bottle":
                ml = meta.get("amount_ml") or 0
                if meta.get("bottle_type") == "formula":
                    formula_ml_by_day[day] += ml
                else:
                    pumped_ml_by_day[day] += ml  # "pumped" or legacy entries without bottle_type
        elif e.type == "output":
            outputs_by_day[day].append(ts)
            if output_wet(meta):
                wet_by_day[day] += 1
            if output_dirty(meta):
                dirty_by_day[day] += 1
            if output_at_potty(meta):
                if output_wet(meta):
                    potty_wet_by_day[day] += 1
                if output_dirty(meta):
                    potty_dirty_by_day[day] += 1
        elif e.type in ("sleep_start", "sleep_end"):
            raw_sleep_events.append((e.type, ts))

    sleep_sessions = pair_sleep_sessions(raw_sleep_events)

    from_utc = _utc(from_)
    to_utc = _utc(to)
    from_day = local_date(from_utc, zone)
    to_day   = local_date(to_utc,   zone)

    # Split each session at calendar-day boundaries so each day only counts the
    # portion of sleep that actually fell within its 00:00–24:00 window.
    sleep_by_day: dict[date, list[tuple[datetime, datetime]]] = defaultdict(list)
    for start, end in sleep_sessions:
        current = start.astimezone(zone).date()
        end_date = end.astimezone(zone).date()
        while current <= end_date:
            if from_day <= current <= to_day:
                next_day = current + timedelta(days=1)
                window_start = datetime(current.year, current.month, current.day, tzinfo=zone)
                window_end   = datetime(next_day.year, next_day.month, next_day.day, tzinfo=zone)
                clamped_start = max(start, window_start)
                clamped_end   = min(end,   window_end)
                if clamped_start < clamped_end:
                    sleep_by_day[current].append((clamped_start, clamped_end))
            current += timedelta(days=1)

    # Wake periods = gap between consecutive sessions
    wake_by_day: dict[date, list[float]] = defaultdict(list)
    for i in range(1, len(sleep_sessions)):
        prev_end   = sleep_sessions[i - 1][1]
        curr_start = sleep_sessions[i][0]
        wake_min   = (curr_start - prev_end).total_seconds() / 60
        if wake_min >= 0:
            wake_by_day[local_date(curr_start, zone)].append(wake_min)

    results: list[DailyStat] = []
    current = from_day
    while current <= to_day:
        day = current

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
                output_count=len(outputs_by_day.get(day, [])),
                wet_count=wet_by_day.get(day, 0),
                dirty_count=dirty_by_day.get(day, 0),
                potty_wet_count=potty_wet_by_day.get(day, 0),
                potty_dirty_count=potty_dirty_by_day.get(day, 0),
                breast_min=round(breast_min_by_day.get(day, 0.0), 1),
                pumped_ml=round(pumped_ml_by_day.get(day, 0.0), 1),
                formula_ml=round(formula_ml_by_day.get(day, 0.0), 1),
            )
        )
        current += timedelta(days=1)

    return results
