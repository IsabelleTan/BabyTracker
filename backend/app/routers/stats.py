from collections import defaultdict
from datetime import date as date_type, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.db.database import get_db
from app.limiter import limiter
from app.models.event import Event
from app.models.user import User
from app.models.user_baby import UserBaby
from app.utils import _utc, pair_sleep_sessions, parenting_day

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
    wet_count: int
    dirty_count: int
    breast_min: float
    bottle_ml: float


class StatsRange(BaseModel):
    earliest: datetime | None


def _baby_ids_subquery(current_user: User):
    return select(UserBaby.baby_id).where(UserBaby.user_id == current_user.id)


@router.get("/range", response_model=StatsRange)
async def get_stats_range(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    baby_ids = _baby_ids_subquery(current_user)
    result = await db.execute(
        select(func.min(Event.timestamp)).where(Event.baby_id.in_(baby_ids))
    )
    earliest = result.scalar()
    if earliest and earliest.tzinfo is None:
        earliest = earliest.replace(tzinfo=timezone.utc)
    return StatsRange(earliest=earliest)


MAX_STATS_RANGE_DAYS = 366


@router.get("/daily", response_model=list[DailyStat])
@limiter.limit("30/minute")
async def get_daily_stats(
    request: Request,
    from_: datetime = Query(alias="from"),
    to: datetime = Query(),
    tz_offset: int = Query(default=0),
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

    baby_ids = _baby_ids_subquery(current_user)

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

    feeds_by_day: dict[str, list[datetime]] = defaultdict(list)
    diapers_by_day: dict[str, list[datetime]] = defaultdict(list)
    wet_by_day: dict[str, int] = defaultdict(int)
    dirty_by_day: dict[str, int] = defaultdict(int)
    breast_min_by_day: dict[str, float] = defaultdict(float)
    bottle_ml_by_day: dict[str, float] = defaultdict(float)
    raw_sleep_events: list[tuple[str, datetime]] = []

    for e in events:
        ts = _utc(e.timestamp)
        day = parenting_day(ts, tz_offset)
        meta = e.metadata_ or {}
        if e.type == "feed":
            feeds_by_day[day].append(ts)
            ft = meta.get("feed_type")
            if ft == "breast":
                breast_min_by_day[day] += (meta.get("left_duration_min") or 0) + (meta.get("right_duration_min") or 0)
            elif ft == "bottle":
                bottle_ml_by_day[day] += meta.get("amount_ml") or 0
        elif e.type == "diaper":
            diapers_by_day[day].append(ts)
            dtype = meta.get("diaper_type", "")
            if dtype in ("wet", "both"):
                wet_by_day[day] += 1
            if dtype in ("dirty", "both"):
                dirty_by_day[day] += 1
        elif e.type in ("sleep_start", "sleep_end"):
            raw_sleep_events.append((e.type, ts))

    sleep_sessions = pair_sleep_sessions(raw_sleep_events)

    from_utc = _utc(from_)
    to_utc = _utc(to)
    from_day = parenting_day(from_utc, tz_offset)
    to_day   = parenting_day(to_utc,   tz_offset)

    # Group sessions by parenting day, clamping sessions that started before the
    # range to the first day so the first chart value isn't zero.
    sleep_by_day: dict[str, list[tuple[datetime, datetime]]] = defaultdict(list)
    for start, end in sleep_sessions:
        effective_day = parenting_day(max(start, from_utc), tz_offset)
        if from_day <= effective_day <= to_day:
            sleep_by_day[effective_day].append((start, end))

    # Wake periods = gap between consecutive sessions
    wake_by_day: dict[str, list[float]] = defaultdict(list)
    for i in range(1, len(sleep_sessions)):
        prev_end   = sleep_sessions[i - 1][1]
        curr_start = sleep_sessions[i][0]
        wake_min   = (curr_start - prev_end).total_seconds() / 60
        if wake_min >= 0:
            wake_by_day[parenting_day(curr_start, tz_offset)].append(wake_min)

    results: list[DailyStat] = []
    current  = date_type.fromisoformat(from_day)
    end_date = date_type.fromisoformat(to_day)
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
                wet_count=wet_by_day.get(day, 0),
                dirty_count=dirty_by_day.get(day, 0),
                breast_min=round(breast_min_by_day.get(day, 0.0), 1),
                bottle_ml=round(bottle_ml_by_day.get(day, 0.0), 1),
            )
        )
        current += timedelta(days=1)

    return results
