from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.db.database import get_db
from app.limiter import limiter
from app.models.event import Event
from app.models.user import User
from app.models.user_baby import UserBaby
from app.utils import _utc, pair_sleep_sessions, NIGHT_SHIFT_START, NIGHT_SHIFT_END

router = APIRouter(prefix="/leaderboards", tags=["leaderboards"])


class ParentStat(BaseModel):
    display_name: str
    night_shifts: int
    total_logs: int
    poop_changes: int


class LeaderboardData(BaseModel):
    has_enough_data: bool  # True once earliest event is >= 7 days ago
    longest_sleep_min: float | None
    longest_sleep_date: str | None
    longest_sleep_new: bool
    best_night_min: float | None
    best_night_date: str | None
    best_night_new: bool
    worst_night_min: float | None
    worst_night_date: str | None
    most_feeds_count: int | None
    most_feeds_date: str | None
    most_feeds_new: bool
    most_poop_count: int | None
    most_poop_date: str | None
    most_poop_new: bool
    night_shift_claimed_today: bool
    chief_log_claimed_today: bool
    poop_award_claimed_today: bool
    parents: list[ParentStat]


def _compute_parent_stats(evts: list, users: dict[str, str]) -> dict[str, dict]:
    s = {uid: {"night_shifts": 0, "total_logs": 0, "poop_changes": 0} for uid in users}
    for e in evts:
        uid = e.logged_by
        if uid not in s:
            continue
        ts = _utc(e.timestamp)
        s[uid]["total_logs"] += 1
        if ts.hour >= NIGHT_SHIFT_START or ts.hour < NIGHT_SHIFT_END:
            s[uid]["night_shifts"] += 1
        if e.type == "diaper":
            meta = e.metadata_ or {}
            if meta.get("diaper_type") in ("dirty", "both"):
                s[uid]["poop_changes"] += 1
    return s


def _winner_uid(stats: dict[str, dict], key: str) -> str | None:
    candidates = {uid: v[key] for uid, v in stats.items() if v[key] > 0}
    return max(candidates, key=lambda uid: candidates[uid]) if candidates else None


@router.get("", response_model=LeaderboardData)
@limiter.limit("30/minute")
async def get_leaderboards(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    baby_ids = select(UserBaby.baby_id).where(UserBaby.user_id == current_user.id)
    family_user_ids = select(UserBaby.user_id).where(UserBaby.baby_id.in_(baby_ids))

    today_utc = datetime.now(timezone.utc)
    today_start = today_utc.replace(hour=0, minute=0, second=0, microsecond=0)
    today_str = today_utc.date().isoformat()

    # Cap at 4 years — the realistic maximum lifetime of this app for any family.
    # The compound index on (baby_id, timestamp) makes this range scan fast even
    # at the upper bound (~25k events).
    MAX_LEADERBOARD_DAYS = 4 * 365
    cutoff = today_utc - timedelta(days=MAX_LEADERBOARD_DAYS)
    events_result = await db.execute(
        select(Event)
        .where(Event.baby_id.in_(baby_ids), Event.timestamp >= cutoff)
        .order_by(Event.timestamp)
    )
    events = events_result.scalars().all()

    users_result = await db.execute(
        select(User).where(User.id.in_(family_user_ids))
    )
    users = {u.id: u.display_name for u in users_result.scalars().all()}

    earliest_ts = min((_utc(e.timestamp) for e in events), default=None)
    has_enough_data = (
        earliest_ts is not None and (today_utc - earliest_ts).days >= 7
    )

    # ── Sleep sessions ────────────────────────────────────────────────────────
    raw_sleep_events = [
        (e.type, _utc(e.timestamp))
        for e in events
        if e.type in ("sleep_start", "sleep_end")
    ]
    sleep_sessions = pair_sleep_sessions(raw_sleep_events)

    longest_sleep_min: float | None = None
    longest_sleep_date: str | None = None
    if sleep_sessions:
        longest = max(sleep_sessions, key=lambda s: (s[1] - s[0]).total_seconds())
        longest_sleep_min = round((longest[1] - longest[0]).total_seconds() / 60, 1)
        longest_sleep_date = longest[0].date().isoformat()

    night_sleep: dict[str, float] = defaultdict(float)
    for start, end in sleep_sessions:
        for offset in range(-1, 2):
            night_start = datetime(
                start.year, start.month, start.day, NIGHT_SHIFT_START, 0, 0, tzinfo=timezone.utc
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

    # ── Feeds per day ─────────────────────────────────────────────────────────
    feeds_by_day: dict[str, int] = defaultdict(int)
    for e in events:
        if e.type == "feed":
            feeds_by_day[_utc(e.timestamp).date().isoformat()] += 1

    most_feeds_count: int | None = None
    most_feeds_date: str | None = None
    if feeds_by_day:
        most_feeds_date = max(feeds_by_day, key=lambda k: feeds_by_day[k])
        most_feeds_count = feeds_by_day[most_feeds_date]

    # ── Poop diapers per day ──────────────────────────────────────────────────
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

    # ── Record broken today flags (suppressed until enough data) ─────────────
    longest_sleep_new = has_enough_data and longest_sleep_date == today_str
    best_night_new = has_enough_data and best_night_date == today_str
    most_feeds_new = has_enough_data and most_feeds_date == today_str
    most_poop_new = has_enough_data and most_poop_date == today_str

    # ── Award claimed today (suppressed until enough data) ────────────────────
    curr_stats = _compute_parent_stats(events, users)
    prev_events = [e for e in events if _utc(e.timestamp) < today_start]
    prev_stats = _compute_parent_stats(prev_events, users)

    def award_claimed(key: str) -> bool:
        if not has_enough_data:
            return False
        curr = _winner_uid(curr_stats, key)
        prev = _winner_uid(prev_stats, key)
        return curr is not None and curr != prev

    night_shift_claimed_today = award_claimed("night_shifts")
    chief_log_claimed_today = award_claimed("total_logs")
    poop_award_claimed_today = award_claimed("poop_changes")

    # ── Parent stats for display ──────────────────────────────────────────────
    parents = [
        ParentStat(
            display_name=users[uid],
            night_shifts=v["night_shifts"],
            total_logs=v["total_logs"],
            poop_changes=v["poop_changes"],
        )
        for uid, v in curr_stats.items()
        if uid in users
    ]

    return LeaderboardData(
        has_enough_data=has_enough_data,
        longest_sleep_min=longest_sleep_min,
        longest_sleep_date=longest_sleep_date,
        longest_sleep_new=longest_sleep_new,
        best_night_min=best_night_min,
        best_night_date=best_night_date,
        best_night_new=best_night_new,
        worst_night_min=worst_night_min,
        worst_night_date=worst_night_date,
        most_feeds_count=most_feeds_count,
        most_feeds_date=most_feeds_date,
        most_feeds_new=most_feeds_new,
        most_poop_count=most_poop_count,
        most_poop_date=most_poop_date,
        most_poop_new=most_poop_new,
        night_shift_claimed_today=night_shift_claimed_today,
        chief_log_claimed_today=chief_log_claimed_today,
        poop_award_claimed_today=poop_award_claimed_today,
        parents=parents,
    )
