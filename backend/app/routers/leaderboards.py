from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.db.database import get_db
from app.models.event import Event
from app.models.user import User

router = APIRouter(prefix="/leaderboards", tags=["leaderboards"])


class ParentStat(BaseModel):
    display_name: str
    night_shifts: int
    total_logs: int
    poop_changes: int


class LeaderboardData(BaseModel):
    longest_sleep_min: float | None
    longest_sleep_date: str | None
    best_night_min: float | None
    best_night_date: str | None
    worst_night_min: float | None
    worst_night_date: str | None
    most_feeds_count: int | None
    most_feeds_date: str | None
    most_poop_count: int | None
    most_poop_date: str | None
    parents: list[ParentStat]


def _utc(ts: datetime) -> datetime:
    return ts if ts.tzinfo else ts.replace(tzinfo=timezone.utc)


@router.get("", response_model=LeaderboardData)
async def get_leaderboards(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    events_result = await db.execute(select(Event).order_by(Event.timestamp))
    events = events_result.scalars().all()

    users_result = await db.execute(select(User))
    users = {u.id: u.display_name for u in users_result.scalars().all()}

    # ── Sleep sessions ────────────────────────────────────────────────────────
    sleep_events: list[tuple[str, datetime]] = [
        (e.type, _utc(e.timestamp))
        for e in events
        if e.type in ("sleep_start", "sleep_end")
    ]

    sleep_sessions: list[tuple[datetime, datetime]] = []
    open_start: datetime | None = None
    for etype, ts in sleep_events:
        if etype == "sleep_start":
            open_start = ts
        elif etype == "sleep_end" and open_start is not None:
            sleep_sessions.append((open_start, ts))
            open_start = None

    # Longest single session
    longest_sleep_min: float | None = None
    longest_sleep_date: str | None = None
    if sleep_sessions:
        longest = max(sleep_sessions, key=lambda s: (s[1] - s[0]).total_seconds())
        longest_sleep_min = round((longest[1] - longest[0]).total_seconds() / 60, 1)
        longest_sleep_date = longest[0].date().isoformat()

    # Night sleep totals — night of date D = D 21:00 UTC to D+1 07:00 UTC (10 h window)
    night_sleep: dict[str, float] = defaultdict(float)
    for start, end in sleep_sessions:
        for offset in range(-1, 2):
            night_start = datetime(
                start.year, start.month, start.day, 21, 0, 0, tzinfo=timezone.utc
            ) + timedelta(days=offset)
            night_end = night_start + timedelta(hours=10)
            overlap_start = max(start, night_start)
            overlap_end = min(end, night_end)
            if overlap_end > overlap_start:
                night_sleep[night_start.date().isoformat()] += (
                    overlap_end - overlap_start
                ).total_seconds() / 60

    best_night_min: float | None = None
    best_night_date: str | None = None
    worst_night_min: float | None = None
    worst_night_date: str | None = None
    if night_sleep:
        best_night_date = max(night_sleep, key=lambda k: night_sleep[k])
        best_night_min = round(night_sleep[best_night_date], 1)
        worst_night_date = min(night_sleep, key=lambda k: night_sleep[k])
        worst_night_min = round(night_sleep[worst_night_date], 1)

    # ── Feeds per day ────────────────────────────────────────────────────────
    feeds_by_day: dict[str, int] = defaultdict(int)
    for e in events:
        if e.type == "feed":
            feeds_by_day[_utc(e.timestamp).date().isoformat()] += 1

    most_feeds_count: int | None = None
    most_feeds_date: str | None = None
    if feeds_by_day:
        most_feeds_date = max(feeds_by_day, key=lambda k: feeds_by_day[k])
        most_feeds_count = feeds_by_day[most_feeds_date]

    # ── Poop diapers per day ─────────────────────────────────────────────────
    poop_by_day: dict[str, int] = defaultdict(int)
    for e in events:
        if e.type == "diaper":
            meta = e.metadata_ or {}
            if meta.get("diaper_type") in ("dirty", "both"):
                poop_by_day[_utc(e.timestamp).date().isoformat()] += 1

    most_poop_count: int | None = None
    most_poop_date: str | None = None
    if poop_by_day:
        most_poop_date = max(poop_by_day, key=lambda k: poop_by_day[k])
        most_poop_count = poop_by_day[most_poop_date]

    # ── Parent stats ─────────────────────────────────────────────────────────
    stats: dict[str, dict] = {
        uid: {"display_name": name, "night_shifts": 0, "total_logs": 0, "poop_changes": 0}
        for uid, name in users.items()
    }

    for e in events:
        uid = e.logged_by
        if uid not in stats:
            continue
        ts = _utc(e.timestamp)
        stats[uid]["total_logs"] += 1
        if ts.hour >= 21 or ts.hour < 7:
            stats[uid]["night_shifts"] += 1
        if e.type == "diaper":
            meta = e.metadata_ or {}
            if meta.get("diaper_type") in ("dirty", "both"):
                stats[uid]["poop_changes"] += 1

    parents = [
        ParentStat(
            display_name=v["display_name"],
            night_shifts=v["night_shifts"],
            total_logs=v["total_logs"],
            poop_changes=v["poop_changes"],
        )
        for v in stats.values()
    ]

    return LeaderboardData(
        longest_sleep_min=longest_sleep_min,
        longest_sleep_date=longest_sleep_date,
        best_night_min=best_night_min,
        best_night_date=best_night_date,
        worst_night_min=worst_night_min,
        worst_night_date=worst_night_date,
        most_feeds_count=most_feeds_count,
        most_feeds_date=most_feeds_date,
        most_poop_count=most_poop_count,
        most_poop_date=most_poop_date,
        parents=parents,
    )
