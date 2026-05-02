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
from app.utils import _utc, local_date, output_dirty, output_at_potty, output_at_accident, output_wet, pair_sleep_sessions, safe_zone

router = APIRouter(prefix="/stats", tags=["stats"])


def _percentiles(values: list[float], ps: list[float]) -> list[float | None]:
    if not values:
        return [None] * len(ps)
    s = sorted(values)
    n = len(s)
    result = []
    for p in ps:
        idx = p / 100 * (n - 1)
        lo = int(idx)
        hi = min(lo + 1, n - 1)
        result.append(round(s[lo] + (s[hi] - s[lo]) * (idx - lo), 1))
    return result


class DailyStat(BaseModel):
    date: date
    feed_count: int
    median_feed_interval_min: float | None
    feed_intervals_min: list[float]
    total_sleep_min: int
    sleep_session_count: int
    median_sleep_session_min: float | None
    sleep_session_durations_min: list[float]
    median_wake_min: float | None
    wake_durations_min: list[float]
    output_count: int
    wet_count: int
    dirty_count: int
    potty_wet_count: int
    potty_dirty_count: int
    accident_wet_count: int
    accident_dirty_count: int
    breast_min: float
    pumped_ml: float
    formula_ml: float


class SummaryValue(BaseModel):
    current: float
    average: float

class SummaryStatsResponse(BaseModel):
    breast_min: SummaryValue
    pumped_ml: SummaryValue
    formula_ml: SummaryValue
    wet: SummaryValue
    dirty: SummaryValue
    sleep_min: SummaryValue

class StatsRange(BaseModel):
    earliest: datetime | None

class StreakStats(BaseModel):
    current_potty_streak: int
    total_potty_events: int
    days_logged_total: int



@router.get("/streaks", response_model=StreakStats)
@limiter.limit(settings.rate_limit_read)
async def get_streak_stats(
    request: Request,
    tz: str = Query(default="UTC"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    baby_ids = baby_ids_for_user(current_user.id)
    zone = safe_zone(tz)

    result = await db.execute(
        select(Event)
        .where(Event.baby_id.in_(baby_ids))
        .order_by(Event.timestamp)
    )
    events = result.scalars().all()

    today = local_date(datetime.now(timezone.utc), zone)
    yesterday = today - timedelta(days=1)

    potty_days: set[date] = set()
    total_potty_events = 0
    event_days: set[date] = set()

    for e in events:
        day = local_date(e.timestamp, zone)
        event_days.add(day)
        if e.type == "output":
            meta = e.metadata_ or {}
            if output_at_potty(meta):
                potty_days.add(day)
                total_potty_events += 1

    current_potty_streak = 0
    if potty_days:
        past_days = {d for d in potty_days if d <= today}
        if past_days:
            most_recent = max(past_days)
            if most_recent >= yesterday:
                streak = 1
                check = most_recent - timedelta(days=1)
                while check in potty_days:
                    streak += 1
                    check -= timedelta(days=1)
                current_potty_streak = streak

    return StreakStats(
        current_potty_streak=current_potty_streak,
        total_potty_events=total_potty_events,
        days_logged_total=len(event_days),
    )


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


@router.get("/summary", response_model=SummaryStatsResponse)
@limiter.limit(settings.rate_limit_read)
async def get_summary_stats(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns rolling-window stats matching the frontend 'Past 24h' display.
    current = the most recent 24h window [now-24h, now].
    average = mean across 7 non-overlapping 24h windows going back 8 days,
              capped to however many days of history actually exist.
    """
    baby_ids = baby_ids_for_user(current_user.id)
    now = datetime.now(timezone.utc)

    # Fetch 8+ days so we have data for 7 historical windows; extra day for sleep sessions
    # that started before the oldest window boundary.
    fetch_from = now - timedelta(days=9)
    result = await db.execute(
        select(Event)
        .where(
            Event.baby_id.in_(baby_ids),
            Event.timestamp >= fetch_from,
            Event.timestamp <= now,
        )
        .order_by(Event.timestamp)
    )
    events = result.scalars().all()

    raw_sleep_events: list[tuple[str, datetime]] = [(e.type, _utc(e.timestamp))
                                                     for e in events
                                                     if e.type in ("sleep_start", "sleep_end")]
    sleep_sessions = pair_sleep_sessions(raw_sleep_events)

    def window_totals(win_start: datetime, win_end: datetime) -> tuple[float, float, float, float, float, float]:
        breast = pumped = formula = wet = dirty = 0.0
        for e in events:
            ts = _utc(e.timestamp)
            if not (win_start <= ts < win_end):
                continue
            meta = e.metadata_ or {}
            if e.type == "feed":
                breast += (meta.get("breast_left_min") or 0) + (meta.get("breast_right_min") or 0)
                pumped += meta.get("pumped_ml") or 0
                formula += meta.get("formula_ml") or 0
            elif e.type == "output":
                if output_wet(meta):
                    wet += 1
                if output_dirty(meta):
                    dirty += 1
        sleep = 0.0
        for start, end in sleep_sessions:
            clamped_start = max(start, win_start)
            clamped_end = min(end, win_end)
            if clamped_start < clamped_end:
                sleep += (clamped_end - clamped_start).total_seconds() / 60
        return breast, pumped, formula, wet, dirty, sleep

    # current = last 24h
    current = window_totals(now - timedelta(days=1), now)

    # historical windows: d=1 → [now-48h, now-24h], d=2 → [now-72h, now-48h], ...
    if events:
        oldest_ts = min(_utc(e.timestamp) for e in events)
        history_len = min(int((now - oldest_ts).total_seconds() / 86400), 7)
    else:
        history_len = 0

    history: list[tuple[float, ...]] = []
    for d in range(1, history_len + 1):
        win_end = now - timedelta(days=d)
        win_start = now - timedelta(days=d + 1)
        history.append(window_totals(win_start, win_end))

    def _avg(idx: int) -> float:
        if not history:
            return 0.0
        return round(sum(h[idx] for h in history) / len(history), 1)

    return SummaryStatsResponse(
        breast_min=SummaryValue(current=round(current[0], 1), average=_avg(0)),
        pumped_ml=SummaryValue(current=round(current[1], 1), average=_avg(1)),
        formula_ml=SummaryValue(current=round(current[2], 1), average=_avg(2)),
        wet=SummaryValue(current=current[3], average=_avg(3)),
        dirty=SummaryValue(current=current[4], average=_avg(4)),
        sleep_min=SummaryValue(current=round(current[5], 1), average=_avg(5)),
    )


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
    accident_wet_by_day: dict[date, int] = defaultdict(int)
    accident_dirty_by_day: dict[date, int] = defaultdict(int)
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
            breast_min_by_day[day] += (meta.get("breast_left_min") or 0) + (meta.get("breast_right_min") or 0)
            pumped_ml_by_day[day] += meta.get("pumped_ml") or 0
            formula_ml_by_day[day] += meta.get("formula_ml") or 0
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
            if output_at_accident(meta):
                if output_wet(meta):
                    accident_wet_by_day[day] += 1
                if output_dirty(meta):
                    accident_dirty_by_day[day] += 1
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
        feed_intervals: list[float] = []
        if len(feed_times) >= 2:
            feed_intervals = [
                (feed_times[i] - feed_times[i - 1]).total_seconds() / 60
                for i in range(1, len(feed_times))
            ]

        sessions = sleep_by_day.get(day, [])
        session_durations = [(e - s).total_seconds() / 60 for s, e in sessions]
        total_sleep_min = sum(session_durations)

        wakes = wake_by_day.get(day, [])

        [median_feed] = _percentiles(feed_intervals, [50])
        [median_session] = _percentiles(session_durations, [50])
        [median_wake] = _percentiles(wakes, [50])

        results.append(
            DailyStat(
                date=day,
                feed_count=len(feed_times),
                median_feed_interval_min=median_feed,
                feed_intervals_min=feed_intervals,
                total_sleep_min=round(total_sleep_min),
                sleep_session_count=len(sessions),
                median_sleep_session_min=median_session,
                sleep_session_durations_min=session_durations,
                median_wake_min=median_wake,
                wake_durations_min=wakes,
                output_count=len(outputs_by_day.get(day, [])),
                wet_count=wet_by_day.get(day, 0),
                dirty_count=dirty_by_day.get(day, 0),
                potty_wet_count=potty_wet_by_day.get(day, 0),
                potty_dirty_count=potty_dirty_by_day.get(day, 0),
                accident_wet_count=accident_wet_by_day.get(day, 0),
                accident_dirty_count=accident_dirty_by_day.get(day, 0),
                breast_min=round(breast_min_by_day.get(day, 0.0), 1),
                pumped_ml=round(pumped_ml_by_day.get(day, 0.0), 1),
                formula_ml=round(formula_ml_by_day.get(day, 0.0), 1),
            )
        )
        current += timedelta(days=1)

    return results
